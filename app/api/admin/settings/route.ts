import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { isWeekday } from '@/lib/dates';
import { setSabhaDay } from '@/lib/data';

export const dynamic = 'force-dynamic';

// POST { sabha_day: "friday" | "saturday" | ... } (admin only)
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!isWeekday(body?.sabha_day)) {
    return NextResponse.json({ error: 'Pick a valid weekday' }, { status: 400 });
  }
  await setSabhaDay(body.sabha_day);
  return NextResponse.json({ ok: true });
}
