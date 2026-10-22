export const WEEKDAYS = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const DEFAULT_SABHA_DAY: Weekday = 'friday';

export const isWeekday = (v: unknown): v is Weekday =>
  typeof v === 'string' && (WEEKDAYS as readonly string[]).includes(v);

const pad = (n: number) => String(n).padStart(2, '0');

export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function weekdayOf(iso: string): Weekday {
  return WEEKDAYS[new Date(`${iso}T00:00:00Z`).getUTCDay()];
}

// "Today" in India, regardless of where the server runs (Vercel runs in UTC)
export function todayIST(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export function currentYearIST(): number {
  return Number(todayIST().slice(0, 4));
}

// Every date in `year` that falls on `day`
export function sabhaDates(year: number, day: Weekday): string[] {
  const target = WEEKDAYS.indexOf(day);
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCDay() !== target) d.setUTCDate(d.getUTCDate() + 1);
  const out: string[] = [];
  while (d.getUTCFullYear() === year) {
    out.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

// The most recent sabha on or before today (or the first one of the year if none yet)
export function defaultSabhaDate(year: number, day: Weekday, today: string): string {
  const list = sabhaDates(year, day);
  if (list.length === 0) return today;
  const past = list.filter((d) => d <= today);
  return past.length ? past[past.length - 1] : list[0];
}

// The most recent sabha day on or before `today` (defaults to today in Asia/Kolkata IST)
export function mostRecentSabhaDate(day: Weekday, today: string = todayIST()): string {
  const target = WEEKDAYS.indexOf(day);
  const d = new Date(`${today}T00:00:00Z`);
  const current = d.getUTCDay();
  const diff = (current - target + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

export function shortDate(iso: string): string {
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}
