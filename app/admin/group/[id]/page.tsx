import { redirect, notFound } from 'next/navigation';
import { isAdmin } from '@/lib/auth';
import {
  getActiveSabhaDate,
  getAllYuvaks,
  getAttendanceForDate,
  getGroups,
  getSabhaSettings,
} from '@/lib/data';
import { isValidIsoDate, sabhaDates } from '@/lib/dates';
import AdminGroupDetailClient from '@/components/AdminGroupDetailClient';

export const dynamic = 'force-dynamic';

export default async function AdminGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  if (!(await isAdmin())) redirect('/admin/login');

  const { id: rawId } = await params;
  const groupId = Number(rawId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    notFound();
  }

  const sp = await searchParams;

  const [groups, allYuvaks, sabhaSettings, activeDate] = await Promise.all([
    getGroups(),
    getAllYuvaks(),
    getSabhaSettings(),
    getActiveSabhaDate(),
  ]);

  const group = groups.find((g) => g.id === groupId);
  if (!group) notFound();

  const sabhaDay = sabhaSettings.sabha_day;
  const date = sp.date && isValidIsoDate(sp.date) ? sp.date : activeDate;
  const year = Number(date.slice(0, 4));

  const dateOptions = sabhaDates(year, sabhaDay);
  if (!dateOptions.includes(date)) dateOptions.push(date);
  if (!dateOptions.includes(activeDate)) dateOptions.push(activeDate);
  dateOptions.sort();

  const present = await getAttendanceForDate(date);

  // Sort group yuvaks in SR.NO order
  const groupYuvaks = allYuvaks
    .filter((y) => y.group_id === groupId)
    .sort((a, b) => {
      if (a.serial_no !== null && b.serial_no !== null) return a.serial_no - b.serial_no;
      if (a.serial_no !== null) return -1;
      if (b.serial_no !== null) return 1;
      return a.name.localeCompare(b.name);
    });

  const groupMap = new Map(groups.map((g) => [g.id, g.code]));

  const allYuvaksSummary = allYuvaks.map((y) => ({
    id: y.id,
    name: y.name,
    mobile: y.mobile,
    groupCode: groupMap.get(y.group_id ?? -1) ?? 'Other',
  }));

  return (
    <AdminGroupDetailClient
      group={group}
      allGroups={groups}
      initialYuvaks={groupYuvaks}
      allYuvaksSummary={allYuvaksSummary}
      date={date}
      dateOptions={dateOptions}
      initialPresentIds={[...present]}
    />
  );
}
