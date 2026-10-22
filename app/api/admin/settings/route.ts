import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import { isValidIsoDate, isWeekday, WEEKDAYS, type Weekday } from '@/lib/dates';
import { getActiveSabhaDate, getSabhaSettings, setSabhaSettings, type DateMode } from '@/lib/data';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const settings = await getSabhaSettings();
  const activeDate = await getActiveSabhaDate();
  return NextResponse.json({ ...settings, active_date: activeDate });
}

// POST { sabha_day: "friday" | 5, date_mode: "auto" | "manual", manual_date?: "YYYY-MM-DD" | null } (admin only)
export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
  const body = await req.json().catch(() => null);

  // Validate sabha_day (supports weekday name or 0-6 index)
  let day: Weekday | null = null;
  if (typeof body?.sabha_day === 'number' && Number.isInteger(body.sabha_day) && body.sabha_day >= 0 && body.sabha_day <= 6) {
    day = WEEKDAYS[body.sabha_day];
  } else if (typeof body?.sabha_day === 'string') {
    const s = body.sabha_day.trim().toLowerCase();
    if (isWeekday(s)) {
      day = s;
    } else if (/^[0-6]$/.test(s)) {
      day = WEEKDAYS[Number(s)];
    }
  }

  if (!day) {
    return NextResponse.json({ error: 'Invalid sabha day. Pick a valid weekday (Sunday to Saturday).' }, { status: 400 });
  }

  // Validate date_mode
  const modeRaw = body?.date_mode ?? 'auto';
  if (modeRaw !== 'auto' && modeRaw !== 'manual') {
    return NextResponse.json({ error: 'Invalid date_mode. Allowed values are "auto" or "manual".' }, { status: 400 });
  }
  const mode = modeRaw as DateMode;

  // Validate manual_date
  let manualDate: string | null = null;
  if (mode === 'manual') {
    if (!body?.manual_date || typeof body.manual_date !== 'string' || !isValidIsoDate(body.manual_date)) {
      return NextResponse.json({ error: 'Please choose a valid manual date (YYYY-MM-DD).' }, { status: 400 });
    }
    manualDate = body.manual_date;
  }

  await setSabhaSettings({
    sabha_day: day,
    date_mode: mode,
    manual_date: manualDate,
  });

  // Revalidate home page, group pages, and admin
  revalidatePath('/', 'layout');
  revalidatePath('/');
  revalidatePath('/admin');
  revalidatePath('/group/[id]', 'page');

  const activeDate = await getActiveSabhaDate();
  return NextResponse.json({ ok: true, sabha_day: day, date_mode: mode, manual_date: manualDate, active_date: activeDate });
}
