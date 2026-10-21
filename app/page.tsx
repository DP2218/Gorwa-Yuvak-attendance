import HomeClient from '@/components/HomeClient';
import { getAllYuvaks, getGroups, getSabhaDay } from '@/lib/data';
import { currentYearIST, defaultSabhaDate, formatDate, todayIST, WEEKDAYS } from '@/lib/dates';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const [groups, yuvaks, sabhaDay] = await Promise.all([getGroups(), getAllYuvaks(), getSabhaDay()]);
  const today = todayIST();
  const date = defaultSabhaDate(currentYearIST(), sabhaDay, today);
  const counts = new Map<number, number>();
  for (const y of yuvaks) if (y.group_id) counts.set(y.group_id, (counts.get(y.group_id) ?? 0) + 1);

  return (
    <div className="wrap">
      <div className="card">
        <h1>Sabha attendance</h1>
        <p className="muted" style={{ margin: 0 }}>
          Sabha day: <strong style={{ color: 'inherit' }}>{WEEKDAYS.includes(sabhaDay) ? sabhaDay[0].toUpperCase() + sabhaDay.slice(1) : sabhaDay}</strong>
          {' · '}Marking for <strong style={{ color: 'inherit' }}>{formatDate(date)}</strong>
        </p>
        <p className="muted" style={{ marginBottom: 0 }}>
          Choose a group below, or search for a yuvak. Change the date on the group page if needed.
        </p>
      </div>
      <HomeClient
        date={date}
        groups={groups.map((g) => ({ ...g, count: counts.get(g.id) ?? 0 }))}
        yuvaks={yuvaks.map((y) => ({ id: y.id, name: y.name, group_id: y.group_id, mobile: y.mobile, serial_no: y.serial_no }))}
      />
    </div>
  );
}
