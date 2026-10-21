'use client';

import { useEffect, useMemo, useState } from 'react';
import AddYuvakForm from './AddYuvakForm';
import type { Yuvak } from '@/lib/data';

type Props = {
  groupId: number;
  groupCode: string;
  yuvaks: Yuvak[];
  presentIds: number[];
  date: string;
  focusId?: number;
};

export default function MarkClient({ groupId, groupCode, yuvaks: initial, presentIds, date, focusId }: Props) {
  const [list, setList] = useState<Yuvak[]>(initial);
  const [present, setPresent] = useState<Set<number>>(() => new Set(presentIds));
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addedNote, setAddedNote] = useState<string | null>(null);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (y) =>
        y.name.toLowerCase().includes(s) ||
        (y.mobile ?? '').includes(s) ||
        (y.serial_no !== null && String(y.serial_no) === s)
    );
  }, [list, q]);

  const presentCount = list.filter((y) => present.has(y.id)).length;

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`y-${focusId}`)?.scrollIntoView({ block: 'center' });
  }, [focusId]);

  async function save(yuvakId: number, isPresent: boolean): Promise<boolean> {
    const res = await fetch('/api/attendance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yuvak_id: yuvakId, session_date: date, present: isPresent }),
    });
    return res.ok;
  }

  async function toggle(y: Yuvak) {
    const next = !present.has(y.id);
    setError(null);
    // Optimistic: flip immediately, roll back if the server refuses
    setPresent((prev) => {
      const n = new Set(prev);
      if (next) n.add(y.id); else n.delete(y.id);
      return n;
    });
    try {
      const ok = await save(y.id, next);
      if (!ok) throw new Error('save failed');
    } catch {
      setPresent((prev) => {
        const n = new Set(prev);
        if (next) n.delete(y.id); else n.add(y.id);
        return n;
      });
      setError(`Could not save ${y.name}. Check the connection and tap again.`);
    }
  }

  async function onAdded(y: Yuvak) {
    setList((prev) => [...prev, y].sort((a, b) => a.name.localeCompare(b.name)));
    setShowAdd(false);
    setAddedNote(`${y.name} added to ${groupCode} and marked present.`);
    setPresent((prev) => new Set(prev).add(y.id));
    try {
      await save(y.id, true);
    } catch {
      setError(`${y.name} was added, but marking attendance failed. Tap their name to mark them.`);
    }
  }

  return (
    <>
      <div className="card">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div>
            <strong style={{ fontSize: '1.4rem' }}>{presentCount}</strong>
            <span className="muted"> present of {list.length}</span>
          </div>
          <span className="muted">Tap a name to mark present. Tap again to undo.</span>
        </div>
      </div>

      {error && <div className="error" role="alert">{error}</div>}
      {addedNote && <div className="success" role="status">{addedNote}</div>}

      <div className="card">
        <div className="field">
          <label htmlFor="search">Search name, mobile or SR.NO</label>
          <input id="search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to filter" autoComplete="off" />
        </div>

        <div className="list" role="group" aria-label={`${groupCode} yuvaks`}>
          {visible.map((y) => {
            const on = present.has(y.id);
            return (
              <button
                key={y.id}
                id={`y-${y.id}`}
                type="button"
                className={`yrow${on ? ' on' : ''}${focusId === y.id ? ' focus' : ''}`}
                aria-pressed={on}
                onClick={() => toggle(y)}
              >
                <span className="check" aria-hidden>{on ? '✓' : ''}</span>
                <span style={{ minWidth: 0 }}>
                  <span className="name">
                    {y.serial_no !== null && <span className="muted">#{y.serial_no} </span>}
                    {y.name}
                    {y.source === 'added' && <span className="tag">added</span>}
                  </span>
                  <span className="meta">
                    {[y.mobile, y.education].filter(Boolean).join(' · ') || 'No details'}
                  </span>
                </span>
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="muted">No one matches &ldquo;{q}&rdquo; in {groupCode}.</p>
          )}
        </div>
      </div>

      <div className="card">
        {!showAdd ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="muted">Not in this list?</span>
            <button className="btn ghost" type="button" onClick={() => setShowAdd(true)}>+ Add new yuvak to {groupCode}</button>
          </div>
        ) : (
          <>
            <h2>Add new yuvak to {groupCode}</h2>
            <p className="muted" style={{ marginTop: 0 }}>Saved to the database. They are marked present for {date} straight away.</p>
            <AddYuvakForm fixedGroupId={groupId} initialName={q} onAdded={onAdded} />
            <button className="btn ghost" type="button" style={{ marginTop: 8 }} onClick={() => setShowAdd(false)}>Cancel</button>
          </>
        )}
      </div>
    </>
  );
}
