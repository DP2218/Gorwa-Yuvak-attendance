import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

export const ADMIN_COOKIE = 'yuvak_admin';
export const ADMIN_SESSION_HOURS = 12;

function secret(): string {
  const raw = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!raw) throw new Error('Set ADMIN_PASSWORD and ADMIN_SESSION_SECRET');
  return raw.trim().replace(/^["']|["']$/g, '');
}

export function adminToken(): string {
  return createHmac('sha256', secret()).update('yuvak-admin-session-v1').digest('hex');
}

export function passwordMatches(input: string): boolean {
  const rawExpected = process.env.ADMIN_PASSWORD;
  if (!rawExpected) return false;
  const expected = rawExpected.trim().replace(/^["']|["']$/g, '');
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  const value = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!value) return false;
  const expected = adminToken();
  return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
