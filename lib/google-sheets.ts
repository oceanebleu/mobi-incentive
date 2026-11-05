// ─────────────────────────────────────────────────────────────
// lib/google-sheets.ts
// 서비스계정 JWT로 Google Sheets API 직접 호출 (의존성 없음)
// 필요 환경변수:
//   - GOOGLE_SERVICE_ACCOUNT_EMAIL      서비스계정 이메일
//   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  private_key (개행 \n 이스케이프 OK)
//   - GOOGLE_SHEETS_SHEET_ID            대상 스프레드시트 ID
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto';
import { normalizeCategory } from './csv';

const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

// base64url (Node 16+ Buffer 지원, 폴리필 포함)
function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf
    .toString('base64')
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

let cachedToken: { value: string; exp: number } | null = null;

// 환경변수에 들어간 private_key 를 안전하게 PEM 으로 정규화
//   - 양 끝 따옴표 제거 (JSON 파일에서 그대로 복붙한 경우)
//   - "\n" 리터럴 → 실제 개행
//   - \r 제거 (Windows 줄바꿈 잔재)
//   - BOM/공백 trim
//   - 끝에 개행 보장
function normalizePrivateKey(raw: string): string {
  let key = raw;
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1);
  }
  key = key
    .replace(/^﻿/, '')   // BOM
    .replace(/\\n/g, '\n')    // literal \n → newline
    .replace(/\r/g, '')       // strip CR
    .trim();
  if (!key.endsWith('\n')) key += '\n';
  return key;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp - 60 > Math.floor(Date.now() / 1000)) {
    return cachedToken.value;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Google 서비스계정 환경변수가 없습니다 (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).'
    );
  }

  const privateKeyPem = normalizePrivateKey(rawKey);

  // PEM 형식 사전 검증 — 에러 메시지를 더 명확하게
  if (!privateKeyPem.includes('-----BEGIN') || !privateKeyPem.includes('PRIVATE KEY-----')) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY 가 PEM 형식이 아닙니다. ' +
      '값이 "-----BEGIN PRIVATE KEY-----"로 시작하고 "-----END PRIVATE KEY-----"로 끝나야 합니다. ' +
      '(JSON 파일에서 복붙했다면 따옴표·줄바꿈 처리를 확인하세요)'
    );
  }

  // KeyObject 로 먼저 파싱해서 진단 가능한 에러로 변환
  let keyObject: crypto.KeyObject;
  try {
    keyObject = crypto.createPrivateKey({ key: privateKeyPem, format: 'pem' });
  } catch (e: any) {
    throw new Error(
      `private_key 파싱 실패: ${e?.message ?? e}. ` +
      '환경변수에 따옴표·이스케이프(\\n)·CR(\\r)이 잘못 들어갔을 가능성이 큽니다. ' +
      '값을 다시 확인해주세요 (key 길이=' + privateKeyPem.length + ' chars).'
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(
    JSON.stringify({
      iss: email,
      scope: SCOPES,
      aud: TOKEN_URL,
      exp: now + 3600,
      iat: now,
    })
  );
  const unsigned = `${header}.${claim}`;
  const signature = b64url(
    crypto.sign('RSA-SHA256', Buffer.from(unsigned), keyObject)
  );
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google 토큰 교환 실패: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    exp: now + (json.expires_in ?? 3600),
  };
  return json.access_token;
}

// 시트의 특정 범위를 2차원 문자열 배열로 가져옴
export async function fetchSheetValues(
  spreadsheetId: string,
  range: string,
): Promise<string[][]> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    // Next.js 서버에서 호출 — 캐시 끔
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API 호출 실패: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

// 스프레드시트의 탭 이름 목록만 가져옴 (fields=sheets.properties.title 로 페이로드 최소화)
export async function fetchSheetTitles(spreadsheetId: string): Promise<string[]> {
  const token = await getAccessToken();
  const url = `${SHEETS_BASE}/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets 메타데이터 조회 실패: ${res.status} ${body}`);
  }
  const json = (await res.json()) as { sheets?: Array<{ properties?: { title?: string } }> };
  return (json.sheets ?? [])
    .map(s => s.properties?.title ?? '')
    .filter(Boolean);
}

