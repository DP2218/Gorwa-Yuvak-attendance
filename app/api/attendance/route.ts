import { NextResponse } from 'next/server';
import { db } from '@/lib/supabase';
import { isValidIsoDate } from '@/lib/dates';

export const dynamic = 'force-dynamic';

// POST { yuvak_id, session_date: "YYYY-MM-DD", present: boolean }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const yuvakId = Number(body?.yuvak_id);
  const date = typeof body?.session_date === 'string' ? body.session_date : '';
  if (!Number.isInteger(yuvakId) || yuvakId <= 0 || !isValidIsoDate(date)) {
    return NextResponse.json({ error: 'Invalid yuvak or date' }, { status: 400 });
  }

  if (body?.present === true) {
    const { error } = await db()
      .from('attendance')
      .upsert({ session_date: date, yuvak_id: yuvakId }, { onConflict: 'session_date,yuvak_id', ignoreDuplicates: true });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await db()
      .from('attendance')
      .delete()
      .eq('session_date', date)
      .eq('yuvak_id', yuvakId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
