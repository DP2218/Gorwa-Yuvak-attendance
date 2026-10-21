'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { WEEKDAYS, type Weekday } from '@/lib/dates';

export function SabhaDayForm({ current }: { current: Weekday }) {
  const router = useRouter();
  const [day, setDay] = useState<Weekday>(current);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMsg(null); setErr(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sabha_day: day }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not save');
      setMsg(`Sabha day saved as ${day}. Dates on the attendance pages now follow ${day}s. Past records are kept.`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="sabha-day">Sabha day (default: Friday)</label>
          <select id="sabha-day" value={day} onChange={(e) => setDay(e.target.value as Weekday)}>
            {WEEKDAYS.map((w) => (
              <option key={w} value={w}>{w[0].toUpperCase() + w.slice(1)}</option>
            ))}
          </select>
        </div>
        <button className="btn" type="button" onClick={save} disabled={busy || day === current}>
          {busy ? 'Saving...' : 'Save sabha day'}
        </button>
      </div>
      {msg && <div className="success" role="status" style={{ marginTop: 10 }}>{msg}</div>}
      {err && <div className="error" role="alert" style={{ marginTop: 10 }}>{err}</div>}
    </div>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn ghost small"
      type="button"
      onClick={async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        router.replace('/admin/login');
        router.refresh();
      }}
    >
      Sign out
    </button>
  );
}