// information_employees 시트를 1행=헤더 가정으로 객체 배열로 변환
// A=사번 B=사원명 C=법인/그룹 D=소속1 E=소속2 F=재직상태 G=입사일 H=마지막근무일 I=서류상퇴사일 J=회사이메일 K=PL고유코드
export interface EmployeeRow {
  employee_id: string;
  name: string;
  corp_group: string | null;
  affiliation1: string | null;
  affiliation2: string | null;
  status: string | null;
  hire_date: string | null;
  last_work_date: string | null;
  resignation_date: string | null;
  email: string | null;
  access_code: string | null; // K열 (대문자 5자: 알파벳3+숫자2)
}

export async function fetchEmployees(): Promise<EmployeeRow[]> {
  const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEETS_SHEET_ID 환경변수가 필요합니다.');
  }
  // 헤더 행 제외하고 2행부터, A~K 전체 (K=PL 고유코드)
  const rows = await fetchSheetValues(sheetId, 'information_employees!A2:K');
  const norm = (v: string | undefined) => {
    const t = (v ?? '').trim();
    return t === '' ? null : t;
  };
  return rows
    .filter(r => (r[0] ?? '').trim() !== '') // 사번 비어있으면 스킵
    .map<EmployeeRow>(r => ({
      employee_id: (r[0] ?? '').trim(),
      name: (r[1] ?? '').trim(),
      corp_group: norm(r[2]),
      affiliation1: norm(r[3]),
      affiliation2: norm(r[4]),
      status: norm(r[5]),
      hire_date: norm(r[6]),
      last_work_date: norm(r[7]),
      resignation_date: norm(r[8]),
      email: norm(r[9])?.toLowerCase() ?? null,
      // K열 — 공백 제거 + 대문자 통일. 빈 칸이면 null (sync 라우트에서 자동 발급)
      access_code: (() => {
        const raw = norm(r[10]);
        return raw ? raw.toUpperCase() : null;
      })(),
    }));
}

// ─── 제안 자료 아카이브 ('수주인센티브 대상' 시트) ──────────────
//
// A:T 구조, 2행부터 데이터. B열(대상여부)이 '대상' 인 행만 의미가 있음 — caller 측에서 필터.
// 사용하는 열만 읽어온다 (나머지 열은 인센티브 산정과 무관):
//   A 기회ID / B 대상여부 / C 광고주명 / D 구분 / E 산업군 / F 담당팀 / G PL명 /
//   I 제품 / K 제출일 / L 취급고(R값) / M 수수료율 / N 영업수익 / Q 결과
// 자세한 매핑은 schema.sql 의 proposal_archive 테이블 정의 참조.

export interface ProposalArchiveRow {
  opportunity_id: string;           // A — upsert 키 (시트의 행 식별자)
  needs_committee: boolean;         // B '대상여부' = '대상'
  client_name: string;              // C 광고주명
  category: string | null;          // D 구분 (신규/연장)
  industry: string | null;          // E 산업군
  teams: string[];                  // F 담당팀
  pl: string | null;                // G PL명
  proposal_types: string[];         // I 제품
  proposal_at: string | null;       // K 제출일
  r_value: number | null;           // L 취급고 (= R값)
  commission: number | null;        // M 수수료율
  expected_revenue: number | null;  // N 영업수익 (수수료)
  bidding_status: string | null;    // Q 결과 (수주성공/제안드랍/수주실패)
}

// B열 '대상여부' — '대상' 이면 true, '비대상'·공백이면 false
function asTargetFlag(v: string | undefined): boolean {
  const t = (v ?? '').replace(/\s/g, '');
  if (!t) return false;
  if (t.includes('비대상')) return false;
  return t.includes('대상');
}

