'use client';

import { useRouter } from 'next/navigation';
import { useId, useMemo, useState } from 'react';
import {
  DEFAULT_SABHA_DAY,
  formatDate,
  isValidIsoDate,
  mostRecentSabhaDate,
  sabhaDates,
  todayIST,
  WEEKDAYS,
  weekdayOf,
  type Weekday,
} from '@/lib/dates';
import type { DateMode } from '@/lib/data';

type SabhaDayFormProps = {
  current?: Weekday;
  currentDay?: Weekday;
  currentMode?: DateMode;
  currentManualDate?: string | null;
  today?: string;
};

export function SabhaDayForm({
  current,
  currentDay,
  currentMode = 'auto',
  currentManualDate = null,
  today = todayIST(),
}: SabhaDayFormProps) {
  const router = useRouter();
  const daySelectId = useId();
  const manualSelectId = useId();
  const otherDateId = useId();

  const effectiveInitialDay: Weekday = currentDay ?? current ?? DEFAULT_SABHA_DAY;
  const [day, setDay] = useState<Weekday>(effectiveInitialDay);
  const [mode, setMode] = useState<DateMode>(currentMode);

  // Initialize manualDate
  const defaultManual = currentManualDate && isValidIsoDate(currentManualDate)
    ? currentManualDate
    : mostRecentSabhaDate(effectiveInitialDay, today);
  const [manualDate, setManualDate] = useState<string>(defaultManual);

  // Track if current manual date was marked as a special sabha
  const initialIsSpecial = currentManualDate
    ? weekdayOf(currentManualDate) !== effectiveInitialDay
    : false;
  const [isSpecial, setIsSpecial] = useState<boolean>(initialIsSpecial);

  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const currentYear = Number(today.slice(0, 4));

  // Regenerate date list for the selected sabha day
  const sabhaDayDates = useMemo(() => sabhaDates(currentYear, day), [currentYear, day]);

  // Options for manual dropdown: all sabha dates of the year + manualDate if special/outside
  const manualDateOptions = useMemo(() => {
    const list = [...sabhaDayDates];
    if (manualDate && !list.includes(manualDate)) {
      list.push(manualDate);
      list.sort();
    }
    return list;
  }, [sabhaDayDates, manualDate]);

  // Live preview date for Auto mode
  const autoPreviewDate = mostRecentSabhaDate(day, today);

  // Rule 5: Changing the sabha day regenerates the date list.
  // If the manual date no longer matches the new day, keep it only if it was marked as a special sabha, else reset to Auto.
  function handleDayChange(newDay: Weekday) {
    setDay(newDay);
    if (mode === 'manual') {
      const matchesNewDay = weekdayOf(manualDate) === newDay;
      if (matchesNewDay) {
        setIsSpecial(false);
      } else if (isSpecial) {
        // Marked as special sabha: keep it!
      } else {
        // Did not match and not marked special: reset to Auto
        setMode('auto');
        setManualDate(mostRecentSabhaDate(newDay, today));
        setIsSpecial(false);
      }
    }
  }

  function handleDropdownChange(dateVal: string) {
    setManualDate(dateVal);
    const matchesDay = weekdayOf(dateVal) === day;
    setIsSpecial(!matchesDay);
  }

  function handleOtherDateChange(dateVal: string) {
    if (!dateVal) return;
    setManualDate(dateVal);
    const matchesDay = weekdayOf(dateVal) === day;
    setIsSpecial(!matchesDay);
  }

  const manualWeekday = isValidIsoDate(manualDate) ? weekdayOf(manualDate) : null;
  const isDifferentWeekday = manualWeekday !== null && manualWeekday !== day;
  const weekdayCapitalized = manualWeekday ? manualWeekday[0].toUpperCase() + manualWeekday.slice(1) : '';

  async function save() {
    setBusy(true);
    setToast(null);
    setErr(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sabha_day: day,
          date_mode: mode,
          manual_date: mode === 'manual' ? manualDate : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save settings');
      setToast('Sabha settings saved');
      setTimeout(() => setToast(null), 4000);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not save settings');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          ✓ {toast}
        </div>
      )}

      {/* Row with Sabha Day dropdown */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ maxWidth: 380 }}>
          <label htmlFor={daySelectId}>Sabha day (default: Friday)</label>
          <select
            id={daySelectId}
            value={day}
            onChange={(e) => handleDayChange(e.target.value as Weekday)}
          >
            {WEEKDAYS.map((w) => (
              <option key={w} value={w}>{w[0].toUpperCase() + w.slice(1)}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Sabha date control with two modes (radio) */}
      <fieldset style={{ border: 'none', padding: 0, margin: '0 0 16px 0' }}>
        <legend style={{ fontSize: '.9rem', color: 'var(--muted)', marginBottom: 8, display: 'block' }}>
          Sabha date
        </legend>
        <div className="row" style={{ gap: 20, marginBottom: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.95rem', margin: 0 }}>
            <input
              type="radio"
              name="sabha-date-mode"
              value="auto"
              checked={mode === 'auto'}
              onChange={() => setMode('auto')}
              style={{ width: 'auto', accentColor: 'var(--accent)' }}
            />
            Auto (recommended)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '.95rem', margin: 0 }}>
            <input
              type="radio"
              name="sabha-date-mode"
              value="manual"
              checked={mode === 'manual'}
              onChange={() => {
                setMode('manual');
                if (!manualDate || !isValidIsoDate(manualDate)) {
                  setManualDate(mostRecentSabhaDate(day, today));
                }
              }}
              style={{ width: 'auto', accentColor: 'var(--accent)' }}
            />
            Choose date manually
          </label>
        </div>

        {/* Auto mode preview */}
        {mode === 'auto' && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--bg)',
              borderRadius: 10,
              fontSize: '.92rem',
              maxWidth: 420,
              border: '1px solid var(--line)',
            }}
          >
            <span className="muted">Today&apos;s sabha date: </span>
            <strong style={{ color: 'var(--ink)' }}>{formatDate(autoPreviewDate)}</strong>
          </div>
        )}

        {/* Manual mode date pickers */}
        {mode === 'manual' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 560 }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: '1 1 240px' }}>
                <label htmlFor={manualSelectId}>{day[0].toUpperCase() + day.slice(1)}s in {currentYear}</label>
                <select
                  id={manualSelectId}
                  value={manualDate}
                  onChange={(e) => handleDropdownChange(e.target.value)}
                >
                  {manualDateOptions.map((d) => (
                    <option key={d} value={d}>
                      {formatDate(d)}{weekdayOf(d) !== day ? ' (Special)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label htmlFor={otherDateId}>Other date (special sabha)</label>
                <input
                  id={otherDateId}
                  type="date"
                  value={manualDate}
                  onChange={(e) => handleOtherDateChange(e.target.value)}
                />
              </div>
            </div>

            {isDifferentWeekday && (
              <div style={{ fontSize: '.88rem', color: 'var(--accent)', fontWeight: 500 }}>
                ℹ Special sabha on a {weekdayCapitalized}
              </div>
            )}
          </div>
        )}
      </fieldset>

      {/* Save button */}
      <div style={{ marginBottom: 4 }}>
        <button
          className="btn"
          type="button"
          onClick={save}
          disabled={busy || (mode === 'manual' && !isValidIsoDate(manualDate))}
        >
          {busy ? 'Saving...' : 'Save settings'}
        </button>
      </div>

      {/* Inline error */}
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
