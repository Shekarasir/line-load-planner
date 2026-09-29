import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { differenceInCalendarDays } from 'date-fns';
import { AlertTriangle, CheckCircle2, ClipboardList, Clock, PackageSearch, Plus, Search } from 'lucide-react';
import { displayDate, toDate } from '../../shared/tna.js';
import { api, errorText } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { ErrorState, Loading, PageHeader, PhoneLink, StatusBadge, StatusSelect } from '../components/ui.jsx';

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className="card flex items-center gap-3 p-3 md:p-4">
      <div className={`rounded-lg p-2 ${tone}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-xl font-semibold leading-tight md:text-2xl">{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </div>
  );
}

function Progress({ stats }) {
  const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-[60px] overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${stats.delayed ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
    </div>
  );
}

function dueLabel(endDate) {
  const d = differenceInCalendarDays(toDate(endDate), new Date());
  if (d < 0) return { text: `${-d}d overdue`, cls: 'text-red-600' };
  if (d === 0) return { text: 'Due today', cls: 'text-amber-600' };
  return { text: `Due in ${d}d`, cls: d <= 7 ? 'text-amber-600' : 'text-slate-500' };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const notify = useToast();
  const orders = useAsync(() => api.orders.list(), []);
  const open = useAsync(() => api.progress.openItems(), []);
  const [tab, setTab] = useState('orders');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');

  const q = query.trim().toLowerCase();
  const filteredOrders = useMemo(
    () =>
      (orders.data || []).filter(
        (o) =>
          (!filter || o.order_status === filter) &&
          (!q || [o.order_no, o.buyer_name, o.style_number].some((v) => v?.toLowerCase().includes(q))),
      ),
    [orders.data, q, filter],
  );
  const filteredItems = useMemo(
    () =>
      (open.data || []).filter(
        (i) =>
          (!filter || i.effective_status === filter) &&
          (!q || [i.order_no, i.buyer_name, i.name, i.parent_name, i.owner_name].some((v) => v?.toLowerCase().includes(q))),
      ),
    [open.data, q, filter],
  );

  const stats = useMemo(() => {
    const os = orders.data || [];
    const items = open.data || [];
    return {
      active: os.filter((o) => o.order_status !== 'Completed').length,
      delayedOrders: os.filter((o) => o.order_status === 'Delayed').length,
      overdue: items.filter((i) => i.effective_status === 'Delayed').length,
      dueWeek: items.filter((i) => {
        const d = differenceInCalendarDays(toDate(i.end_date), new Date());
        return d >= 0 && d <= 7;
      }).length,
    };
  }, [orders.data, open.data]);

  const updateItem = async (item, status) => {
    try {
      if (item.kind === 'task') await api.progress.task(item.id, { status });
      else await api.progress.subtask(item.id, { status });
      notify(`${item.name} → ${status}`);
      open.reload();
      orders.reload();
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const loading = (orders.loading && !orders.data) || (open.loading && !open.data);
  const error = orders.error || open.error;
  const statusOptions = tab === 'orders' ? ['On Track', 'Delayed', 'Completed'] : ['Pending', 'In Progress', 'Delayed'];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Order status, pending tasks and owner contacts at a glance."
        actions={
          <Link to="/orders/new" className="btn-primary">
            <Plus className="h-4 w-4" /> New T&amp;A
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <Stat icon={PackageSearch} label="Active orders" value={stats.active} tone="bg-brand-50 text-brand-600" />
        <Stat icon={AlertTriangle} label="Delayed orders" value={stats.delayedOrders} tone="bg-red-50 text-red-600" />
        <Stat icon={Clock} label="Overdue tasks" value={stats.overdue} tone="bg-amber-50 text-amber-600" />
        <Stat icon={ClipboardList} label="Due in 7 days" value={stats.dueWeek} tone="bg-emerald-50 text-emerald-600" />
      </div>

      <div className="card mb-4 p-3">
        <div className="mb-3 inline-flex w-full rounded-lg bg-slate-100 p-1 sm:w-auto" role="tablist">
          {[
            ['orders', 'Orders'],
            ['tasks', 'Pending Tasks'],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                setFilter('');
              }}
              className={`flex-1 rounded-md px-4 py-2 text-sm font-medium sm:flex-none ${
                tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder={tab === 'orders' ? 'Search order, buyer, style…' : 'Search task, order, owner…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Status filter">
            <option value="">All statuses</option>
            {statusOptions.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            orders.reload();
            open.reload();
          }}
        />
      ) : tab === 'orders' ? (
        filteredOrders.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 p-10 text-center text-slate-500">
            <PackageSearch className="h-8 w-8" />
            {orders.data.length ? 'No orders match your search.' : 'No T&A plans yet.'}
            {!orders.data.length && (
              <Link to="/orders/new" className="btn-primary">
                Create the first T&amp;A
              </Link>
            )}
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="card hidden overflow-x-auto md:block">
              <table className="table-compact w-full">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Buyer / Style</th>
                    <th className="text-right">Qty</th>
                    <th>Booking</th>
                    <th>Delivery</th>
                    <th className="text-right">Lead</th>
                    <th className="w-40">Progress</th>
                    <th>Status</th>
                    <th>Next Task · Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o) => (
                    <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/orders/${o.id}`)}>
                      <td className="font-semibold text-brand-700">{o.order_no}</td>
                      <td>
                        <div>{o.buyer_name}</div>
                        <div className="text-xs text-slate-500">{o.style_number || '—'}</div>
                      </td>
                      <td className="text-right tabular-nums">{o.order_qty?.toLocaleString('en-IN') ?? '—'}</td>
                      <td className="whitespace-nowrap">{displayDate(o.booking_date)}</td>
                      <td className="whitespace-nowrap">{displayDate(o.delivery_date)}</td>
                      <td className="text-right tabular-nums">{o.total_lead_time_days}d</td>
                      <td>
                        <Progress stats={o.stats} />
                      </td>
                      <td>
                        <StatusBadge status={o.order_status} />
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {o.next_task ? (
                          <div className="text-xs">
                            <div className="font-medium text-slate-800">
                              {o.next_task.task_name}{' '}
                              <span className={dueLabel(o.next_task.end_date).cls}>· {dueLabel(o.next_task.end_date).text}</span>
                            </div>
                            <div className="flex flex-wrap gap-x-2 text-slate-500">
                              {o.next_task.owner_name || 'Unassigned'}
                              <PhoneLink phone={o.next_task.owner_phone} />
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" /> All done
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <ul className="space-y-2 md:hidden">
              {filteredOrders.map((o) => (
                <li key={o.id} className="card">
                  <Link to={`/orders/${o.id}`} className="block p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold text-brand-700">{o.order_no}</div>
                        <div className="text-sm text-slate-600">
                          {o.buyer_name}
                          {o.style_number && ` · ${o.style_number}`}
                        </div>
                      </div>
                      <StatusBadge status={o.order_status} />
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-slate-500">
                      <div>
                        <div className="uppercase">Booking</div>
                        <div className="font-medium text-slate-700">{displayDate(o.booking_date)}</div>
                      </div>
                      <div>
                        <div className="uppercase">Delivery</div>
                        <div className="font-medium text-slate-700">{displayDate(o.delivery_date)}</div>
                      </div>
                      <div>
                        <div className="uppercase">Lead</div>
                        <div className="font-medium text-slate-700">{o.total_lead_time_days} days</div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Progress stats={o.stats} />
                    </div>
                  </Link>
                  {o.next_task && (
                    <div className="border-t border-slate-100 px-4 py-2 text-xs">
                      <span className="font-medium">{o.next_task.task_name}</span>{' '}
                      <span className={dueLabel(o.next_task.end_date).cls}>· {dueLabel(o.next_task.end_date).text}</span>
                      <div className="mt-1 flex items-center justify-between text-slate-500">
                        {o.next_task.owner_name || 'Unassigned'}
                        <PhoneLink phone={o.next_task.owner_phone} />
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )
      ) : filteredItems.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 p-10 text-center text-slate-500">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          No pending tasks{q || filter ? ' match your search' : ''}.
        </div>
      ) : (
        <>
          <div className="card hidden overflow-x-auto md:block">
            <table className="table-compact w-full">
              <thead>
                <tr>
                  <th>Due</th>
                  <th>Task</th>
                  <th>Order / Buyer</th>
                  <th>Dept</th>
                  <th>Owner</th>
                  <th>Phone</th>
                  <th className="w-40">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((i) => {
                  const due = dueLabel(i.end_date);
                  return (
                    <tr key={`${i.kind}-${i.id}`} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap">
                        <div>{displayDate(i.end_date)}</div>
                        <div className={`text-xs ${due.cls}`}>{due.text}</div>
                      </td>
                      <td>
                        <div className="font-medium">{i.name}</div>
                        {i.parent_name && <div className="text-xs text-slate-500">Sub-task of {i.parent_name}</div>}
                      </td>
                      <td>
                        <Link to={`/orders/${i.order_id}`} className="font-medium text-brand-700 hover:underline">
                          {i.order_no}
                        </Link>
                        <div className="text-xs text-slate-500">{i.buyer_name}</div>
                      </td>
                      <td>{i.department}</td>
                      <td>{i.owner_name || <span className="text-slate-400">Unassigned</span>}</td>
                      <td>
                        <PhoneLink phone={i.owner_phone} />
                      </td>
                      <td>
                        <StatusSelect value={i.status} onChange={(s) => updateItem(i, s)} aria-label={`Status of ${i.name}`} />
                        {i.effective_status === 'Delayed' && i.status !== 'Delayed' && (
                          <div className="mt-1">
                            <StatusBadge status="Delayed" overdue />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-2 md:hidden">
            {filteredItems.map((i) => {
              const due = dueLabel(i.end_date);
              return (
                <li key={`${i.kind}-${i.id}`} className="card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium">{i.name}</div>
                      {i.parent_name && <div className="text-xs text-slate-500">Sub-task of {i.parent_name}</div>}
                      <Link to={`/orders/${i.order_id}`} className="text-sm text-brand-700">
                        {i.order_no} · {i.buyer_name}
                      </Link>
                    </div>
                    <StatusBadge status={i.effective_status} overdue={i.effective_status === 'Delayed' && i.status !== 'Delayed'} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className={due.cls}>
                      {displayDate(i.end_date)} · {due.text}
                    </span>
                    <span className="text-slate-500">{i.department}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <div className="truncate text-slate-700">{i.owner_name || 'Unassigned'}</div>
                      <PhoneLink phone={i.owner_phone} className="text-xs" />
                    </div>
                    <StatusSelect className="!w-36" value={i.status} onChange={(s) => updateItem(i, s)} aria-label={`Status of ${i.name}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}
