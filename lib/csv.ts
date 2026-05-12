// ─────────────────────────────────────────────────────────────
// lib/csv.ts
// CSV 파싱 + 셀 단위 정규화 + 시트별 row 변환기
//
// 처리 규칙
//   - 금액 "₩600,000,000" → 600000000 (₩, 쉼표, 공백 제거)
//   - 퍼센트 "15.00%" → 0.15
//   - 날짜 "2025. 8. 8" / "2025-08-08" / "2025. 08. 08" → "2025-08-08"
//   - Boolean "TRUE"/"FALSE"/"V" → boolean
//   - 빈셀 → null
// ─────────────────────────────────────────────────────────────

// RFC 4180 호환 파서 (따옴표·줄바꿈·이스케이프 처리)
export function parseCSV(text: string): string[][] {
  // 앞쪽 BOM 제거
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\r') {
        // \r\n 또는 \r 단독 — \n 처리에 맡김
        if (text[i + 1] === '\n') {
          // 다음 루프에서 \n 처리
        } else {
          row.push(cell);
          rows.push(row);
          row = [];
          cell = '';
        }
      } else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += c;
      }
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // 끝부분 완전 빈 줄 제거
  while (rows.length > 0 && rows[rows.length - 1].every(c => c.trim() === '')) {
    rows.pop();
  }
  return rows;
}

// 셀 정규화: trim + 빈문자 → null
export function cleanCell(v: string | undefined): string | null {
  if (v == null) return null;
  const t = v.trim().replace(/^"|"$/g, '').trim();
  return t === '' ? null : t;
}

