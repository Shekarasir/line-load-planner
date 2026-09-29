import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { DEPARTMENTS, USER_STATUSES } from '../../shared/tna.js';
import { api, errorText } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { ErrorState, Field, Loading, PageHeader, PhoneLink, StatusBadge } from '../components/ui.jsx';

const EMPTY = { name: '', department: '', designation: '', phone_number: '', status: 'Active' };

function validate(u) {
  const e = {};
  if (!u.name.trim()) e.name = 'Name is required';
  if (!u.department) e.department = 'Select a department';
  if (u.phone_number && !/^[+\d][\d\s-]{5,19}$/.test(u.phone_number.trim())) e.phone_number = 'Enter a valid phone number';
  return e;
}

export default function UserMaster() {
  const notify = useToast();
  const { data: users, error, loading, reload } = useAsync(() => api.users.list(), []);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState(null); // null | user object (id undefined = new)
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter(
      (u) =>
        (!dept || u.department === dept) &&
        (!status || u.status === status) &&
        (!q || [u.name, u.designation, u.phone_number].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [users, query, dept, status]);

  const open = (u) => {
    setErrors({});
    setEditing(u ? { ...u } : { ...EMPTY });
  };
  const close = () => setEditing(null);
  const set = (k) => (e) => setEditing((u) => ({ ...u, [k]: e.target.value }));

  const save = async (e) => {
    e?.preventDefault();
    const errs = validate(editing);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    try {
      if (editing.id) await api.users.update(editing.id, editing);
      else await api.users.create(editing);
      notify(editing.id ? 'User updated' : 'User added');
      close();
      reload();
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.name}? This cannot be undone.`)) return;
    try {
      await api.users.remove(u.id);
      notify('User deleted');
      reload();
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="User Master"
        subtitle="Staff who can own T&A tasks. Only Active users appear in owner drop-downs."
        actions={
          <button className="btn-primary" onClick={() => open(null)}>
            <Plus className="h-4 w-4" /> Add User
          </button>
        }
      />

      <div className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search name, designation, phone…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="input" value={dept} onChange={(e) => setDept(e.target.value)} aria-label="Department filter">
          <option value="">All departments</option>
          {DEPARTMENTS.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter">
          <option value="">All statuses</option>
          {USER_STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>

      {loading && !users ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : filtered.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-slate-500">
          <UserRound className="h-8 w-8" />
          {users.length ? 'No users match your filters.' : 'No users yet. Add your first staff member.'}
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="table-compact w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50">
                    <td className="font-medium">{u.name}</td>
                    <td>{u.department}</td>
                    <td>{u.designation || '—'}</td>
                    <td>
                      <PhoneLink phone={u.phone_number} />
                    </td>
                    <td>
                      <StatusBadge status={u.status} />
                    </td>
                    <td className="text-right">
                      <button className="btn-ghost" onClick={() => open(u)} aria-label={`Edit ${u.name}`}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button className="btn-ghost text-red-600" onClick={() => remove(u)} aria-label={`Delete ${u.name}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-2 md:hidden">
            {filtered.map((u) => (
              <li key={u.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{u.name}</div>
                    <div className="text-sm text-slate-500">
                      {u.department}
                      {u.designation && ` · ${u.designation}`}
                    </div>
                  </div>
                  <StatusBadge status={u.status} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <PhoneLink phone={u.phone_number} className="text-sm" />
                  <div className="flex">
                    <button className="btn-ghost" onClick={() => open(u)} aria-label={`Edit ${u.name}`}>
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button className="btn-ghost text-red-600" onClick={() => remove(u)} aria-label={`Delete ${u.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <Modal
        open={!!editing}
        title={editing?.id ? 'Edit User' : 'Add User'}
        onClose={close}
        footer={
          <>
            <button className="btn-secondary" onClick={close}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {editing && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Field label="Name *" error={errors.name} className="sm:col-span-2">
              <input className={`input ${errors.name ? 'input-error' : ''}`} value={editing.name} onChange={set('name')} autoFocus />
            </Field>
            <Field label="Department *" error={errors.department}>
              <select className={`input ${errors.department ? 'input-error' : ''}`} value={editing.department} onChange={set('department')}>
                <option value="">Select…</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
            <Field label="Designation">
              <input className="input" value={editing.designation} onChange={set('designation')} />
            </Field>
            <Field label="Phone Number" error={errors.phone_number}>
              <input
                className={`input ${errors.phone_number ? 'input-error' : ''}`}
                type="tel"
                inputMode="tel"
                value={editing.phone_number}
                onChange={set('phone_number')}
                placeholder="+91 98765 43210"
              />
            </Field>
            <Field label="Status">
              <select className="input" value={editing.status} onChange={set('status')}>
                {USER_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}
