'use client';

import { useState, useCallback } from 'react';

type Group = { id: number; code: string };

type Props = {
  defaultDate: string;
  year: number;
  sabhaDay: string;
  dateOptions: string[];
  groups: Group[];
  /** Legacy CSV download links kept as secondary */
  csvDateHref: string;
  csvYearHref: string;
};

function formatHeaderDate(isoDate: string): string {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p = isoDate.split('-');
  if (p.length === 3) {
    return `${Number(p[2])} ${MONTHS[Number(p[1]) - 1] ?? p[1]} ${p[0]}`;
  }
  return isoDate;
}

type Mode = 'single' | 'range' | 'year';
type Toast = { type: 'error' | 'info'; msg: string } | null;

export default function AdminDownloads({
  defaultDate,
  year,
  sabhaDay,
  dateOptions,
  groups,
  csvDateHref,
  csvYearHref,
}: Props) {
  const [mode, setMode] = useState<Mode>('single');
  const [selDate, setSelDate] = useState(defaultDate);
  const [fromDate, setFromDate] = useState(defaultDate);
  const [toDate, setToDate] = useState(defaultDate);
  const [selYear, setSelYear] = useState(year);
  const [selGroup, setSelGroup] = useState('all');
  const [includeDetails, setIncludeDetails] = useState(true);
  const [markAbsent, setMarkAbsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const showToast = useCallback((type: 'error' | 'info', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const buildUrl = () => {
    const params = new URLSearchParams();
    params.set('mode', mode);
    params.set('group', selGroup);
    params.set('details', includeDetails ? '1' : '0');
    params.set('absent', markAbsent ? '1' : '0');
    if (mode === 'single') {
      if (!selDate) return null;
      params.set('date', selDate);
    } else if (mode === 'range') {
      if (!fromDate || !toDate) return null;
      if (fromDate > toDate) return null;
      params.set('from', fromDate);
      params.set('to', toDate);
    } else if (mode === 'year') {
      params.set('year', String(selYear));
    }
    return `/api/admin/export-xlsx?${params}`;
  };

  const handleDownload = async () => {
    if (mode === 'range' && fromDate > toDate) {
      showToast('error', '"From" date must not be after "To" date.');
      return;
    }
    const href = buildUrl();
    if (!href) {
      showToast('error', 'Please fill in all required date fields.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(href);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? `Server error ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const fnMatch = cd.match(/filename="([^"]+)"/);
      const filename = fnMatch ? fnMatch[1] : 'attendance.xlsx';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Download failed');
    } finally {
      setLoading(false);
    }
  };

  const dayName = sabhaDay[0].toUpperCase() + sabhaDay.slice(1);

  const yearOptions: number[] = [];
  for (let y = year - 1; y <= year + 2; y++) yearOptions.push(y);

  return (
    <>
      {toast && (
        <div
          className={`toast${toast.type === 'error' ? ' error' : ''}`}
          role="alert"
          aria-live="assertive"
        >
          {toast.type === 'error' ? '⚠ ' : 'ℹ '}{toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Mode selector */}
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '.9rem', color: 'var(--muted)', marginBottom: 8 }}>
            Date selection
          </legend>
          <div className="row" style={{ gap: 16 }}>
            {(['single', 'range', 'year'] as Mode[]).map((m) => (
              <label
                key={m}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.95rem' }}
              >
                <input
                  type="radio"
                  name="dl-mode"
                  value={m}
                  checked={mode === m}
                  onChange={() => setMode(m)}
                  style={{ width: 'auto', accentColor: 'var(--accent)' }}
                />
                {m === 'single' ? 'Single date' : m === 'range' ? 'Date range' : 'Whole year'}
              </label>
            ))}
          </div>
        </fieldset>

        {/* Date pickers */}
        {mode === 'single' && (
          <div>
            <label htmlFor="dl-date">Sabha date</label>
            <select
              id="dl-date"
              value={selDate}
              onChange={(e) => setSelDate(e.target.value)}
            >
              {dateOptions.map((d) => (
                <option key={d} value={d}>{formatHeaderDate(d)}</option>
              ))}
            </select>
          </div>
        )}

        {mode === 'range' && (
          <div className="row" style={{ alignItems: 'flex-end', gap: 12 }}>
            <div style={{ flex: '1 1 180px' }}>
              <label htmlFor="dl-from">From date</label>
              <input
                id="dl-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div style={{ flex: '1 1 180px' }}>
              <label htmlFor="dl-to">To date</label>
              <input
                id="dl-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>
        )}

        {mode === 'year' && (
          <div>
            <label htmlFor="dl-year">Year</label>
            <select
              id="dl-year"
              value={selYear}
              onChange={(e) => setSelYear(Number(e.target.value))}
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y} (all {dayName}s)</option>
              ))}
            </select>
          </div>
        )}

        {/* Group selector */}
        <div>
          <label htmlFor="dl-group">Groups</label>
          <select
            id="dl-group"
            value={selGroup}
            onChange={(e) => setSelGroup(e.target.value)}
          >
            <option value="all">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={String(g.id)}>{g.code}</option>
            ))}
          </select>
        </div>

        {/* Options */}
        <div className="row" style={{ gap: 20 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.9rem' }}>
            <input
              id="dl-details"
              type="checkbox"
              checked={includeDetails}
              onChange={(e) => setIncludeDetails(e.target.checked)}
              style={{ width: 'auto', accentColor: 'var(--accent)' }}
            />
            Include yuvak detail columns
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.9rem' }}>
            <input
              id="dl-absent"
              type="checkbox"
              checked={markAbsent}
              onChange={(e) => setMarkAbsent(e.target.checked)}
              style={{ width: 'auto', accentColor: 'var(--accent)' }}
            />
            Mark absent as &quot;A&quot;
          </label>
        </div>

        {/* Download button */}
        <div className="row" style={{ alignItems: 'center', gap: 12, marginTop: 4 }}>
          <button
            id="btn-download-xlsx"
            className="btn"
            disabled={loading}
            onClick={handleDownload}
            style={{ minWidth: 200 }}
          >
            {loading ? 'Generating…' : '⬇ Download Excel (.xlsx)'}
          </button>
          <span style={{ fontSize: '.82rem', color: 'var(--muted)' }}>
            Legacy CSV: &nbsp;
            <a href={csvDateHref} style={{ color: 'var(--muted)' }}>this date</a>
            &nbsp;·&nbsp;
            <a href={csvYearHref} style={{ color: 'var(--muted)' }}>whole year</a>
          </span>
        </div>

        <p className="muted" style={{ marginBottom: 0, marginTop: 0 }}>
          Opens directly in Excel with one sheet per group. Phone numbers stay as text and formulas calculate totals automatically.
        </p>
      </div>
    </>
  );
}
