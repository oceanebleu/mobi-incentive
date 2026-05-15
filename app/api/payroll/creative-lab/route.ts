// ─────────────────────────────────────────────────────────────
// GET  /api/payroll/creative-lab — 전체 조회 (월별 화면에서 함께 노출)
// POST /api/payroll/creative-lab — 신규 batch 저장
//   body: { pay_date, pool, members: [{ member_name, contribution }] }
//   amount = pool × contribution / 100 으로 서버에서 자동 계산
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canViewPayroll, type UserRole } from '@/lib/roles';
import { getSupabaseAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_CACHE = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canViewPayroll(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_CACHE });
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('creative_lab_payouts')
    .select('*')
    .order('pay_date', { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
  }
  return NextResponse.json({ items: data ?? [] }, { headers: NO_CACHE });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canViewPayroll(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_CACHE });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400, headers: NO_CACHE });
  }

  const payDate: string = (body?.pay_date ?? '').toString().trim();
  const pool: number = Number(body?.pool ?? 0);
  const members: any[] = Array.isArray(body?.members) ? body.members : [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(payDate)) {
    return NextResponse.json({ error: '지급일(YYYY-MM-DD)이 필요합니다.' }, { status: 400, headers: NO_CACHE });
  }
  if (!Number.isFinite(pool) || pool <= 0) {
    return NextResponse.json({ error: '재원은 0보다 큰 숫자여야 합니다.' }, { status: 400, headers: NO_CACHE });
  }
  if (members.length === 0) {
    return NextResponse.json({ error: '멤버를 최소 1명 입력해 주세요.' }, { status: 400, headers: NO_CACHE });
  }

  const rows = members
    .map((m: any) => {
      const name = String(m?.member_name ?? '').trim();
      const contrib = Number(m?.contribution ?? 0);
      if (!name || !Number.isFinite(contrib) || contrib <= 0) return null;
      const amount = Math.round((pool * contrib) / 100);
      return {
        pay_date: payDate,
        pool: Math.round(pool),
        member_name: name,
        contribution: contrib,
        amount,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  if (rows.length === 0) {
    return NextResponse.json({ error: '유효한 멤버가 없습니다.' }, { status: 400, headers: NO_CACHE });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('creative_lab_payouts').insert(rows);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: NO_CACHE });
  }
  return NextResponse.json({ ok: true, inserted: rows.length }, { headers: NO_CACHE });
}
