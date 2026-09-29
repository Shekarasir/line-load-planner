import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BarChart3, List, Pencil, Printer, Trash2 } from 'lucide-react';
import { displayDate, effectiveStatus } from '../../shared/tna.js';
import { api, errorText } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import Gantt from '../components/Gantt.jsx';
import { ErrorState, Loading, PhoneLink, StatusBadge, StatusSelect } from '../components/ui.jsx';

function Meta({ label, value }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}

function ItemStatus({ item, onChange }) {
  const eff = effectiveStatus(item);
  return (
    <div className="flex flex-col items-end gap-1">
      <StatusSelect className="!w-36" value={item.status} onChange={onChange} aria-label="Status" />
      {eff === 'Delayed' && item.status !== 'Delayed' && <StatusBadge status="Delayed" overdue />}
      {item.actual_date && <span className="text-[11px] text-slate-500">Actual: {displayDate(item.actual_date)}</span>}
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notify = useToast();
  const { data: order, error, loading, reload } = useAsync(() => api.orders.get(id), [id]);
  const [view, setView] = useState('list');

  const setStatus = async (kind, item, status) => {
    try {
      if (kind === 'task') await api.progress.task(item.id, { status });
      else await api.progress.subtask(item.id, { status });
      notify(`${item.task_name || item.subtask_name} → ${status}`);
      reload();
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete T&A for order ${order.order_no}? This cannot be undone.`)) return;
    try {
      await api.orders.remove(id);
      notify('Order deleted');
      navigate('/');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  if (loading && !order) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <>
      <div className="mb-3">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
      </div>

      <section className="card mb-4 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 md:text-2xl">Order {order.order_no}</h1>
            <p className="text-sm text-slate-500">
              {order.buyer_name}
              {order.style_number && ` · Style ${order.style_number}`}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Link to={`/orders/${id}/print?autoprint=1`} className="btn-primary" target="_blank" rel="noopener">
              <Printer className="h-4 w-4" /> <span>Print T&amp;A</span>
            </Link>
            <Link to={`/orders/${id}/edit`} className="btn-secondary">
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <button className="btn-danger" onClick={remove}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Meta label="Order Qty" value={order.order_qty != null ? `${order.order_qty.toLocaleString('en-IN')} pcs` : '—'} />
          <Meta label="Booking Date" value={displayDate(order.booking_date)} />
          <Meta label="Delivery Date" value={displayDate(order.delivery_date)} />
          <Meta label="Total Lead Time" value={`${order.total_lead_time_days} days`} />
        </div>
      </section>

      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <h2 className="text-sm font-semibold text-slate-700">Tasks</h2>
          <div className="hidden rounded-lg bg-slate-100 p-1 md:inline-flex">
            {[
              ['list', 'Table', List],
              ['gantt', 'Gantt', BarChart3],
            ].map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setView(key)}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-1 text-sm ${
                  view === key ? 'bg-white shadow-sm' : 'text-slate-500'
                }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop: table or Gantt */}
        <div className="hidden md:block">
          {view === 'gantt' ? (
            <Gantt order={order} />
          ) : (
            <table className="table-compact w-full">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Task / Sub-task</th>
                  <th>Dept</th>
                  <th>Owner</th>
                  <th>Phone</th>
                  <th>Plan Start</th>
                  <th>Plan End</th>
                  <th className="text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {order.tasks.flatMap((t) => [
                  <tr key={`t${t.id}`} className="bg-white">
                    <td className="font-semibold text-slate-500">{t.seq}</td>
                    <td className="font-medium">{t.task_name}</td>
                    <td>{t.department}</td>
                    <td>{t.owner_name || <span className="text-slate-400">Unassigned</span>}</td>
                    <td>
                      <PhoneLink phone={t.owner_phone} />
                    </td>
                    <td className="whitespace-nowrap">{displayDate(t.start_date)}</td>
                    <td className="whitespace-nowrap">{displayDate(t.end_date)}</td>
                    <td className="text-right">
                      <ItemStatus item={t} onChange={(s) => setStatus('task', t, s)} />
                    </td>
                  </tr>,
                  ...t.subtasks.map((s, j) => (
                    <tr key={`s${s.id}`} className="bg-slate-50/70 text-slate-600">
                      <td className="text-xs text-slate-400">
                        {t.seq}.{j + 1}
                      </td>
                      <td className="pl-8">↳ {s.subtask_name}</td>
                      <td>{t.department}</td>
                      <td>{s.owner_name || <span className="text-slate-400">Unassigned</span>}</td>
                      <td>
                        <PhoneLink phone={s.owner_phone} />
                      </td>
                      <td className="whitespace-nowrap">{displayDate(s.start_date)}</td>
                      <td className="whitespace-nowrap">{displayDate(s.end_date)}</td>
                      <td className="text-right">
                        <ItemStatus item={s} onChange={(st) => setStatus('subtask', s, st)} />
                      </td>
                    </tr>
                  )),
                ])}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile: task cards */}
        <ul className="divide-y divide-slate-200 md:hidden">
          {order.tasks.map((t) => (
            <li key={t.id} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium">
                    {t.seq}. {t.task_name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {displayDate(t.start_date)} → {displayDate(t.end_date)} · {t.department}
                  </div>
                </div>
                <StatusBadge status={effectiveStatus(t)} />
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="truncate">{t.owner_name || <span className="text-slate-400">Unassigned</span>}</div>
                  <PhoneLink phone={t.owner_phone} className="text-xs" />
                </div>
                <StatusSelect className="!w-36" value={t.status} onChange={(s) => setStatus('task', t, s)} aria-label="Status" />
              </div>
              {t.subtasks.length > 0 && (
                <ul className="mt-3 space-y-2 border-l-2 border-brand-100 pl-3">
                  {t.subtasks.map((s) => (
                    <li key={s.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium text-slate-700">{s.subtask_name}</div>
                          <div className="text-xs text-slate-500">
                            {displayDate(s.start_date)} → {displayDate(s.end_date)}
                            {s.owner_name && ` · ${s.owner_name}`}
                          </div>
                          <PhoneLink phone={s.owner_phone} className="text-xs" />
                        </div>
                        <StatusSelect className="!w-32 !text-sm" value={s.status} onChange={(st) => setStatus('subtask', s, st)} aria-label="Status" />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
