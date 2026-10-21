import { NextResponse } from 'next/server';
import { ADMIN_COOKIE, ADMIN_SESSION_HOURS, adminToken, passwordMatches } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const password = typeof body?.password === 'string' ? body.password : '';
  // Slow down guessing
  await new Promise((r) => setTimeout(r, 600));
  if (!passwordMatches(password)) {
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: ADMIN_SESSION_HOURS * 60 * 60,
  });
  return res;
}
