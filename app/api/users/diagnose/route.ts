// ─────────────────────────────────────────────────────────────
// GET /api/users/diagnose
// 환경변수 / private_key 형식을 진단합니다.
// 실제 키 값은 응답에 포함하지 않습니다 (마스킹된 상태로 길이/형식만 표시).
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import { canManageUsers, type UserRole } from '@/lib/roles';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role as UserRole | undefined;
  if (!canManageUsers(role)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const out: Record<string, any> = {};

  const sheetId = process.env.GOOGLE_SHEETS_SHEET_ID;
  out.GOOGLE_SHEETS_SHEET_ID = {
    set: !!sheetId,
    length: sheetId?.length ?? 0,
    preview: sheetId ? sheetId.slice(0, 8) + '...' + sheetId.slice(-4) : null,
  };

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  out.GOOGLE_SERVICE_ACCOUNT_EMAIL = {
    set: !!email,
    length: email?.length ?? 0,
    looksValid: email?.includes('@') && email?.includes('.iam.gserviceaccount.com'),
    preview: email ? email.replace(/(.{4}).+(@.+)/, '$1***$2') : null,
  };

  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const keyDiag: Record<string, any> = { set: !!rawKey };
  if (rawKey) {
    keyDiag.rawLength = rawKey.length;
    keyDiag.startsWithQuote = rawKey.startsWith('"') || rawKey.startsWith("'");
    keyDiag.endsWithQuote = rawKey.endsWith('"') || rawKey.endsWith("'");
    keyDiag.containsLiteralBackslashN = rawKey.includes('\\n');
    keyDiag.containsActualNewline = rawKey.includes('\n');
    keyDiag.containsCR = rawKey.includes('\r');

    // 정규화 후 모양 확인
    let normalized = rawKey;
    if (
      (normalized.startsWith('"') && normalized.endsWith('"')) ||
      (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
      normalized = normalized.slice(1, -1);
    }
    normalized = normalized
      .replace(/^﻿/, '')
      .replace(/\\n/g, '\n')
      .replace(/\r/g, '')
      .trim();

    keyDiag.normalizedLength = normalized.length;
    keyDiag.hasBeginMarker = normalized.includes('-----BEGIN');
    keyDiag.hasEndMarker = normalized.includes('-----END');
    keyDiag.firstLine = normalized.split('\n')[0];
    keyDiag.lastLine = normalized.split('\n').filter(Boolean).pop();
    keyDiag.lineCount = normalized.split('\n').length;

    // 실제 PEM 파싱 시도
    if (!normalized.endsWith('\n')) normalized += '\n';
    try {
      const key = crypto.createPrivateKey({ key: normalized, format: 'pem' });
      keyDiag.parses = true;
      keyDiag.asymmetricKeyType = key.asymmetricKeyType;
    } catch (e: any) {
      keyDiag.parses = false;
      keyDiag.parseError = e?.message ?? String(e);
    }
  }
  out.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = keyDiag;

  // Supabase 환경변수도 같이
  out.NEXT_PUBLIC_SUPABASE_URL = { set: !!process.env.NEXT_PUBLIC_SUPABASE_URL };
  out.SUPABASE_SERVICE_ROLE_KEY = { set: !!process.env.SUPABASE_SERVICE_ROLE_KEY };

  return NextResponse.json(out);
}
