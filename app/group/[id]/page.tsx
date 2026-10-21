import Link from 'next/link';
import { notFound } from 'next/navigation';
import MarkClient from '@/components/MarkClient';
import { getAllYuvaks, getAttendanceForDate, getGroups, getSabhaDay } from '@/lib/data';
import { currentYearIST, defaultSabhaDate, formatDate, isValidIsoDate, sabhaDates, todayIST } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string; focus?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const groupId = Number(id);
  const [groups, sabhaDay, allYuvaks] = await Promise.all([getGroups(), getSabhaDay(), getAllYuvaks()]);
  const group = groups.find((g) => g.id === groupId);
  if (!group) notFound();

  const today = todayIST();
  const date = sp.date && isValidIsoDate(sp.date) ? sp.date : defaultSabhaDate(currentYearIST(), sabhaDay, today);
  const year = Number(date.slice(0, 4));
  const options = sabhaDates(year, sabhaDay);
  if (!options.includes(date)) options.push(date); // a special one-off date
  options.sort();

  const [present, yuvaks] = await Promise.all([
    getAttendanceForDate(date),
    Promise.resolve(allYuvaks.filter((y) => y.group_id === groupId)),
  ]);
  const focus = sp.focus ? Number(sp.focus) : undefined;

  return (
    <div className="wrap">
      <p style={{ margin: '0 0 8px' }}><Link href="/">← All groups</Link></p>
      <h1>{group.code}</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {group.leader_name ? `Leader: ${group.leader_name}` : 'No leader listed'}
      </p>

      <div className="card">
        <form method="get" className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 240px' }}>
            <label htmlFor="date">Sabha date</label>
            <select id="date" name="date" defaultValue={date}>
              {options.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d)}{d === defaultSabhaDate(year, sabhaDay, today) ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </div>
          <button className="btn ghost" type="submit">Show date</button>
        </form>
        <form method="get" className="row" style={{ alignItems: 'flex-end', marginTop: 12 }}>
          <div style={{ flex: '1 1 240px' }}>
            <label htmlFor="other">Other date (special sabha)</label>
            <input id="other" type="date" name="date" defaultValue={date} />
          </div>
          <button className="btn ghost" type="submit">Use this date</button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          Showing attendance for <strong style={{ color: 'inherit' }}>{formatDate(date)}</strong>. Default sabha day is {sabhaDay}, set in Admin.
        </p>
      </div>

      <MarkClient
        groupId={group.id}
        groupCode={group.code}
        date={date}
        focusId={focus}
        presentIds={[...present]}
        yuvaks={yuvaks}
      />
    </div>
  );
}
