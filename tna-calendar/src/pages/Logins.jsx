import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, errorText } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useAuth } from '../components/Auth.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { ErrorState, Field, Loading, PageHeader } from '../components/ui.jsx';

const EMPTY = { username: '', display_name: '', role: 'user', password: '' };

function RoleBadge({ role }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        role === 'admin' ? 'bg-brand-50 text-brand-700 ring-brand-100' : 'bg-slate-100 text-slate-600 ring-slate-300'
      }`}
    >
      {role === 'admin' ? 'Admin' : 'User'}
    </span>
  );
}

export default function Logins() {
  const { account: me } = useAuth();
  const notify = useToast();
  const { data: accounts, error, loading, reload } = useAsync(() => api.accounts.list(), []);
  const [editing, setEditing] = useState(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  if (me.role !== 'admin') return <Navigate to="/" replace />;

  const open = (a) => {
    setFormError('');
    setEditing(a ? { ...a, password: '' } : { ...EMPTY });
  };
  const close = () => setEditing(null);
  const set = (k) => (e) => setEditing((a) => ({ ...a, [k]: e.target.value }));

  const save = async (e) => {
    e?.preventDefault();
    const isNew = !editing.id;
    if (isNew && !/^[a-zA-Z0-9._-]{3,32}$/.test(editing.username.trim())) {
      return setFormError('Username must be 3–32 characters: letters, numbers, dot, dash or underscore');
    }
    if ((isNew || editing.password) && editing.password.length < 8) {
      return setFormError('Password must be at least 8 characters');
    }
    setBusy(true);
    try {
      if (isNew) await api.accounts.create(editing);
      else await api.accounts.update(editing.id, editing);
      notify(isNew ? `Login "${editing.username.trim().toLowerCase()}" created` : 'Login updated');
      close();
      reload();
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (a) => {
    if (!window.confirm(`Delete login "${a.username}"? They will be signed out immediately.`)) return;
    try {
      await api.accounts.remove(a.id);
      notify('Login deleted');
      reload();
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <>
      <PageHeader
        title="Manage Logins"
        subtitle="Who can sign in to the T&A Calendar. Admins can also manage logins."
        actions={
          <button className="btn-primary" onClick={() => open(null)}>
            <Plus className="h-4 w-4" /> Add Login
          </button>
        }
      />

      {loading && !accounts ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-slate-900">{a.display_name || a.username}</span>
                  <RoleBadge role={a.role} />
                  {a.id === me.id && <span className="text-xs text-slate-400">(you)</span>}
                </div>
                <div className="text-xs text-slate-500">@{a.username}</div>
              </div>
              <button className="btn-ghost" onClick={() => open(a)} aria-label={`Edit ${a.username}`}>
                <Pencil className="h-4 w-4" />
              </button>
              {a.id !== me.id && (
                <button className="btn-ghost text-red-600" onClick={() => remove(a)} aria-label={`Delete ${a.username}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!editing}
        title={editing?.id ? `Edit login · ${editing.username}` : 'Add Login'}
        onClose={close}
        footer={
          <>
            <button className="btn-secondary" onClick={close}>
              Cancel
            </button>
            <button className="btn-primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        {editing && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            <Field label="Username *">
              <input
                className="input"
                value={editing.username}
                onChange={set('username')}
                disabled={!!editing.id}
                autoCapitalize="none"
                autoComplete="off"
                autoFocus={!editing.id}
              />
            </Field>
            <Field label="Full name">
              <input className="input" value={editing.display_name} onChange={set('display_name')} />
            </Field>
            <Field label="Role">
              <select className="input" value={editing.role} onChange={set('role')}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            <Field label={editing.id ? 'Reset password (optional)' : 'Password * (min 8)'}>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="input pl-9"
                  type="password"
                  autoComplete="new-password"
                  value={editing.password}
                  onChange={set('password')}
                  placeholder={editing.id ? 'Leave blank to keep' : ''}
                />
              </div>
            </Field>
            {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">{formError}</p>}
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
    </>
  );
}
