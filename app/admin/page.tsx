import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import { getAllYuvaks, getAttendanceForDate, getAttendanceForYear, getGroups, getSabhaDay } from '@/lib/data';
import { defaultSabhaDate, formatDate, isValidIsoDate, sabhaDates, todayIST } from '@/lib/dates';
import { LogoutButton, SabhaDayForm } from '@/components/AdminControls';
import AdminYuvaksTable, { type AdminYuvakItem } from '@/components/AdminYuvaksTable';
import AdminDownloads from '@/components/AdminDownloads';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; group?: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin/login');
  const sp = await searchParams;

  const [groups, yuvaks, sabhaDay] = await Promise.all([getGroups(), getAllYuvaks(), getSabhaDay()]);
  const today = todayIST();
  const date = sp.date && isValidIsoDate(sp.date) ? sp.date : defaultSabhaDate(Number(today.slice(0, 4)), sabhaDay, today);
  const year = Number(date.slice(0, 4));
  const dateOptions = sabhaDates(year, sabhaDay);
  if (!dateOptions.includes(date)) dateOptions.push(date);
  dateOptions.sort();

  const [present, yearRecords] = await Promise.all([getAttendanceForDate(date), getAttendanceForYear(year)]);
  const sabhasThisYear = new Map<number, number>();
  for (const r of yearRecords) sabhasThisYear.set(r.yuvak_id, (sabhasThisYear.get(r.yuvak_id) ?? 0) + 1);
  const heldDates = new Set(yearRecords.map((r) => r.session_date)).size;

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupFilter = sp.group && sp.group !== 'all' ? Number(sp.group) : null;
  const rows = yuvaks
    .filter((y) => groupFilter === null || y.group_id === groupFilter)
    .sort((a, b) => (groupById.get(a.group_id ?? -1)?.sort_order ?? 99) - (groupById.get(b.group_id ?? -1)?.sort_order ?? 99) || a.name.localeCompare(b.name));

  const totalPresent = yuvaks.filter((y) => present.has(y.id)).length;
  const pct = yuvaks.length ? Math.round((totalPresent / yuvaks.length) * 100) : 0;
  const groupSummary = groups.map((g) => {
    const members = yuvaks.filter((y) => y.group_id === g.id);
    return { g, total: members.length, present: members.filter((y) => present.has(y.id)).length };
  });

  const dayName = sabhaDay[0].toUpperCase() + sabhaDay.slice(1);

  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1>Attendance dashboard</h1>
        <LogoutButton />
      </div>

      <div className="card">
        <h2>Sabha settings</h2>
        <SabhaDayForm current={sabhaDay} />
        <p className="muted" style={{ marginBottom: 0 }}>
          The sabha day is {dayName} by default. Change it here if the day moves. The attendance pages then list {dayName}s for the whole year.
          You can always pick any other date on the group page for a special sabha.
        </p>
      </div>

      <form method="get" className="card row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 220px' }}>
          <label htmlFor="date">Sabha date</label>
          <select id="date" name="date" defaultValue={date}>
            {dateOptions.map((d) => (
              <option key={d} value={d}>{formatDate(d)}</option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="group">Group</label>
          <select id="group" name="group" defaultValue={groupFilter ?? 'all'}>
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.code}</option>
            ))}
          </select>
        </div>
        <button className="btn ghost" type="submit">Show</button>
      </form>

      <div className="stats">
        <div className="stat"><span className="muted">Date</span><b style={{ fontSize: '1.1rem' }}>{formatDate(date)}</b></div>
        <div className="stat"><span className="muted">Present</span><b>{totalPresent}</b></div>
        <div className="stat"><span className="muted">Yuvaks in list</span><b>{yuvaks.length}</b></div>
        <div className="stat"><span className="muted">Attendance</span><b>{pct}%</b></div>
        <div className="stat"><span className="muted">Sabha dates with attendance in {year}</span><b>{heldDates}</b></div>
      </div>

      <div className="card">
        <h2>Downloads (open in Excel)</h2>
        <AdminDownloads
          defaultDate={date}
          year={year}
          sabhaDay={sabhaDay}
          dateOptions={dateOptions}
          groups={groups.map((g) => ({ id: g.id, code: g.code }))}
          csvDateHref={`/api/admin/export?date=${date}`}
          csvYearHref={`/api/admin/export?year=${year}`}
        />
      </div>

      <div className="card">
        <h2>By group on {formatDate(date)}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Group</th><th>Leader</th><th>Present</th><th>In list</th><th>%</th></tr>
            </thead>
            <tbody>
              {groupSummary.map(({ g, total, present: p }) => (
                <tr key={g.id}>
                  <td><a href={`/admin?date=${date}&group=${g.id}`}>{g.code}</a></td>
                  <td>{g.leader_name ?? '-'}</td>
                  <td>{p}</td>
                  <td>{total}</td>
                  <td>{total ? Math.round((p / total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2>Yuvaks {groupFilter ? `in ${groupById.get(groupFilter)?.code ?? ''}` : '(all groups)'}</h2>
        <AdminYuvaksTable
          initialRows={rows.map((y) => ({
            id: y.id,
            group_id: y.group_id,
            groupCode: groupById.get(y.group_id ?? -1)?.code ?? '-',
            serial_no: y.serial_no,
            name: y.name,
            source: y.source,
            mobile: y.mobile,
            education: y.education,
            isPresent: present.has(y.id),
            sabhasCount: sabhasThisYear.get(y.id) ?? 0,
          }))}
          year={year}
        />
      </div>
    </div>
  );
}
