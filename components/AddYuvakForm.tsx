'use client';

import { useState } from 'react';
import type { Group, Yuvak } from '@/lib/data';

type Props = {
  groups?: Group[];           // if omitted the yuvak goes to fixedGroupId
  fixedGroupId?: number;
  initialName?: string;
  onAdded: (y: Yuvak) => void;
};

export default function AddYuvakForm({ groups, fixedGroupId, initialName = '', onAdded }: Props) {
  const newGroup = groups?.find((g) => g.code === 'NEW');
  const [name, setName] = useState(initialName);
  const [groupId, setGroupId] = useState<number | ''>(fixedGroupId ?? newGroup?.id ?? groups?.[0]?.id ?? '');
  const [birth, setBirth] = useState('');
  const [mobile, setMobile] = useState('');
  const [education, setEducation] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await fetch('/api/yuvaks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          group_id: fixedGroupId ?? (groupId === '' ? null : groupId),
          birth_date: birth,
          mobile,
          education,
          address,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not save. Try again.');
        return;
      }
      onAdded(json.yuvak as Yuvak);
      setName(''); setBirth(''); setMobile(''); setEducation(''); setAddress('');
    } catch {
      setError('Network problem. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="add-name">Full name (as on the form) *</label>
        <input id="add-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} />
      </div>
      {!fixedGroupId && groups && (
        <div className="field">
          <label htmlFor="add-group">Group</label>
          <select id="add-group" value={groupId} onChange={(e) => setGroupId(Number(e.target.value))}>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code}{g.leader_name && g.code !== 'NEW' ? ` - ${g.leader_name}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="row" style={{ gap: 12 }}>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label htmlFor="add-birth">Birth date (DD-MM-YYYY)</label>
          <input id="add-birth" value={birth} onChange={(e) => setBirth(e.target.value)} placeholder="23-04-2001" />
        </div>
        <div className="field" style={{ flex: '1 1 160px' }}>
          <label htmlFor="add-mobile">Mobile</label>
          <input id="add-mobile" inputMode="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10 digits" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="add-edu">Education / work</label>
        <input id="add-edu" value={education} onChange={(e) => setEducation(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="add-address">Address</label>
        <input id="add-address" value={address} onChange={(e) => setAddress(e.target.value)} />
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      <button className="btn" type="submit" disabled={saving || name.trim().length < 2}>
        {saving ? 'Saving...' : 'Save new yuvak'}
      </button>
    </form>
  );
}
