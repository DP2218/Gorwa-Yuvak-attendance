import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import {
  getActiveSabhaDate,
  getAllYuvaks,
  getAttendanceForYear,
  getAttendanceForDate,
  getGroups,
  getSabhaDay,
} from '@/lib/data';
import { isValidIsoDate, sabhaDates, shortDate } from '@/lib/dates';
import { toCsv } from '@/lib/csv';

export const dynamic = 'force-dynamic';

// GET /api/admin/export?year=2026        -> one row per yuvak, one column per sabha date (P = present)
// GET /api/admin/export?date=2026-10-23  -> one day only, with Present / Absent
// Opens directly in Excel.
export async function GET(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const url = new URL(req.url);
  const rawDate = url.searchParams.get('date');
  const rawYear = url.searchParams.get('year');
  const year = rawYear ? Number(rawYear) : null;
  const date = rawDate ?? (!year ? await getActiveSabhaDate() : null);
  const [yuvaks, groups, sabhaDay] = await Promise.all([getAllYuvaks(), getGroups(), getSabhaDay()]);
  const groupCode = new Map(groups.map((g) => [g.id, g.code]));

  const base = (y: { serial_no: number | null; name: string; mobile: string | null; education: string | null; group_id: number | null; source: string }) =>
    [groupCode.get(y.group_id ?? -1) ?? '', y.serial_no ?? '', y.name, y.mobile ?? '', y.education ?? '', y.source === 'added' ? 'Added' : 'Excel'];

  let rows: (string | number | null)[][] = [];
  let filename = 'attendance.csv';

  if (date && isValidIsoDate(date)) {
    const present = await getAttendanceForDate(date);
    rows = [['Group', 'SR.NO', 'Yuvak name', 'Mobile', 'Education', 'List', `Status ${shortDate(date)}`]];
    for (const y of yuvaks) rows.push([...base(y), present.has(y.id) ? 'Present' : 'Absent']);
    const total = yuvaks.filter((y) => present.has(y.id)).length;
    rows.push(['', '', `Total present: ${total} of ${yuvaks.length}`, '', '', '', '']);
  } else if (year !== null && Number.isInteger(year) && year > 2000) {
    const dates = sabhaDates(year, sabhaDay);
    const records = await getAttendanceForYear(year);
    const byYuvakDate = new Set(records.map((r) => `${r.yuvak_id}|${r.session_date}`));
    const perYuvak = new Map<number, number>();
    for (const r of records) perYuvak.set(r.yuvak_id, (perYuvak.get(r.yuvak_id) ?? 0) + 1);

    rows = [['Group', 'SR.NO', 'Yuvak name', 'Mobile', 'Education', 'List', 'Sabhas present', ...dates.map(shortDate)]];
    for (const y of yuvaks) {
      rows.push([
        ...base(y),
        perYuvak.get(y.id) ?? 0,
        ...dates.map((d) => (byYuvakDate.has(`${y.id}|${d}`) ? 'P' : '')),
      ]);
    }
    rows.push(['', '', 'Total present', '', '', '', '', ...dates.map((d) => records.filter((r) => r.session_date === d).length)]);
    filename = `attendance-${year}-${sabhaDay}.csv`;
  } else {
    return NextResponse.json({ error: 'Pass ?year=YYYY or ?date=YYYY-MM-DD' }, { status: 400 });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
