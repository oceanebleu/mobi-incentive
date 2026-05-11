// ─────────────────────────────────────────────────────────────
// lib/google-sheets.ts
// 서비스계정 JWT로 Google Sheets API 직접 호출 (의존성 없음)
// 필요 환경변수:
//   - GOOGLE_SERVICE_ACCOUNT_EMAIL      서비스계정 이메일
//   - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  private_key (개행 \n 이스케이프 OK)
//   - GOOGLE_SHEETS_SHEET_ID            대상 스프레드시트 ID
// ─────────────────────────────────────────────────────────────

import crypto from 'crypto';

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
  const privateKey = rawKey.replace(/\\n/g, '\n');

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
    crypto.sign('RSA-SHA256', Buffer.from(unsigned), privateKey)
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

// information_employees 시트를 1행=헤더 가정으로 객체 배열로 변환
// A=사번 B=사원명 C=법인/그룹 D=소속1 E=소속2 F=재직상태 G=입사일 H=마지막근무일 I=서류상퇴사일 J=회사이메일
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
}

export async function fetchEmployees(): Promise<EmployeeRow[]> {
  const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
  if (!sheetId) {
    throw new Error('GOOGLE_SHEETS_SHEET_ID 환경변수가 필요합니다.');
  }
  // 헤더 행 제외하고 2행부터, A~J 전체
  const rows = await fetchSheetValues(sheetId, 'information_employees!A2:J');
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
    }));
}
