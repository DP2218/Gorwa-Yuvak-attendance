'use client';

import { useState, useEffect, useMemo, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Group, Yuvak } from '@/lib/data';
import { formatDate } from '@/lib/dates';

export type YuvakRow = Yuvak & {
  // ISO date for input: YYYY-MM-DD
  inputBirthDate: string;
};

type Props = {
  group: Group;
  allGroups: Group[];
  initialYuvaks: Yuvak[];
  allYuvaksSummary: { id: number; name: string; mobile: string | null; groupCode: string }[];
  date: string;
  dateOptions: string[];
  initialPresentIds: number[];
};

function toInputDate(val: string | null | undefined): string {
  if (!val) return '';
  const s = val.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return s;
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }
  return '';
}

function toDisplayDate(val: string | null | undefined): string {
  if (!val) return '-';
  const s = val.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[3]}-${isoMatch[2]}-${isoMatch[1]}`;
  }
  return s;
}

function cleanDigits(val: string | null | undefined): string {
  if (!val) return '';
  return val.replace(/\D/g, '');
}

export default function AdminGroupDetailClient({
  group: initialGroup,
  allGroups,
  initialYuvaks,
  allYuvaksSummary,
  date,
  dateOptions,
  initialPresentIds,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Group leader state
  const [group, setGroup] = useState<Group>(initialGroup);
  const [isEditingLeader, setIsEditingLeader] = useState(false);
  const [leaderInput, setLeaderInput] = useState(initialGroup.leader_name ?? '');
  const [savingLeader, setSavingLeader] = useState(false);

  // Yuvak rows state
  const [rows, setRows] = useState<YuvakRow[]>(() =>
    initialYuvaks.map((y) => ({
      ...y,
      inputBirthDate: toInputDate(y.birth_date),
    }))
  );

  // Dirty rows tracking: Map<yuvakId, Partial<YuvakRow>>
  const [dirtyEdits, setDirtyEdits] = useState<Map<number, Partial<YuvakRow>>>(new Map());
  const [rowSavingId, setRowSavingId] = useState<number | null>(null);
  const [rowErrors, setRowErrors] = useState<Map<number, string>>(new Map());

  // Attendance state: Set of present yuvak IDs
  const [presentSet, setPresentSet] = useState<Set<number>>(new Set(initialPresentIds));

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Toast notification
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // Modal / Bottom sheet form state (for full edit or add)
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null);
  const [formYuvakId, setFormYuvakId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    form_id: '',
    name: '',
    birth_date: '',
    address: '',
    mobile: '',
    whatsapp: '',
    home_phone: '',
    education: '',
    group_id: initialGroup.id,
    whatsappSameAsMobile: false,
    overrideDuplicateMobile: false,
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [formWarning, setFormWarning] = useState<string | null>(null);
  const [submittingForm, setSubmittingForm] = useState(false);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState<YuvakRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Duplicate mobile warning modal for inline save
  const [dupPrompt, setDupPrompt] = useState<{
    yuvakId: number;
    message: string;
  } | null>(null);

  // Unsaved changes confirm dialog on back
  const [showLeavePrompt, setShowLeavePrompt] = useState(false);

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 3500);
  }

  // Warn on page unload if unsaved changes exist
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (dirtyEdits.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtyEdits.size]);

  // Derived stats
  const totalYuvaks = rows.length;
  const presentCount = rows.filter((y) => presentSet.has(y.id)).length;
  const percentage = totalYuvaks > 0 ? Math.round((presentCount / totalYuvaks) * 100) : 0;

  // Filtered rows by search query
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((y) => {
      const name = (y.name || '').toLowerCase();
      const mobile = (y.mobile || '').toLowerCase();
      const formId = (y.form_id || '').toLowerCase();
      const sr = String(y.serial_no ?? '');
      return name.includes(q) || mobile.includes(q) || formId.includes(q) || sr.includes(q);
    });
  }, [rows, searchQuery]);

  // Handle Leader Save
  async function handleSaveLeader() {
    setSavingLeader(true);
    try {
      const res = await fetch(`/api/admin/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaderName: leaderInput }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update leader');
      }
      setGroup((prev) => ({ ...prev, leader_name: data.group.leader_name }));
      setIsEditingLeader(false);
      showToast('Leader saved');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error updating leader';
      showToast(msg, true);
    } finally {
      setSavingLeader(false);
    }
  }

  // Handle Attendance Toggle
  async function handleToggleAttendance(yuvakId: number) {
    const isCurrentlyPresent = presentSet.has(yuvakId);
    const nextPresent = !isCurrentlyPresent;

    // Optimistic update
    setPresentSet((prev) => {
      const next = new Set(prev);
      if (nextPresent) next.add(yuvakId);
      else next.delete(yuvakId);
      return next;
    });

    try {
      const res = await fetch('/api/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yuvak_id: yuvakId,
          session_date: date,
          present: nextPresent,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update attendance');
      }
      showToast(nextPresent ? 'Marked Present' : 'Marked Absent');
      router.refresh();
    } catch (err) {
      // Revert optimistic update
      setPresentSet((prev) => {
        const next = new Set(prev);
        if (isCurrentlyPresent) next.add(yuvakId);
        else next.delete(yuvakId);
        return next;
      });
      const msg = err instanceof Error ? err.message : 'Failed to update attendance';
      showToast(msg, true);
    }
  }

  // Update inline row edit
  function handleInlineChange(id: number, field: keyof YuvakRow, value: unknown) {
    // Clear inline error
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    setDirtyEdits((prev) => {
      const next = new Map(prev);
      const existing = next.get(id) ?? {};
      next.set(id, { ...existing, [field]: value });
      return next;
    });

    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        if (field === 'inputBirthDate') {
          return { ...r, inputBirthDate: String(value), birth_date: String(value) };
        }
        return { ...r, [field]: value };
      })
    );
  }

  // Save inline row edit
  async function handleSaveRow(id: number, overrideDuplicate = false) {
    const row = rows.find((r) => r.id === id);
    if (!row) return;

    // Inline validation
    const name = (row.name || '').trim();
    if (name.length < 2) {
      setRowErrors((prev) => new Map(prev).set(id, 'Name must be at least 2 characters'));
      return;
    }

    const mob = cleanDigits(row.mobile);
    if (mob && mob.length !== 10) {
      setRowErrors((prev) => new Map(prev).set(id, 'Mobile must be 10 digits'));
      return;
    }

    const wa = cleanDigits(row.whatsapp);
    if (wa && wa.length !== 10) {
      setRowErrors((prev) => new Map(prev).set(id, 'WhatsApp must be 10 digits'));
      return;
    }

    const hp = cleanDigits(row.home_phone);
    if (hp && hp.length !== 10) {
      setRowErrors((prev) => new Map(prev).set(id, 'Home phone must be 10 digits'));
      return;
    }

    if (row.inputBirthDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (row.inputBirthDate > today) {
        setRowErrors((prev) => new Map(prev).set(id, 'Birth date cannot be in the future'));
        return;
      }
    }

    setRowSavingId(id);
    setRowErrors((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });

    try {
      const payload = {
        name,
        form_id: row.form_id || null,
        birth_date: row.inputBirthDate || null,
        address: row.address || null,
        mobile: mob || null,
        whatsapp: wa || null,
        home_phone: hp || null,
        education: row.education || null,
        group_id: row.group_id,
        overrideDuplicateMobile: overrideDuplicate,
      };

      const res = await fetch(`/api/admin/yuvaks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data.canOverride) {
        // Duplicate mobile warning prompt
        setDupPrompt({ yuvakId: id, message: data.warning });
        setRowSavingId(null);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save changes');
      }

      // Check if yuvak was moved to another group
      if (row.group_id !== group.id) {
        setRows((prev) => prev.filter((r) => r.id !== id));
        const destGroup = allGroups.find((g) => g.id === row.group_id)?.code ?? 'other group';
        showToast(`Saved and moved to ${destGroup}`);
      } else {
        setRows((prev) =>
          prev.map((r) =>
            r.id === id
              ? {
                  ...r,
                  ...data.yuvak,
                  inputBirthDate: toInputDate(data.yuvak.birth_date),
                }
              : r
          )
        );
        showToast('Saved');
      }

      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save row';
      setRowErrors((prev) => new Map(prev).set(id, msg));
      showToast(msg, true);
    } finally {
      setRowSavingId(null);
    }
  }

  // Open Edit Form Modal / Bottom sheet
  function openEditModal(y: YuvakRow) {
    setFormMode('edit');
    setFormYuvakId(y.id);
    const mobDigits = cleanDigits(y.mobile);
    const waDigits = cleanDigits(y.whatsapp);
    setFormData({
      form_id: y.form_id || '',
      name: y.name || '',
      birth_date: toInputDate(y.birth_date),
      address: y.address || '',
      mobile: mobDigits,
      whatsapp: waDigits,
      home_phone: cleanDigits(y.home_phone),
      education: y.education || '',
      group_id: y.group_id ?? group.id,
      whatsappSameAsMobile: Boolean(mobDigits && mobDigits === waDigits),
      overrideDuplicateMobile: false,
    });
    setFormError(null);
    setFormWarning(null);
  }

  // Open Add Form Modal / Bottom sheet
  function openAddModal() {
    setFormMode('add');
    setFormYuvakId(null);
    setFormData({
      form_id: '',
      name: '',
      birth_date: '',
      address: '',
      mobile: '',
      whatsapp: '',
      home_phone: '',
      education: '',
      group_id: group.id,
      whatsappSameAsMobile: false,
      overrideDuplicateMobile: false,
    });
    setFormError(null);
    setFormWarning(null);
  }

  // Submit Modal Form (Add or Edit)
  async function handleSubmitModalForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormWarning(null);

    const name = formData.name.trim();
    if (name.length < 2) {
      setFormError('Name is required (at least 2 characters)');
      return;
    }

    const mob = cleanDigits(formData.mobile);
    if (mob && mob.length !== 10) {
      setFormError('Mobile number must be exactly 10 digits');
      return;
    }

    const wa = cleanDigits(formData.whatsapp);
    if (wa && wa.length !== 10) {
      setFormError('WhatsApp number must be exactly 10 digits');
      return;
    }

    const hp = cleanDigits(formData.home_phone);
    if (hp && hp.length !== 10) {
      setFormError('Home phone must be exactly 10 digits');
      return;
    }

    if (formData.birth_date) {
      const today = new Date().toISOString().slice(0, 10);
      if (formData.birth_date > today) {
        setFormError('Birth date cannot be in the future');
        return;
      }
    }

    setSubmittingForm(true);

    try {
      const payload = {
        name,
        form_id: formData.form_id.trim() || null,
        birth_date: formData.birth_date || null,
        address: formData.address.trim() || null,
        mobile: mob || null,
        whatsapp: wa || null,
        home_phone: hp || null,
        education: formData.education.trim() || null,
        group_id: formData.group_id,
        overrideDuplicateMobile: formData.overrideDuplicateMobile,
      };

      if (formMode === 'add') {
        const res = await fetch(`/api/admin/groups/${group.id}/yuvaks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 409 && data.canOverride) {
          setFormWarning(data.warning);
          setSubmittingForm(false);
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Failed to add yuvak');
        }

        const newYuvak: YuvakRow = {
          ...data.yuvak,
          inputBirthDate: toInputDate(data.yuvak.birth_date),
        };

        if (data.yuvak.group_id === group.id) {
          setRows((prev) => [...prev, newYuvak]);
        }
        showToast('Yuvak added');
        setFormMode(null);
        router.refresh();
      } else if (formMode === 'edit' && formYuvakId) {
        const res = await fetch(`/api/admin/yuvaks/${formYuvakId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));

        if (res.status === 409 && data.canOverride) {
          setFormWarning(data.warning);
          setSubmittingForm(false);
          return;
        }

        if (!res.ok) {
          throw new Error(data.error || 'Failed to update yuvak');
        }

        // If moved to another group
        if (data.yuvak.group_id !== group.id) {
          setRows((prev) => prev.filter((r) => r.id !== formYuvakId));
          const destGroup = allGroups.find((g) => g.id === data.yuvak.group_id)?.code ?? 'other group';
          showToast(`Saved and moved to ${destGroup}`);
        } else {
          setRows((prev) =>
            prev.map((r) =>
              r.id === formYuvakId
                ? {
                    ...r,
                    ...data.yuvak,
                    inputBirthDate: toInputDate(data.yuvak.birth_date),
                  }
                : r
            )
          );
          showToast('Saved');
        }

        setDirtyEdits((prev) => {
          const next = new Map(prev);
          next.delete(formYuvakId);
          return next;
        });

        setFormMode(null);
        router.refresh();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error saving yuvak';
      setFormError(msg);
      showToast(msg, true);
    } finally {
      setSubmittingForm(false);
    }
  }

  // Handle Delete Confirmation
  async function handleConfirmDelete() {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    const target = deleteTarget;

    try {
      const res = await fetch(`/api/admin/yuvaks/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete yuvak');
      }

      setRows((prev) => prev.filter((r) => r.id !== target.id));
      setPresentSet((prev) => {
        const next = new Set(prev);
        next.delete(target.id);
        return next;
      });
      setDirtyEdits((prev) => {
        const next = new Map(prev);
        next.delete(target.id);
        return next;
      });

      setDeleteTarget(null);
      showToast('Yuvak deleted');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete yuvak';
      showToast(msg, true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="wrap">
      {/* Back Link */}
      <div style={{ margin: '0 0 12px' }}>
        <button
          type="button"
          onClick={() => {
            if (dirtyEdits.size > 0) {
              setShowLeavePrompt(true);
            } else {
              router.push(`/admin?date=${date}`);
            }
          }}
          className="btn-icon"
          style={{ padding: 0, color: 'var(--accent)', fontWeight: 600, minHeight: 'auto', minWidth: 'auto' }}
        >
          ← Back to admin
        </button>
      </div>

      {/* Header and Leader Edit */}
      <div className="card">
        <div className="group-header-row">
          <div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {group.code}
              {group.code === 'NEW' && (
                <span className="tag" style={{ fontSize: '0.8rem', padding: '2px 8px' }}>
                  New Yuvaks
                </span>
              )}
            </h1>

            {/* Editable Leader Field */}
            <div className="leader-edit-box">
              {isEditingLeader ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    value={leaderInput}
                    onChange={(e) => setLeaderInput(e.target.value)}
                    placeholder="Enter group leader name"
                    style={{ maxWidth: 300, minHeight: 44, fontSize: 16 }}
                    disabled={savingLeader}
                    autoFocus
                  />
                  <button
                    className="btn small"
                    onClick={handleSaveLeader}
                    disabled={savingLeader}
                  >
                    {savingLeader ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => {
                      setLeaderInput(group.leader_name ?? '');
                      setIsEditingLeader(false);
                    }}
                    disabled={savingLeader}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="leader-badge">
                  <span>Leader:</span>
                  <strong>{group.leader_name ? group.leader_name : 'No leader assigned'}</strong>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => {
                      setLeaderInput(group.leader_name ?? '');
                      setIsEditingLeader(true);
                    }}
                    title="Edit leader name"
                    aria-label="Edit leader name"
                    style={{ minHeight: 32, minWidth: 32, padding: 4 }}
                  >
                    ✏️
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Date Selector */}
          <div style={{ minWidth: 200 }}>
            <label htmlFor="sabhaDateSelect" style={{ fontSize: '0.85rem' }}>
              Sabha Date:
            </label>
            <select
              id="sabhaDateSelect"
              value={date}
              onChange={(e) => {
                const newDate = e.target.value;
                if (dirtyEdits.size > 0) {
                  if (!confirm('You have unsaved edits. Change date anyway?')) return;
                }
                router.push(`/admin/group/${group.id}?date=${newDate}`);
              }}
              style={{ fontSize: 16, minHeight: 44 }}
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>
                  {formatDate(d)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Small Stats: Present, In List, Percentage */}
        <div className="stats" style={{ margin: '14px 0 0' }}>
          <div className="stat">
            <span className="muted">Present ({formatDate(date)})</span>
            <b style={{ color: 'var(--ok)' }}>{presentCount}</b>
          </div>
          <div className="stat">
            <span className="muted">In List</span>
            <b>{totalYuvaks}</b>
          </div>
          <div className="stat">
            <span className="muted">Attendance</span>
            <b>{percentage}%</b>
          </div>
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {dirtyEdits.size > 0 && (
        <div className="unsaved-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="unsaved-badge">Unsaved Changes</span>
            <span>You have unsaved edits on {dirtyEdits.size} yuvak(s). Remember to click "Save" per row.</span>
          </div>
          <button
            className="btn small ghost"
            onClick={() => {
              // Reset all dirty edits back to saved rows
              setDirtyEdits(new Map());
              setRows(initialYuvaks.map((y) => ({ ...y, inputBirthDate: toInputDate(y.birth_date) })));
              showToast('Edits reverted');
            }}
          >
            Revert all
          </button>
        </div>
      )}

      {/* Search and + Add Yuvak Toolbar */}
      <div className="card" style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1 1 280px', position: 'relative' }}>
            <input
              type="search"
              placeholder="Search by name, mobile, or SR.NO..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ fontSize: 16, minHeight: 44 }}
            />
          </div>
          <button
            type="button"
            className="btn"
            onClick={openAddModal}
            style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <span>+</span> Add Yuvak
          </button>
        </div>
      </div>

      {/* Yuvaks Section */}
      <div className="card">
        <h2 style={{ marginBottom: 12 }}>
          Yuvaks in {group.code} ({filteredRows.length})
        </h2>

        {/* 1. Desktop View: Editable Table */}
        <div className="yuvak-desktop-table">
          <div className="table-wrap">
            <table className="table-editable">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>SR</th>
                  <th style={{ width: 80 }}>Form ID</th>
                  <th style={{ minWidth: 160 }}>Yuvak Name *</th>
                  <th style={{ width: 130 }}>Birth Date</th>
                  <th style={{ minWidth: 130 }}>Address</th>
                  <th style={{ width: 110 }}>Mobile</th>
                  <th style={{ width: 110 }}>WhatsApp</th>
                  <th style={{ width: 110 }}>Home Phone</th>
                  <th style={{ minWidth: 110 }}>Education</th>
                  <th style={{ width: 95 }}>Group</th>
                  <th style={{ width: 85, textAlign: 'center' }}>Attendance</th>
                  <th style={{ width: 130, textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>
                      {searchQuery ? 'No matching yuvaks found.' : 'No yuvaks in this group.'}
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((y, idx) => {
                    const isDirty = dirtyEdits.has(y.id);
                    const isSaving = rowSavingId === y.id;
                    const errorMsg = rowErrors.get(y.id);
                    const isPresent = presentSet.has(y.id);

                    return (
                      <tr key={y.id} className={isDirty ? 'row-dirty' : ''}>
                        {/* SR.NO (read-only, auto) */}
                        <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--muted)' }}>
                          {y.serial_no ?? idx + 1}
                        </td>

                        {/* Form ID */}
                        <td>
                          <input
                            type="text"
                            value={y.form_id ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'form_id', e.target.value)}
                            placeholder="Form ID"
                            style={{ width: 75 }}
                          />
                        </td>

                        {/* Yuvak Name */}
                        <td>
                          <input
                            type="text"
                            value={y.name}
                            onChange={(e) => handleInlineChange(y.id, 'name', e.target.value)}
                            placeholder="Full name *"
                            required
                          />
                          {errorMsg && (
                            <div style={{ color: 'var(--danger)', fontSize: '0.75rem', marginTop: 2 }}>
                              {errorMsg}
                            </div>
                          )}
                        </td>

                        {/* Birth Date */}
                        <td>
                          <input
                            type="date"
                            value={y.inputBirthDate}
                            onChange={(e) => handleInlineChange(y.id, 'inputBirthDate', e.target.value)}
                            title={toDisplayDate(y.birth_date)}
                            style={{ width: 125 }}
                          />
                        </td>

                        {/* Address */}
                        <td>
                          <input
                            type="text"
                            value={y.address ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'address', e.target.value)}
                            placeholder="Address"
                          />
                        </td>

                        {/* Mobile */}
                        <td>
                          <input
                            type="tel"
                            maxLength={10}
                            value={y.mobile ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'mobile', e.target.value)}
                            placeholder="10 digits"
                            style={{ width: 100 }}
                          />
                        </td>

                        {/* WhatsApp */}
                        <td>
                          <input
                            type="tel"
                            maxLength={10}
                            value={y.whatsapp ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'whatsapp', e.target.value)}
                            placeholder="10 digits"
                            style={{ width: 100 }}
                          />
                        </td>

                        {/* Home Phone */}
                        <td>
                          <input
                            type="tel"
                            maxLength={10}
                            value={y.home_phone ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'home_phone', e.target.value)}
                            placeholder="10 digits"
                            style={{ width: 100 }}
                          />
                        </td>

                        {/* Education */}
                        <td>
                          <input
                            type="text"
                            value={y.education ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'education', e.target.value)}
                            placeholder="Education"
                          />
                        </td>

                        {/* Group Move */}
                        <td>
                          <select
                            value={y.group_id ?? ''}
                            onChange={(e) => handleInlineChange(y.id, 'group_id', Number(e.target.value))}
                            style={{ width: 90 }}
                          >
                            {allGroups.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.code}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Attendance Toggle */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className={`btn-att-toggle ${isPresent ? 'present' : 'absent'}`}
                            onClick={() => handleToggleAttendance(y.id)}
                            style={{ minHeight: 34, padding: '4px 8px', fontSize: '0.8rem' }}
                            title="Toggle attendance"
                          >
                            {isPresent ? '✓ Present' : 'Absent'}
                          </button>
                        </td>

                        {/* Actions */}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn small"
                              disabled={!isDirty || isSaving}
                              onClick={() => handleSaveRow(y.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '0.8rem',
                                opacity: isDirty ? 1 : 0.4,
                              }}
                              title="Save row changes"
                            >
                              {isSaving ? '...' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="btn ghost small"
                              onClick={() => openEditModal(y)}
                              style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                              title="Full edit form"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="btn-delete"
                              onClick={() => setDeleteTarget(y)}
                              style={{ minHeight: 32, minWidth: 32, padding: '4px 6px' }}
                              title="Delete yuvak"
                            >
                              🗑️
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 2. Mobile View: Cards */}
        <div className="yuvak-cards-container">
          {filteredRows.length === 0 ? (
            <p className="muted" style={{ textAlign: 'center', padding: 24 }}>
              {searchQuery ? 'No matching yuvaks found.' : 'No yuvaks in this group.'}
            </p>
          ) : (
            filteredRows.map((y, idx) => {
              const isDirty = dirtyEdits.has(y.id);
              const isSaving = rowSavingId === y.id;
              const isPresent = presentSet.has(y.id);

              return (
                <div key={y.id} className={`yuvak-card ${isDirty ? 'row-dirty' : ''}`}>
                  <div className="yuvak-card-header">
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span className="pill off" style={{ fontSize: '0.75rem' }}>
                          #{y.serial_no ?? idx + 1}
                        </span>
                        {y.form_id && (
                          <span className="pill off" style={{ fontSize: '0.75rem' }}>
                            Form: {y.form_id}
                          </span>
                        )}
                        {isDirty && <span className="unsaved-badge">Unsaved</span>}
                      </div>
                      <div className="yuvak-card-title">{y.name}</div>
                    </div>

                    {/* Attendance Toggle (44px min tap target) */}
                    <button
                      type="button"
                      className={`btn-att-toggle ${isPresent ? 'present' : 'absent'}`}
                      onClick={() => handleToggleAttendance(y.id)}
                    >
                      {isPresent ? '✓ Present' : 'Absent'}
                    </button>
                  </div>

                  <div className="yuvak-card-grid">
                    <div>
                      Mobile: <b>{y.mobile || '-'}</b>
                    </div>
                    <div>
                      DOB: <b>{toDisplayDate(y.birth_date)}</b>
                    </div>
                    <div>
                      WhatsApp: <b>{y.whatsapp || '-'}</b>
                    </div>
                    <div>
                      Education: <b>{y.education || '-'}</b>
                    </div>
                  </div>

                  {y.address && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Addr: <span style={{ color: 'var(--ink)' }}>{y.address}</span>
                    </div>
                  )}

                  <div className="yuvak-card-actions">
                    {isDirty && (
                      <button
                        type="button"
                        className="btn small"
                        disabled={isSaving}
                        onClick={() => handleSaveRow(y.id)}
                        style={{ minHeight: 44, padding: '8px 14px' }}
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => openEditModal(y)}
                      style={{ minHeight: 44, padding: '8px 14px' }}
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      className="btn-delete"
                      onClick={() => setDeleteTarget(y)}
                    >
                      🗑️ <span className="btn-delete-text">Delete</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Full Modal Form / Mobile Bottom Sheet for Add & Edit */}
      {formMode && (
        <div className="bottom-sheet-overlay" onClick={() => !submittingForm && setFormMode(null)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <h3>{formMode === 'add' ? '+ Add New Yuvak' : 'Edit Yuvak Details'}</h3>
              <button
                type="button"
                className="bottom-sheet-close"
                onClick={() => setFormMode(null)}
                disabled={submittingForm}
              >
                ✕
              </button>
            </div>

            {formError && <div className="error">{formError}</div>}

            {formWarning && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #fcd34d',
                  borderRadius: 10,
                  padding: '10px 14px',
                  marginBottom: 14,
                  color: '#92400e',
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>⚠️ Warning: Duplicate mobile number</div>
                <div>{formWarning}</div>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                    color: '#78350f',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={formData.overrideDuplicateMobile}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, overrideDuplicateMobile: e.target.checked }))
                    }
                    style={{ width: 'auto', minHeight: 'auto' }}
                  />
                  Allow duplicate mobile number and save anyway
                </label>
              </div>
            )}

            <form onSubmit={handleSubmitModalForm}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {/* Form ID */}
                <div className="field">
                  <label htmlFor="modalFormId">Form ID</label>
                  <input
                    id="modalFormId"
                    type="text"
                    value={formData.form_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, form_id: e.target.value }))}
                    placeholder="e.g. 101"
                  />
                </div>

                {/* Name */}
                <div className="field">
                  <label htmlFor="modalName">YUVAK NAME *</label>
                  <input
                    id="modalName"
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="SURNAME FIRSTNAME FATHERNAME"
                  />
                </div>

                {/* Birth Date */}
                <div className="field">
                  <label htmlFor="modalBirthDate">BIRTH DATE</label>
                  <input
                    id="modalBirthDate"
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, birth_date: e.target.value }))}
                  />
                  {formData.birth_date && (
                    <span className="muted" style={{ fontSize: '0.8rem', marginTop: 2, display: 'block' }}>
                      Stored as date, displayed as: {toDisplayDate(formData.birth_date)}
                    </span>
                  )}
                </div>

                {/* Group */}
                <div className="field">
                  <label htmlFor="modalGroup">GROUP</label>
                  <select
                    id="modalGroup"
                    value={formData.group_id}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, group_id: Number(e.target.value) }))
                    }
                  >
                    {allGroups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.code} {g.leader_name ? `(${g.leader_name})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Mobile */}
                <div className="field">
                  <label htmlFor="modalMobile">MOBILE (10 digits)</label>
                  <input
                    id="modalMobile"
                    type="tel"
                    maxLength={10}
                    value={formData.mobile}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        mobile: val,
                        whatsapp: prev.whatsappSameAsMobile ? val : prev.whatsapp,
                      }));
                    }}
                    placeholder="10-digit mobile number"
                  />
                </div>

                {/* WhatsApp */}
                <div className="field">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <label htmlFor="modalWhatsapp" style={{ margin: 0 }}>
                      WHATSAPP (10 digits)
                    </label>
                    <label
                      style={{
                        margin: 0,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        color: 'var(--ink)',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.whatsappSameAsMobile}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setFormData((prev) => ({
                            ...prev,
                            whatsappSameAsMobile: checked,
                            whatsapp: checked ? prev.mobile : prev.whatsapp,
                          }));
                        }}
                        style={{ width: 'auto', minHeight: 'auto' }}
                      />
                      Same as mobile
                    </label>
                  </div>
                  <input
                    id="modalWhatsapp"
                    type="tel"
                    maxLength={10}
                    value={formData.whatsapp}
                    disabled={formData.whatsappSameAsMobile}
                    onChange={(e) => setFormData((prev) => ({ ...prev, whatsapp: e.target.value }))}
                    placeholder="10-digit WhatsApp number"
                  />
                </div>

                {/* Home Phone */}
                <div className="field">
                  <label htmlFor="modalHomePhone">HOME PHONE (10 digits)</label>
                  <input
                    id="modalHomePhone"
                    type="tel"
                    maxLength={10}
                    value={formData.home_phone}
                    onChange={(e) => setFormData((prev) => ({ ...prev, home_phone: e.target.value }))}
                    placeholder="Optional 10 digits"
                  />
                </div>

                {/* Education */}
                <div className="field">
                  <label htmlFor="modalEducation">EDUCATION DETAIL</label>
                  <input
                    id="modalEducation"
                    type="text"
                    value={formData.education}
                    onChange={(e) => setFormData((prev) => ({ ...prev, education: e.target.value }))}
                    placeholder="Degree, College, or Field"
                  />
                </div>
              </div>

              {/* Address (Multiline) */}
              <div className="field" style={{ marginTop: 4 }}>
                <label htmlFor="modalAddress">ADDRESS (multi-line)</label>
                <textarea
                  id="modalAddress"
                  rows={2}
                  value={formData.address}
                  onChange={(e) => setFormData((prev) => ({ ...prev, address: e.target.value }))}
                  placeholder="Street, Area, City"
                />
              </div>

              {/* Modal Buttons */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => setFormMode(null)}
                  disabled={submittingForm}
                  style={{ minHeight: 44 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn"
                  disabled={submittingForm}
                  style={{ minHeight: 44 }}
                >
                  {submittingForm ? 'Saving...' : formMode === 'add' ? 'Add Yuvak' : 'Save Details'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteTarget(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Yuvak</h3>
            <p>
              Are you sure you want to permanently delete <strong>{deleteTarget.name}</strong>?
            </p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              This will remove the yuvak and all their attendance records from the database. This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{ minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
                style={{ minHeight: 44 }}
              >
                {deleting ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Mobile Prompt Modal for Inline Save */}
      {dupPrompt && (
        <div className="modal-overlay" onClick={() => setDupPrompt(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Duplicate Mobile Warning</h3>
            <p>{dupPrompt.message}</p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              Do you want to override this warning and save this mobile number anyway?
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setDupPrompt(null)}
                style={{ minHeight: 44 }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  const targetId = dupPrompt.yuvakId;
                  setDupPrompt(null);
                  handleSaveRow(targetId, true);
                }}
                style={{ minHeight: 44 }}
              >
                Override & Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Leave Prompt Modal */}
      {showLeavePrompt && (
        <div className="modal-overlay" onClick={() => setShowLeavePrompt(false)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Unsaved Changes</h3>
            <p>
              You have unsaved edits on <strong>{dirtyEdits.size} yuvak(s)</strong>.
            </p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              If you leave now, your changes will not be saved.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setShowLeavePrompt(false)}
                style={{ minHeight: 44 }}
              >
                Stay on page
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={() => {
                  setShowLeavePrompt(false);
                  router.push(`/admin?date=${date}`);
                }}
                style={{ minHeight: 44 }}
              >
                Leave without saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.isError ? 'error' : ''}`}>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
