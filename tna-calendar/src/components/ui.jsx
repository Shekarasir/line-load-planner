import { AlertTriangle, Loader2, Phone } from 'lucide-react';
import { TASK_STATUSES } from '../../shared/tna.js';

const STATUS_STYLES = {
  Pending: 'bg-slate-100 text-slate-700 ring-slate-300',
  'In Progress': 'bg-blue-50 text-blue-700 ring-blue-200',
  Delayed: 'bg-red-50 text-red-700 ring-red-200',
  Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'On Track': 'bg-blue-50 text-blue-700 ring-blue-200',
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Inactive: 'bg-slate-100 text-slate-500 ring-slate-300',
};

export const STATUS_BAR = {
  Pending: 'bg-slate-400',
  'In Progress': 'bg-blue-500',
  Delayed: 'bg-red-500',
  Completed: 'bg-emerald-500',
};

export function StatusBadge({ status, overdue }) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] || STATUS_STYLES.Pending
      }`}
      title={overdue ? 'Past planned end date' : undefined}
    >
      {overdue && <AlertTriangle className="h-3 w-3" aria-hidden />}
      {status}
    </span>
  );
}

export function StatusSelect({ value, onChange, className = '', ...props }) {
  return (
    <select className={`input ${className}`} value={value} onChange={(e) => onChange(e.target.value)} {...props}>
      {TASK_STATUSES.map((s) => (
        <option key={s}>{s}</option>
      ))}
    </select>
  );
}

/**
 * Owner drop-down fed by the User Master. Only Active users can be newly picked,
 * but an already-assigned inactive owner is still shown so data isn't lost.
 */
export function OwnerSelect({ users, value, onChange, department, className = '', ...props }) {
  const current = value != null && value !== '' ? Number(value) : null;
  const options = users.filter((u) => u.status === 'Active' || u.id === current);
  // Suggest people from the task's department first.
  const sorted = department
    ? [...options.filter((u) => u.department === department), ...options.filter((u) => u.department !== department)]
    : options;
  return (
    <select
      className={`input ${className}`}
      value={current ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      {...props}
    >
      <option value="">— Unassigned —</option>
      {sorted.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name} ({u.department}){u.status === 'Inactive' ? ' – inactive' : ''}
        </option>
      ))}
    </select>
  );
}

export function Field({ label, error, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {error && <span className="field-error block">{error}</span>}
    </label>
  );
}

export function PhoneLink({ phone, className = '' }) {
  if (!phone) return <span className="text-slate-400">—</span>;
  return (
    <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={`inline-flex items-center gap-1 text-brand-600 hover:underline ${className}`}>
      <Phone className="h-3.5 w-3.5" aria-hidden />
      {phone}
    </a>
  );
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin" /> {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <p className="text-sm text-slate-600">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button className="btn-secondary" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
