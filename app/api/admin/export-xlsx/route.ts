import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/auth';
import {
  getActiveSabhaDate,
  getAllYuvaks,
  getAttendanceForRange,
  getAttendanceForYear,
  getAttendanceForDate,
  getGroups,
  getSabhaDay,
} from '@/lib/data';
import { isValidIsoDate, sabhaDates } from '@/lib/dates';
import { generateAttendanceWorkbook } from '@/lib/excel-export';

export const dynamic = 'force-dynamic';
// Extend timeout for large exports (Vercel hobby = 60s max)
export const maxDuration = 60;

function isoDateFromStr(s: string | null): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  return isValidIsoDate(trimmed) ? trimmed : null;
}

function jsonError(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

/**
 * GET /api/admin/export-xlsx
 *
 * Query params:
 *   mode        = 'single' | 'range' | 'year'
 *   date        = 'YYYY-MM-DD'   (mode=single)
 *   from        = 'YYYY-MM-DD'   (mode=range)
 *   to          = 'YYYY-MM-DD'   (mode=range)
 *   year        = 'YYYY'         (mode=year)
 *   group       = 'all' | '<group_id>'
 *   details     = '1' | '0'      (default 1 → include yuvak detail columns)
 *   absent      = '1' | '0'      (default 0 → mark absent as blank, not 'A')
 */
export async function GET(req: Request) {
  if (!(await isAdmin())) return jsonError('Not signed in', 401);

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode') ?? 'single';
  const groupParam = url.searchParams.get('group') ?? 'all';
  const includeDetails = url.searchParams.get('details') !== '0';
  const markAbsent = url.searchParams.get('absent') === '1';

  // Validate mode
  if (!['single', 'range', 'year'].includes(mode)) {
    return jsonError('mode must be single, range, or year');
  }

  // Work out dates array
  let dates: string[] = [];
  let filenamePart = 'export';

  const [groups, yuvaks, sabhaDay] = await Promise.all([getGroups(), getAllYuvaks(), getSabhaDay()]);

  if (mode === 'single') {
    let d = isoDateFromStr(url.searchParams.get('date'));
    if (!d) d = await getActiveSabhaDate();
    dates = [d];
    filenamePart = d;
  } else if (mode === 'range') {
    const from = isoDateFromStr(url.searchParams.get('from'));
    const to = isoDateFromStr(url.searchParams.get('to'));
    if (!from || !to) return jsonError('mode=range requires ?from=YYYY-MM-DD&to=YYYY-MM-DD');
    if (from > to) return jsonError('"from" date must not be after "to" date');
    // Build list of all sabha dates in range
    // We use all actual dates with attendance in the range, plus fill in fridays
    const year = Number(from.slice(0, 4));
    const year2 = Number(to.slice(0, 4));
    const allSabha = new Set<string>();
    for (let y = year; y <= year2; y++) {
      for (const d of sabhaDates(y, sabhaDay)) {
        if (d >= from && d <= to) allSabha.add(d);
      }
    }
    dates = [...allSabha].sort();
    filenamePart = `${from}_to_${to}`;
  } else if (mode === 'year') {
    const yearStr = url.searchParams.get('year');
    const year = yearStr ? Number(yearStr) : 0;
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return jsonError('mode=year requires ?year=YYYY');
    }
    dates = sabhaDates(year, sabhaDay);
    filenamePart = String(year);
  }

  // Validate group
  let singleGroupId: number | null = null;
  if (groupParam !== 'all') {
    singleGroupId = Number(groupParam);
    if (!Number.isFinite(singleGroupId) || !groups.find((g) => g.id === singleGroupId)) {
      return jsonError(`Unknown group id: ${groupParam}`);
    }
  }

  // Fetch attendance for the needed range
  let attendanceRecords: { session_date: string; yuvak_id: number }[] = [];
  try {
    if (mode === 'single') {
      const presentSet = await getAttendanceForDate(dates[0]);
      attendanceRecords = [...presentSet].map((id) => ({ yuvak_id: id, session_date: dates[0] }));
    } else if (mode === 'range' && dates.length > 0) {
      const from = dates[0];
      const to = dates[dates.length - 1];
      attendanceRecords = await getAttendanceForRange(from, to);
    } else if (mode === 'year') {
      const year = Number(filenamePart);
      attendanceRecords = await getAttendanceForYear(year);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError(`DB error: ${msg}`, 500);
  }

  // Build workbook
  let wb;
  try {
    wb = await generateAttendanceWorkbook({
      groups,
      yuvaks,
      dates,
      attendanceRecords,
      options: {
        mode: mode as 'single' | 'range' | 'year',
        group: groupParam,
        includeDetails,
        markAbsent,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return jsonError(`Excel build error: ${msg}`, 500);
  }

  // Serialise to buffer
  const buffer = await wb.xlsx.writeBuffer();

  const groupSuffix = singleGroupId !== null
    ? `_group${groups.find((g) => g.id === singleGroupId)?.code.replace(/\s+/g, '') ?? singleGroupId}`
    : '';
  const filename = `GORWA_YUVAK_ATTENDANCE_${filenamePart}${groupSuffix}.xlsx`;

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