// "1,234,567원" / "₩1,234,567" / "1234567.5" → 정수 (소수점은 반올림)
function asMoney(v: string | undefined): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const cleaned = t.replace(/[^0-9.\-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// "15%" / "15.00%" → 0.15, "0.15" → 0.15, "15" → 0.15
//   (셀 서식에 따라 Sheets API 가 '%' 포함 문자열 또는 소수를 돌려주므로 둘 다 수용)
function asPercent(v: string | undefined): number | null {
  const t = (v ?? '').trim();
  if (!t) return null;
  const hasPct = t.includes('%');
  const n = Number(t.replace(/[%\s,]/g, ''));
  if (!Number.isFinite(n)) return null;
  if (hasPct) return n / 100;
  return Math.abs(n) < 1 ? n : n / 100;
}

function asDate(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  if (!t || t === '미정' || t === '미지급' || t === '미진행') return null;
  // "2026-04-24" 또는 "2026. 4. 24" / "2026.4.24" 식
  const m = t.match(/^(\d{4})[.\-\/](\s*\d{1,2})[.\-\/](\s*\d{1,2})/);
  if (!m) return null;
  const y = m[1];
  const mo = String(parseInt(m[2], 10)).padStart(2, '0');
  const d = String(parseInt(m[3], 10)).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function asMulti(v: string | undefined): string[] {
  const t = (v ?? '').trim();
  if (!t) return [];
  // 콤마/슬래시/세미콜론으로 split
  return t
    .split(/[,/;]/)
    .map(s => s.trim())
    .filter(Boolean);
}

// 제품(I열) 전용 — 'AEO/GEO' 처럼 제품명 자체에 슬래시가 들어가므로
// 슬래시는 구분자로 쓰지 않고 콤마/세미콜론만 사용한다.
function asProducts(v: string | undefined): string[] {
  const t = (v ?? '').trim();
  if (!t) return [];
  return t
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function nullableText(v: string | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

export async function fetchProposalArchive(): Promise<ProposalArchiveRow[]> {
  const sheetId = process.env.GOOGLE_SHEETS_ARCHIVE_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEETS_ARCHIVE_SHEET_ID 환경변수가 필요합니다.');
  }
  // 헤더 행(1행) 제외, 2행부터 A~T
  // 탭 이름: '수주인센티브 대상' (공백 포함 — Sheets API는 따옴표로 감싸야 함)
  const rows = await fetchSheetValues(sheetId, "'수주인센티브 대상'!A2:T");

  const out: ProposalArchiveRow[] = [];
  for (const r of rows) {
    const opportunityId = (r[0] ?? '').trim();   // A
    const clientName    = (r[2] ?? '').trim();   // C
    // 기회ID(=upsert 키) 또는 광고주가 없는 행은 스킵
    if (!opportunityId || !clientName) continue;

    out.push({
      opportunity_id:   opportunityId,                           // A 기회ID
      needs_committee:  asTargetFlag(r[1]),                      // B 대상여부
      client_name:      clientName,                              // C 광고주명
      category:         normalizeCategory(nullableText(r[3])),   // D 구분 — '신규(운영경험 X)' 등 변형 → '신규'/'연장' 통일
      industry:         nullableText(r[4]),                      // E 산업군
      teams:            asMulti(r[5]),                           // F 담당팀
      pl:               nullableText(r[6]),                      // G PL명
      proposal_types:   asProducts(r[8]),                        // I 제품 ('AEO/GEO' 는 1개 제품)
      proposal_at:      asDate(r[10]),                           // K 제출일
      r_value:          asMoney(r[11]),                          // L 취급고 (= R값)
      commission:       asPercent(r[12]),                        // M 수수료율
      expected_revenue: asMoney(r[13]),                          // N 영업수익
      bidding_status:   nullableText(r[16]),                     // Q 결과
    });
  }
  return out;
}

