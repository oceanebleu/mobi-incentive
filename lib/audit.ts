// ─────────────────────────────────────────────────────────────
// lib/audit.ts
// 프로젝트 변경 이력 기록 헬퍼
//
// - logProjectChange : project_changes 테이블에 1건 기록
// - computeDiff      : before/after 값을 비교해 변경된 필드만 추출
//
// 감사 로그 기록 실패는 본 작업(저장/삭제)을 막지 않는다. 조용히 console.error.
// ─────────────────────────────────────────────────────────────

import { getSupabaseAdmin } from './supabase-server';

export interface Changer {
  email?: string | null;
  name?: string | null;
}

export type AuditAction = 'create' | 'update' | 'delete';

export async function logProjectChange(
  projectId: string,
  campaignName: string,
  action: AuditAction,
  diff: any,
  changer: Changer
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('project_changes').insert({
      project_id: projectId,
      campaign_name: campaignName,
      action,
      changed_by_email: changer.email ?? null,
      changed_by_name: changer.name ?? null,
      diff,
    });
    if (error) console.error('[audit] log failed:', error.message);
  } catch (e) {
    console.error('[audit] log exception:', e);
  }
}

// 객체 비교 — patch에 포함된 필드 중 실제로 값이 변한 것만 diff에 담음
export function computeDiff(
  before: Record<string, any>,
  patch: Record<string, any>
): Record<string, { old: any; new: any }> {
  const diff: Record<string, { old: any; new: any }> = {};
  for (const k of Object.keys(patch)) {
    const oldV = before?.[k] ?? null;
    const newV = patch[k] ?? null;
    // 단순 비교 (date/string/number/boolean 대상이라 OK)
    if (JSON.stringify(oldV) !== JSON.stringify(newV)) {
      diff[k] = { old: oldV, new: newV };
    }
  }
  return diff;
}