// 금액: "₩600,000,000" / "₩ 600,000,000 " / "600,000,000" → 600000000
export function parseMoney(v: string | undefined): number | null {
  const t = cleanCell(v);
  if (!t) return null;
  // ₩, W, 쉼표, 공백 제거. 마이너스/괄호 허용.
  const digits = t.replace(/[₩\\W\s,]/gi, '');
  if (digits === '' || digits === '-' || digits === '0') {
    // 명시적 0과 그냥 빈건 구분: 위 cleanCell에서 빈건 null로 빠져나감
    if (t.replace(/\s/g, '') === '0' || t.endsWith('0')) return 0;
    return null;
  }
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// 퍼센트: "15.00%" → 0.15. "15.00"만 와도 15% 가정
export function parsePercentAsFraction(v: string | undefined): number | null {
  const t = cleanCell(v);
  if (!t) return null;
  const hasPct = t.includes('%');
  const n = Number(t.replace(/[%\s,]/g, ''));
  if (!Number.isFinite(n)) return null;
  return hasPct ? n / 100 : n / 100;
}

// 정수 퍼센트: "60%" → 60, "60" → 60
export function parsePercentAsInt(v: string | undefined): number | null {
  const t = cleanCell(v);
  if (!t) return null;
  const n = Number(t.replace(/[%\s,]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

// 날짜: 다양한 한국식 표기를 YYYY-MM-DD로 정규화
// 허용 형식: "2025. 8. 8", "2025. 08. 08", "2025-08-08", "2025/8/8", "2025.8.8"
export function parseDate(v: string | undefined): string | null {
  const t = cleanCell(v);
  if (!t) return null;
  if (t === '미지급' || t === '미정' || t === '대화종료') return null;
  // "2025. 8. 8" → ["2025", "8", "8"]
  const m = t.match(/^(\d{4})[.\-\/](\s*\d{1,2})[.\-\/](\s*\d{1,2})$/);
  if (!m) return null;
  const y = m[1];
  const mo = String(parseInt(m[2], 10)).padStart(2, '0');
  const d = String(parseInt(m[3], 10)).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

// Boolean: "TRUE"/"FALSE"/"V"/"1"/"0"/"Y"/"N"
export function parseBoolean(v: string | undefined): boolean {
  const t = (cleanCell(v) ?? '').toUpperCase();
  return t === 'TRUE' || t === 'V' || t === '1' || t === 'Y' || t === 'YES' || t === 'O';
}

// 이름 정규화: "Creative. Lab" / "Creative.Lab" → "Creative.Lab"
//   - 공백 통일 (연속 공백 → 1칸, 점 뒤 공백 제거)
export function normalizeName(v: string | undefined): string | null {
  const t = cleanCell(v);
  if (!t) return null;
  return t.replace(/\.\s+/g, '.').replace(/\s+/g, ' ').trim();
}

// "Creative.Lab" 류 — 사람 이름이 아닌 팀 계정으로 판단
const TEAM_ACCOUNT_PATTERNS = [
  /^Creative\.Lab$/i,
  /^Marketing\d+\.Lab$/i,
  /lab$/i, // 마지막이 Lab으로 끝나는 모든 계정
];
export function isTeamAccountName(name: string): boolean {
  return TEAM_ACCOUNT_PATTERNS.some(re => re.test(name));
}

// ─────────────────────────────────────────────────────────────
// 시트별 row 변환기
// ─────────────────────────────────────────────────────────────

// [RAW] 제안서 → ProposalInput
//
// 컬럼 (1행 헤더 무시, 데이터는 4행부터 시작 — 상단 3행은 그룹/구분/소제목)
//   A 운영위원회진행여부(상단 그룹) — 무시
//   B 사후처리여부
//   C 운영위원회진행여부 ← 승격 토글
//   D 빌딩현황
//   E 광고주
//   F 인사이즈
//   G 제출일
//   H PT일
//   I 결과발행일
//   J 연장/신규
//   K 담당팀
//   L PL
//   M R값
//   N 수수료
//   O 주가공제
//   P 진행상황
export interface ProposalInput {
  is_archived: boolean;
  post_status: string | null;
  promote_to_project: boolean;
  bidding_status: string | null;
  client_name: string;
  agency: string | null;
  submitted_at: string | null;
  pt_at: string | null;
  result_at: string | null;
  category: string | null;
  team: string | null;
  pl: string | null;
  r_value: number | null;
  commission: number | null;
  pre_review_marked: boolean;
  progress_note: string | null;
}

export function parseProposalRows(rows: string[][]): {
  proposals: ProposalInput[];
  errors: { rowIndex: number; reason: string }[];
} {
  const proposals: ProposalInput[] = [];
  const errors: { rowIndex: number; reason: string }[] = [];

  // 데이터 시작 행 탐색: B열에 '사후처리여부' 또는 'B'~'P' 헤더가 있는 행 다음
  let startIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] ?? [];
    // C열 헤더가 '운영위원회 진행여부' 같은 텍스트면 그 다음 행부터 데이터
    if ((cleanCell(row[2]) ?? '').includes('진행여부') &&
        (cleanCell(row[3]) ?? '').includes('빌딩')) {
      startIdx = i + 1;
      break;
    }
    // 또는 첫 컬럼이 'FALSE'/'TRUE'면 데이터 라인
    if ((cleanCell(row[0]) ?? '') === 'FALSE' || (cleanCell(row[0]) ?? '') === 'TRUE') {
      startIdx = i;
      break;
    }
  }

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const clientName = cleanCell(r[4]);
    if (!clientName) continue; // 빈 줄 스킵

    try {
      proposals.push({
        is_archived: parseBoolean(r[0]),
        post_status: cleanCell(r[1]),
        promote_to_project: parseBoolean(r[2]),
        bidding_status: cleanCell(r[3]),
        client_name: clientName,
        agency: cleanCell(r[5]),
        submitted_at: parseDate(r[6]),
        pt_at: parseDate(r[7]),
        result_at: parseDate(r[8]),
        category: cleanCell(r[9]),
        team: cleanCell(r[10]),
        pl: cleanCell(r[11]),
        r_value: parseMoney(r[12]),
        commission: parsePercentAsFraction(r[13]),
        pre_review_marked: parseBoolean(r[14]),
        progress_note: cleanCell(r[15]),
      });
    } catch (e: any) {
      errors.push({ rowIndex: i + 1, reason: e?.message ?? 'parse error' });
    }
  }

  return { proposals, errors };
}

// 수주인센티브운영관리 → ProjectInput
//
//   A 프로젝트번호 / B 광고주 / C 운영위시트 / D R값 / E 수수료 / F 담당팀 / G PL /
//   H 제출일 / I 배포진행여부 / J 배포일 / K 프로젝트현황 / L PL작성완료 / M 사후확정 /
//   N 인센티브재원 / O 1차예정일 / P 1차비율 / Q 1차완료 / R 2차예정일 / S 2차비율 /
//   T 2차완료 / U 캠페인종료예정 / V 구분 / W 지급특이사항
export interface ProjectInput {
  id: string;
  campaign_name: string;
  committee_sheet_link: string | null;
  r_value: number | null;
  commission: number | null;
  team: string | null;
  pl: string | null;
  submitted_at: string | null;
  distributed: boolean;
  distributed_at: string | null;
  acquisition_status: 'WON' | 'LOST' | 'CANCELLED' | 'PENDING' | 'REVIEWING' | 'RESULT_PENDING' | null;
  pl_completed: boolean;
  fund_confirmed: boolean;
  incentive_fund: number;
  first_payment_date: string | null;
  first_payment_ratio: number | null;
  first_payment_completed: boolean;
  second_payment_date: string | null;
  second_payment_ratio: number | null;
  second_payment_completed: boolean;
  campaign_end_date: string | null;
  category: string | null;
  note: string | null;
}

function mapAcquisitionStatus(raw: string | null): ProjectInput['acquisition_status'] {
  if (!raw) return null;
  const t = raw.replace(/\s/g, '');
  if (t.includes('수주성공')) return 'WON';
  if (t.includes('수주실패')) return 'LOST';
  if (t.includes('대화종료') || t.includes('대화종결')) return 'CANCELLED';
  if (t.includes('결과대기') || t.includes('결과반영')) return 'RESULT_PENDING';
  if (t.includes('검토대기') || t.includes('제안진행') || t.includes('제안작성') || t.includes('제안대기')) {
    return 'REVIEWING';
  }
  return 'PENDING';
}

export function parseProjectRows(rows: string[][]): {
  projects: ProjectInput[];
  errors: { rowIndex: number; reason: string }[];
} {
  const projects: ProjectInput[] = [];
  const errors: { rowIndex: number; reason: string }[] = [];

  let startIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 8); i++) {
    const r = rows[i] ?? [];
    // 첫 컬럼이 PROPJ... 형식이면 데이터 시작
    if (/^PROPJ\d+/.test(cleanCell(r[0]) ?? '')) {
      startIdx = i;
      break;
    }
  }

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const id = cleanCell(r[0]);
    const campaign = cleanCell(r[1]);
    if (!id || !campaign) continue;

    try {
      projects.push({
        id,
        campaign_name: campaign,
        committee_sheet_link: cleanCell(r[2]),
        r_value: parseMoney(r[3]),
        commission: parsePercentAsFraction(r[4]),
        team: cleanCell(r[5]),
        pl: cleanCell(r[6]),
        submitted_at: parseDate(r[7]),
        distributed: parseBoolean(r[8]),
        distributed_at: parseDate(r[9]),
        acquisition_status: mapAcquisitionStatus(cleanCell(r[10])),
        pl_completed: parseBoolean(r[11]),
        fund_confirmed: parseBoolean(r[12]),
        incentive_fund: parseMoney(r[13]) ?? 0,
        first_payment_date: parseDate(r[14]),
        first_payment_ratio: parsePercentAsInt(r[15]),
        first_payment_completed: parseBoolean(r[16]),
        second_payment_date: parseDate(r[17]),
        second_payment_ratio: parsePercentAsInt(r[18]),
        second_payment_completed: parseBoolean(r[19]),
        campaign_end_date: parseDate(r[20]),
        category: cleanCell(r[21]),
        note: cleanCell(r[22]),
      });
    } catch (e: any) {
      errors.push({ rowIndex: i + 1, reason: e?.message ?? 'parse error' });
    }
  }

  return { projects, errors };
}

