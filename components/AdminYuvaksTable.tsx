'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export type AdminYuvakItem = {
  id: number;
  group_id: number | null;
  groupCode: string;
  serial_no: number | null;
  name: string;
  source: 'excel' | 'added';
  mobile: string | null;
  education: string | null;
  isPresent: boolean;
  sabhasCount: number;
};

export default function AdminYuvaksTable({
  initialRows,
  year,
}: {
  initialRows: AdminYuvakItem[];
  year: number;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<AdminYuvakItem[]>(initialRows);
  const [confirmTarget, setConfirmTarget] = useState<AdminYuvakItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  function showToast(message: string, isError = false) {
    setToast({ message, isError });
    setTimeout(() => {
      setToast((cur) => (cur?.message === message ? null : cur));
    }, 3500);
  }

  async function handleDelete() {
    if (!confirmTarget || deleting) return;
    const target = confirmTarget;
    setDeleting(true);

    // Optimistically remove from table
    const previousRows = rows;
    setRows((current) => current.filter((item) => item.id !== target.id));

    try {
      const res = await fetch(`/api/admin/yuvaks/${target.id}`, {
        method: 'DELETE',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete yuvak');
      }

      setConfirmTarget(null);
      showToast('Yuvak deleted');
      // Refresh server-side counts and stats
      router.refresh();
    } catch (err) {
      // Rollback on error
      setRows(previousRows);
      const msg = err instanceof Error ? err.message : 'Failed to delete yuvak';
      showToast(msg, true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th>#</th>
              <th>Name</th>
              <th>Mobile</th>
              <th>Education</th>
              <th>Status</th>
              <th>Sabhas in {year}</th>
              <th className="actions-col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: 'var(--muted)' }}>
                  No yuvaks found.
                </td>
              </tr>
            ) : (
              rows.map((y) => (
                <tr key={y.id}>
                  <td>{y.groupCode}</td>
                  <td>{y.serial_no ?? ''}</td>
                  <td>
                    {y.name}
                    {y.source === 'added' && <span className="tag">added</span>}
                  </td>
                  <td>{y.mobile ?? ''}</td>
                  <td>{y.education ?? ''}</td>
                  <td>
                    <span className={`pill ${y.isPresent ? 'on' : 'off'}`}>
                      {y.isPresent ? 'Present' : 'Absent'}
                    </span>
                  </td>
                  <td>{y.sabhasCount}</td>
                  <td className="actions-col">
                    <button
                      type="button"
                      className="btn-delete"
                      onClick={() => setConfirmTarget(y)}
                      title={`Delete ${y.name}`}
                      aria-label={`Delete ${y.name}`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                      <span className="btn-delete-text">Delete</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmation Dialog */}
      {confirmTarget && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) {
              setConfirmTarget(null);
            }
          }}
        >
          <div className="modal-dialog">
            <h3 id="delete-dialog-title">Delete yuvak?</h3>
            <p>
              <strong>{confirmTarget.name}</strong>
              {confirmTarget.source === 'added' && <span className="tag">added</span>}
              <br />
              <span className="muted">Group: {confirmTarget.groupCode}</span>
              {confirmTarget.mobile && <span className="muted"> · Mobile: {confirmTarget.mobile}</span>}
            </p>
            <div className="error" style={{ fontSize: '0.88rem', margin: '14px 0 20px' }}>
              This will permanently delete this yuvak and ALL their attendance records. This cannot be undone.
            </div>
            <div className="row" style={{ justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn ghost"
                onClick={() => setConfirmTarget(null)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.isError ? 'error' : ''}`} role="status">
          <span>{toast.message}</span>
        </div>
      )}
    </>
  );
}
