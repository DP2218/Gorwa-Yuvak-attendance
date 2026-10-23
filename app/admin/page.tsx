import Link from 'next/link';
import { redirect } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import {
  getActiveSabhaDate,
  getAllYuvaks,
  getAttendanceForDate,
  getAttendanceForYear,
  getGroups,
  getSabhaSettings,
} from '@/lib/data';
import { formatDate, isValidIsoDate, sabhaDates, todayIST } from '@/lib/dates';
import { LogoutButton, SabhaDayForm } from '@/components/AdminControls';
import AdminDownloads from '@/components/AdminDownloads';

export const dynamic = 'force-dynamic';

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; group?: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin/login');
  const sp = await searchParams;

  const [groups, yuvaks, sabhaSettings, activeDate] = await Promise.all([
    getGroups(),
    getAllYuvaks(),
    getSabhaSettings(),
    getActiveSabhaDate(),
  ]);
  const sabhaDay = sabhaSettings.sabha_day;
  const today = todayIST();
  const date = sp.date && isValidIsoDate(sp.date) ? sp.date : activeDate;
  const year = Number(date.slice(0, 4));
  const dateOptions = sabhaDates(year, sabhaDay);
  if (!dateOptions.includes(date)) dateOptions.push(date);
  if (!dateOptions.includes(activeDate)) dateOptions.push(activeDate);
  dateOptions.sort();

  const [present, yearRecords] = await Promise.all([getAttendanceForDate(date), getAttendanceForYear(year)]);
  const heldDates = new Set(yearRecords.map((r) => r.session_date)).size;

  const totalPresent = yuvaks.filter((y) => present.has(y.id)).length;
  const pct = yuvaks.length ? Math.round((totalPresent / yuvaks.length) * 100) : 0;
  const groupSummary = groups.map((g) => {
    const members = yuvaks.filter((y) => y.group_id === g.id);
    return { g, total: members.length, present: members.filter((y) => present.has(y.id)).length };
  });

  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1>Attendance dashboard</h1>
        <LogoutButton />
      </div>

      <div className="card">
        <h2>Sabha settings</h2>
        <SabhaDayForm
          currentDay={sabhaSettings.sabha_day}
          currentMode={sabhaSettings.date_mode}
          currentManualDate={sabhaSettings.manual_date}
          today={today}
        />
        <p className="muted" style={{ marginBottom: 0, marginTop: 14 }}>
          The sabha day is Friday by default. Choose the date attendance is marked for, or leave it on Auto. You can always pick any other date on a group page for a special sabha.
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
                  <td><Link href={`/admin/group/${g.id}?date=${date}`}>{g.code}</Link></td>
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
    </div>
  );
}
