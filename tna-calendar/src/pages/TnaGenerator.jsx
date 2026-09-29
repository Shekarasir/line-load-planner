import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ChevronDown, ListPlus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import {
  DEPARTMENTS,
  calculateTaskDates,
  displayDate,
  generateStandardTasks,
  leadTimeDays,
  recalculateTasks,
  validateTnaDocument,
} from '../../shared/tna.js';
import { api, errorText } from '../lib/api.js';
import { useToast } from '../components/Toast.jsx';
import { ErrorState, Field, Loading, OwnerSelect, PageHeader, StatusSelect } from '../components/ui.jsx';

const EMPTY_ORDER = { order_no: '', style_number: '', buyer_name: '', order_qty: '', booking_date: '', delivery_date: '' };

// Client-side key so React can track unsaved sub-tasks.
let keySeq = 0;
const withKeys = (tasks) =>
  tasks.map((t) => ({ ...t, _key: t._key || `t${++keySeq}`, subtasks: (t.subtasks || []).map((s) => ({ ...s, _key: s._key || `s${++keySeq}` })) }));

export default function TnaGenerator() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const notify = useToast();

  const [users, setUsers] = useState([]);
  const [order, setOrder] = useState(EMPTY_ORDER);
  const [tasks, setTasks] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [userList, existing] = await Promise.all([api.users.list(), isEdit ? api.orders.get(id) : null]);
        if (cancelled) return;
        setUsers(userList);
        if (existing) {
          const { tasks: t, ...header } = existing;
          setOrder({ ...EMPTY_ORDER, ...header, order_qty: header.order_qty ?? '' });
          setTasks(withKeys(t));
        }
      } catch (err) {
        if (!cancelled) setLoadError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isEdit]);

  const lead = leadTimeDays(order.booking_date, order.delivery_date);
  const datesValid = lead != null && lead > 0;

  // As soon as both dates are valid, (re)calculate the standard plan.
  const setOrderField = (key, value) => {
    const next = { ...order, [key]: value };
    setOrder(next);
    if (key !== 'booking_date' && key !== 'delivery_date') return;
    const l = leadTimeDays(next.booking_date, next.delivery_date);
    if (l == null || l <= 0) return;
    setTasks((prev) =>
      prev.length ? recalculateTasks(prev, next.booking_date, next.delivery_date) : withKeys(generateStandardTasks(next.booking_date, next.delivery_date)),
    );
  };

  const validation = useMemo(() => validateTnaDocument({ ...order, tasks }), [order, tasks]);
  const showErr = (msg) => (submitted ? msg : undefined);
  const updateTask = (idx, patch) => setTasks((ts) => ts.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  const setTaskDate = (idx, key, value) => updateTask(idx, { [key]: value, date_overridden: true });
  const resetTaskDates = (idx) =>
    setTasks((ts) =>
      ts.map((t, i) =>
        i === idx && t.start_pct != null
          ? { ...t, ...calculateTaskDates(t, order.booking_date, order.delivery_date), date_overridden: false }
          : t,
      ),
    );

  const addSubtask = (idx) => {
    const parent = tasks[idx];
    updateTask(idx, {
      subtasks: [
        ...parent.subtasks,
        {
          _key: `s${++keySeq}`,
          subtask_name: '',
          start_date: parent.start_date,
          end_date: parent.end_date,
          task_owner_id: parent.task_owner_id,
          status: 'Pending',
        },
      ],
    });
    setExpanded((e) => ({ ...e, [parent._key]: true }));
  };
  const updateSubtask = (ti, si, patch) =>
    setTasks((ts) =>
      ts.map((t, i) => (i === ti ? { ...t, subtasks: t.subtasks.map((s, j) => (j === si ? { ...s, ...patch } : s)) } : t)),
    );
  const removeSubtask = (ti, si) =>
    setTasks((ts) => ts.map((t, i) => (i === ti ? { ...t, subtasks: t.subtasks.filter((_, j) => j !== si) } : t)));

  const regenerate = () => {
    if (!datesValid) return;
    if (!window.confirm('Reset all task dates to the standard lead-time percentages? Owners and sub-tasks are kept.')) return;
    setTasks((ts) => recalculateTasks(ts.map((t) => ({ ...t, date_overridden: false })), order.booking_date, order.delivery_date));
  };

  const save = async () => {
    setSubmitted(true);
    setServerErrors([]);
    if (!validation.valid) {
      // Open any task that has sub-task errors so the user can see them.
      const open = {};
      validation.tasks.forEach((t, i) => {
        if (t.subtasks.some((s) => Object.keys(s).length)) open[tasks[i]._key] = true;
      });
      setExpanded((e) => ({ ...e, ...open }));
      notify('Please fix the highlighted fields before saving.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...order, tasks };
      const saved = isEdit ? await api.orders.update(id, payload) : await api.orders.create(payload);
      notify(isEdit ? 'T&A updated' : 'T&A created');
      navigate(`/orders/${saved.id}`);
    } catch (err) {
      setServerErrors(err.details?.length ? err.details : [errorText(err)]);
      notify(errorText(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;
  if (loadError) return <ErrorState error={loadError} />;

  const h = validation.header;
  const activeUsers = users.filter((u) => u.status === 'Active');

  return (
    <div className="pb-24 md:pb-0">
      <PageHeader
        title={isEdit ? `Edit T&A · ${order.order_no}` : 'T&A Generator'}
        subtitle="Enter order details and dates — the 10 standard tasks are planned automatically from the lead time."
        actions={
          <>
            <button className="btn-secondary" onClick={() => navigate(isEdit ? `/orders/${id}` : '/')}>
              Cancel
            </button>
            <button className="btn-primary hidden md:inline-flex" onClick={save} disabled={saving}>
              <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save T&A'}
            </button>
          </>
        }
      />

      {/* Order header */}
      <section className="card mb-4 p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Order Details</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Order No *" error={showErr(h.order_no)}>
            <input className={`input ${showErr(h.order_no) ? 'input-error' : ''}`} value={order.order_no} onChange={(e) => setOrderField('order_no', e.target.value)} />
          </Field>
          <Field label="Style Number">
            <input className="input" value={order.style_number} onChange={(e) => setOrderField('style_number', e.target.value)} />
          </Field>
          <Field label="Buyer *" error={showErr(h.buyer_name)}>
            <input className={`input ${showErr(h.buyer_name) ? 'input-error' : ''}`} value={order.buyer_name} onChange={(e) => setOrderField('buyer_name', e.target.value)} />
          </Field>
          <Field label="Order Qty (pcs)" error={showErr(h.order_qty)}>
            <input
              className={`input ${showErr(h.order_qty) ? 'input-error' : ''}`}
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={order.order_qty}
              onChange={(e) => setOrderField('order_qty', e.target.value)}
            />
          </Field>
          <Field label="Booking Date *" error={showErr(h.booking_date)}>
            <input
              className={`input ${showErr(h.booking_date) ? 'input-error' : ''}`}
              type="date"
              value={order.booking_date}
              onChange={(e) => setOrderField('booking_date', e.target.value)}
            />
          </Field>
          {/* Delivery vs booking error is shown immediately, not only on submit */}
          <Field label="Delivery Date *" error={order.booking_date && order.delivery_date ? h.delivery_date : showErr(h.delivery_date)}>
            <input
              className={`input ${h.delivery_date && (order.delivery_date || submitted) ? 'input-error' : ''}`}
              type="date"
              min={order.booking_date || undefined}
              value={order.delivery_date}
              onChange={(e) => setOrderField('delivery_date', e.target.value)}
            />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <div
              className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 ${
                datesValid ? 'bg-brand-50 text-brand-900' : 'bg-slate-50 text-slate-500'
              }`}
            >
              <CalendarClock className="h-5 w-5 shrink-0" />
              <div>
                <div className="text-xs uppercase tracking-wide opacity-70">Total Lead Time</div>
                <div className="text-lg font-semibold leading-tight">{datesValid ? `${lead} days` : '—'}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {serverErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <div className="mb-1 flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Could not save
          </div>
          <ul className="list-disc pl-5">
            {serverErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Task plan */}
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Task Plan</h2>
            <p className="text-xs text-slate-500">
              Dates are editable; edited tasks keep their dates when order dates change.
              {activeUsers.length === 0 && ' Add staff in User Master to assign owners.'}
            </p>
          </div>
          {tasks.length > 0 && (
            <button className="btn-secondary" onClick={regenerate} disabled={!datesValid}>
              <RotateCcw className="h-4 w-4" /> Recalculate all
            </button>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-slate-500">
            <CalendarClock className="h-8 w-8" />
            Select a Booking Date and a later Delivery Date to generate the standard T&amp;A plan.
          </div>
        ) : (
          <ol className="divide-y divide-slate-200">
            {tasks.map((task, ti) => {
              const tv = validation.tasks[ti];
              const subErrorCount = tv.subtasks.filter((s) => Object.keys(s).length).length;
              const isOpen = !!expanded[task._key];
              return (
                <li key={task._key} className="p-3 md:p-4">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] md:items-start">
                    <div className="flex items-start gap-2">
                      <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">
                        {task.seq}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">{task.task_name}</div>
                        <div className="text-xs text-slate-500">
                          {task.start_pct != null && `${task.start_pct}% → ${task.end_pct}% of lead time`}
                          {task.date_overridden && (
                            <button
                              type="button"
                              className="ml-2 inline-flex items-center gap-1 text-amber-700 underline-offset-2 hover:underline"
                              onClick={() => resetTaskDates(ti)}
                              title="Reset to calculated dates"
                            >
                              <RotateCcw className="h-3 w-3" /> edited · reset
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <Field label="Plan Start" error={tv.errors.start_date}>
                        <input
                          className={`input ${tv.errors.start_date ? 'input-error' : ''}`}
                          type="date"
                          value={task.start_date}
                          onChange={(e) => setTaskDate(ti, 'start_date', e.target.value)}
                        />
                      </Field>
                      <Field label="Plan End" error={tv.errors.end_date}>
                        <input
                          className={`input ${tv.errors.end_date ? 'input-error' : ''}`}
                          type="date"
                          min={task.start_date || undefined}
                          value={task.end_date}
                          onChange={(e) => setTaskDate(ti, 'end_date', e.target.value)}
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2 md:contents">
                      <Field label="Department">
                        <select className="input" value={task.department} onChange={(e) => updateTask(ti, { department: e.target.value })}>
                          {DEPARTMENTS.map((d) => (
                            <option key={d}>{d}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Task Owner" className="md:order-none">
                        <OwnerSelect
                          users={users}
                          department={task.department}
                          value={task.task_owner_id}
                          onChange={(v) => updateTask(ti, { task_owner_id: v })}
                        />
                      </Field>
                    </div>
                    <Field label="Status">
                      <StatusSelect value={task.status} onChange={(v) => updateTask(ti, { status: v })} />
                    </Field>
                  </div>

                  {/* Sub-task accordion */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn-ghost text-sm"
                      aria-expanded={isOpen}
                      onClick={() => setExpanded((e) => ({ ...e, [task._key]: !isOpen }))}
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      Sub-tasks ({task.subtasks.length})
                      {subErrorCount > 0 && (
                        <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-red-100 px-2 text-xs text-red-700">
                          <AlertTriangle className="h-3 w-3" /> {subErrorCount}
                        </span>
                      )}
                    </button>
                    <button type="button" className="btn-ghost text-sm text-brand-600" onClick={() => addSubtask(ti)} disabled={!task.start_date || !task.end_date}>
                      <ListPlus className="h-4 w-4" /> Add sub-task
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:ml-8 md:p-3">
                      {task.subtasks.length === 0 ? (
                        <p className="p-2 text-sm text-slate-500">No sub-tasks. Use “Add sub-task” to break this task down.</p>
                      ) : (
                        <ul className="space-y-2">
                          {task.subtasks.map((st, si) => {
                            const se = tv.subtasks[si];
                            const nameErr = submitted ? se.subtask_name : undefined;
                            return (
                              <li key={st._key} className="rounded-lg border border-slate-200 bg-white p-3">
                                <div className="grid gap-2 md:grid-cols-[minmax(0,1.6fr)_repeat(2,minmax(0,1fr))_minmax(0,1.4fr)_minmax(0,1fr)_auto] md:items-start">
                                  <Field label="Sub-task" error={nameErr}>
                                    <input
                                      className={`input ${nameErr ? 'input-error' : ''}`}
                                      value={st.subtask_name}
                                      placeholder="e.g. Lab dip approval"
                                      onChange={(e) => updateSubtask(ti, si, { subtask_name: e.target.value })}
                                    />
                                  </Field>
                                  <div className="grid grid-cols-2 gap-2 md:contents">
                                    <Field label="Start" error={se.start_date}>
                                      <input
                                        className={`input ${se.start_date ? 'input-error' : ''}`}
                                        type="date"
                                        min={task.start_date}
                                        max={task.end_date}
                                        value={st.start_date}
                                        onChange={(e) => updateSubtask(ti, si, { start_date: e.target.value })}
                                      />
                                    </Field>
                                    <Field label="End" error={se.end_date}>
                                      <input
                                        className={`input ${se.end_date ? 'input-error' : ''}`}
                                        type="date"
                                        min={st.start_date || task.start_date}
                                        max={task.end_date}
                                        value={st.end_date}
                                        onChange={(e) => updateSubtask(ti, si, { end_date: e.target.value })}
                                      />
                                    </Field>
                                  </div>
                                  <Field label="Owner">
                                    <OwnerSelect
                                      users={users}
                                      department={task.department}
                                      value={st.task_owner_id}
                                      onChange={(v) => updateSubtask(ti, si, { task_owner_id: v })}
                                    />
                                  </Field>
                                  <Field label="Status">
                                    <StatusSelect value={st.status} onChange={(v) => updateSubtask(ti, si, { status: v })} />
                                  </Field>
                                  <button
                                    type="button"
                                    className="btn-danger self-end"
                                    onClick={() => removeSubtask(ti, si)}
                                    aria-label="Remove sub-task"
                                  >
                                    <Trash2 className="h-4 w-4" /> <span className="md:hidden">Remove</span>
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <p className="mt-2 px-1 text-xs text-slate-500">
                        Sub-tasks must fall within {displayDate(task.start_date)} – {displayDate(task.end_date)}.
                      </p>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Sticky save bar on phones */}
      <div className="no-print fixed inset-x-0 bottom-16 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur md:hidden">
        <div className="flex gap-2">
          {submitted && !validation.valid && (
            <span className="flex items-center gap-1 text-xs text-red-600">
              <X className="h-3 w-3" /> Fix errors
            </span>
          )}
          <button className="btn-primary flex-1" onClick={save} disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? 'Saving…' : 'Save T&A'}
          </button>
        </div>
      </div>
    </div>
  );
}
