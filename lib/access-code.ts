// ─────────────────────────────────────────────────────────────
// lib/access-code.ts
// PL 양식 본인 인증용 5자 고유코드 — 알파벳 3 + 숫자 2
//   가독성을 위해 혼동 문자(I, O, 0, 1) 제외
// ─────────────────────────────────────────────────────────────

const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외
const DIGITS = '23456789';                  // 0, 1 제외

export function generateAccessCode(): string {
  let code = '';
  for (let i = 0; i < 3; i++) {
    code += LETTERS[Math.floor(Math.random() * LETTERS.length)];
  }
  for (let i = 0; i < 2; i++) {
    code += DIGITS[Math.floor(Math.random() * DIGITS.length)];
  }
  return code;
}

export function isValidAccessCode(s: string): boolean {
  return /^[A-Z]{3}[0-9]{2}$/.test(s);
}
