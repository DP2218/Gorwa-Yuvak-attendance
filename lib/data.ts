import { db } from './supabase';
import { DEFAULT_SABHA_DAY, isWeekday, type Weekday } from './dates';

export type Group = {
  id: number;
  code: string;
  leader_name: string | null;
  sort_order: number;
};

export type Yuvak = {
  id: number;
  group_id: number | null;
  serial_no: number | null;
  form_id: string | null;
  name: string;
  birth_date: string | null;
  address: string | null;
  mobile: string | null;
  whatsapp: string | null;
  home_phone: string | null;
  education: string | null;
  remarks: string | null;
  source: 'excel' | 'added';
};

// Supabase returns at most 1000 rows per request, so page through.
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getSabhaDay(): Promise<Weekday> {
  const { data } = await db().from('settings').select('value').eq('key', 'sabha_day').maybeSingle();
  return isWeekday(data?.value) ? data.value : DEFAULT_SABHA_DAY;
}

export async function setSabhaDay(day: Weekday): Promise<void> {
  const { error } = await db().from('settings').upsert({ key: 'sabha_day', value: day });
  if (error) throw new Error(error.message);
}

export async function getGroups(): Promise<Group[]> {
  const { data, error } = await db().from('groups').select('*').order('sort_order');
  if (error) throw new Error(error.message);
  return (data ?? []) as Group[];
}

export async function getAllYuvaks(): Promise<Yuvak[]> {
  return fetchAll<Yuvak>((from, to) =>
    db().from('yuvaks').select('*').order('id').range(from, to) as unknown as PromiseLike<{
      data: Yuvak[] | null; error: { message: string } | null;
    }>
  );
}

export async function getAttendanceForDate(date: string): Promise<Set<number>> {
  const rows = await fetchAll<{ yuvak_id: number }>((from, to) =>
    db().from('attendance').select('yuvak_id').eq('session_date', date).order('yuvak_id').range(from, to)
  );
  return new Set(rows.map((r) => r.yuvak_id));
}

export async function getAttendanceForYear(year: number): Promise<{ session_date: string; yuvak_id: number }[]> {
  return fetchAll<{ session_date: string; yuvak_id: number }>((from, to) =>
    db()
      .from('attendance')
      .select('session_date, yuvak_id')
      .gte('session_date', `${year}-01-01`)
      .lte('session_date', `${year}-12-31`)
      .order('id')
      .range(from, to)
  );
}
