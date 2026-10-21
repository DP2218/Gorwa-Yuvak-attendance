'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import AddYuvakForm from './AddYuvakForm';
import type { Group, Yuvak } from '@/lib/data';

type Props = {
  groups: (Group & { count: number })[];
  yuvaks: Pick<Yuvak, 'id' | 'name' | 'group_id' | 'mobile' | 'serial_no'>[];
  date: string;
};

export default function HomeClient({ groups, yuvaks: initial, date }: Props) {
  const [list, setList] = useState(initial);
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    return list.filter((y) => y.name.toLowerCase().includes(s) || (y.mobile ?? '').includes(s)).slice(0, 30);
  }, [list, q]);

  const noMatch = q.trim().length >= 2 && results.length === 0;

  return (
    <>
      <div className="card">
        <h2>Find a yuvak</h2>
        <div className="field">
          <label htmlFor="find">Type a name or mobile number</label>
          <input id="find" type="search" value={q} onChange={(e) => { setQ(e.target.value); setShowAdd(false); }} autoComplete="off" placeholder="e.g. PATEL ARTH" />
        </div>

        {results.length > 0 && (
          <div className="list">
            {results.map((y) => {
              const g = groupById.get(y.group_id ?? -1);
              return (
                <Link key={y.id} href={`/group/${y.group_id}?date=${date}&focus=${y.id}`} className="yrow" style={{ textDecoration: 'none' }}>
                  <span style={{ minWidth: 0 }}>
                    <span className="name">{y.name}</span>
                    <span className="meta">{g ? `${g.code}` : 'No group'} {y.mobile ? `· ${y.mobile}` : ''}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {noMatch && !showAdd && (
          <div style={{ marginTop: 12 }}>
            <p className="muted">&ldquo;{q.trim()}&rdquo; is not in the list.</p>
            <button className="btn" type="button" onClick={() => setShowAdd(true)}>Add &ldquo;{q.trim()}&rdquo; as a new yuvak</button>
          </div>
        )}

        {showAdd && (
          <div style={{ marginTop: 12 }}>
            <AddYuvakForm
              groups={groups}
              initialName={q.trim()}
              onAdded={(y: Yuvak) => {
                setList((prev) => [...prev, { id: y.id, name: y.name, group_id: y.group_id, mobile: y.mobile, serial_no: null }]);
                setAdded(`${y.name} saved. Open their group to mark attendance.`);
                setShowAdd(false);
                setQ('');
              }}
            />
          </div>
        )}
        {added && <div className="success" role="status" style={{ marginTop: 12 }}>{added}</div>}
      </div>

      <h2 style={{ margin: '20px 0 10px' }}>Groups</h2>
      <div className="grid">
        {groups.map((g) => (
          <Link key={g.id} href={`/group/${g.id}?date=${date}`} className="card" style={{ textDecoration: 'none', color: 'inherit', margin: 0 }}>
            <strong style={{ fontSize: '1.1rem' }}>{g.code}</strong>
            <div className="muted" style={{ marginTop: 4 }}>{g.leader_name ?? '-'}</div>
            <div style={{ marginTop: 8 }}>{g.count} yuvaks</div>
          </Link>
        ))}
      </div>
    </>
  );
}