// 개인별 인센티브 지급액 → ProjectMemberInput
//
// 좌측 RAWDATA 영역:
//   A (빈셀) / B 사원명 / C 프로젝트명 / D 기여도 / E 인센티브재원 /
//   F 1차지급액 / G 1차지급일 / H 2차지급액 / I 2차지급일
export interface ProjectMemberInput {
  member_name: string;
  project_campaign_name: string; // 나중에 projects.id로 lookup
  contribution: number;
  incentive_amount: number | null;
  first_amount: number;
  first_paid_at: string | null;
  second_amount: number;
  second_paid_at: string | null;
}

export function parseProjectMemberRows(rows: string[][]): {
  members: ProjectMemberInput[];
  errors: { rowIndex: number; reason: string }[];
} {
  const members: ProjectMemberInput[] = [];
  const errors: { rowIndex: number; reason: string }[] = [];

  // 헤더 행 탐색: B열에 '사원명', C열에 '프로젝트명'이 들어간 행
  let startIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const r = rows[i] ?? [];
    if ((cleanCell(r[1]) ?? '') === '사원명' && (cleanCell(r[2]) ?? '').includes('프로젝트')) {
      startIdx = i + 1;
      break;
    }
  }

  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const memberName = normalizeName(r[1]);
    const projectName = cleanCell(r[2]);
    if (!memberName || !projectName) continue;

    const contribution = parsePercentAsFraction(r[3]);
    if (contribution == null) {
      errors.push({ rowIndex: i + 1, reason: `기여도 파싱 실패: "${r[3]}"` });
      continue;
    }

    try {
      members.push({
        member_name: memberName,
        project_campaign_name: projectName,
        contribution: contribution * 100, // 0.25 → 25
        incentive_amount: parseMoney(r[4]),
        first_amount: parseMoney(r[5]) ?? 0,
        first_paid_at: parseDate(r[6]),
        second_amount: parseMoney(r[7]) ?? 0,
        second_paid_at: parseDate(r[8]),
      });
    } catch (e: any) {
      errors.push({ rowIndex: i + 1, reason: e?.message ?? 'parse error' });
    }
  }

  return { members, errors };
}
