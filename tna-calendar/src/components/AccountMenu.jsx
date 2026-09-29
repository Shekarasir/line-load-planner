import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, KeyRound, LogOut, ShieldCheck, UserCircle2 } from 'lucide-react';
import { api, errorText } from '../lib/api.js';
import { useAuth } from './Auth.jsx';
import Modal from './Modal.jsx';
import { useToast } from './Toast.jsx';
import { Field } from './ui.jsx';

export default function AccountMenu() {
  const { account, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-sm text-brand-100 hover:bg-white/10 hover:text-white"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <UserCircle2 className="h-5 w-5" />
        <span className="hidden max-w-[10rem] truncate sm:inline">{account.display_name || account.username}</span>
        <ChevronDown className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm text-slate-700 shadow-lg">
          <div className="border-b border-slate-100 px-4 py-2">
            <div className="font-medium text-slate-900">{account.display_name || account.username}</div>
            <div className="text-xs text-slate-500">
              @{account.username} · {account.role === 'admin' ? 'Admin' : 'User'}
            </div>
          </div>
          {account.role === 'admin' && (
            <Link role="menuitem" to="/logins" className="flex items-center gap-2 px-4 py-2.5 hover:bg-slate-50" onClick={() => setOpen(false)}>
              <ShieldCheck className="h-4 w-4" /> Manage logins
            </Link>
          )}
          <button
            role="menuitem"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50"
            onClick={() => {
              setOpen(false);
              setPwOpen(true);
            }}
          >
            <KeyRound className="h-4 w-4" /> Change password
          </button>
          <button role="menuitem" className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-red-600 hover:bg-red-50" onClick={logout}>
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
      <ChangePassword open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePassword({ open, onClose }) {
  const notify = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ current: '', next: '', confirm: '' });
      setError('');
    }
  }, [open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e) => {
    e?.preventDefault();
    if (form.next.length < 8) return setError('New password must be at least 8 characters');
    if (form.next !== form.confirm) return setError('New passwords do not match');
    setBusy(true);
    try {
      await api.auth.changePassword(form.current, form.next);
      notify('Password changed');
      onClose();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Change password"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </>
      }
    >
      <form onSubmit={save} className="grid gap-3">
        <Field label="Current password">
          <input className="input" type="password" autoComplete="current-password" value={form.current} onChange={set('current')} autoFocus />
        </Field>
        <Field label="New password (min 8 characters)">
          <input className="input" type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
        </Field>
        <Field label="Confirm new password">
          <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
        </Field>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
