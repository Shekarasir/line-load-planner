import { differenceInCalendarDays, eachMonthOfInterval, eachWeekOfInterval, format } from 'date-fns';
import { displayDate, effectiveStatus, toDate } from '../../shared/tna.js';
import { STATUS_BAR } from './ui.jsx';

/**
 * Desktop Gantt chart: one row per main task, thinner rows for sub-tasks.
 * The timeline spans booking date → delivery date.
 */
export default function Gantt({ order }) {
  const start = toDate(order.booking_date);
  const end = toDate(order.delivery_date);
  const span = differenceInCalendarDays(end, start) + 1; // inclusive days
  const pos = (date) => (differenceInCalendarDays(toDate(date), start) / span) * 100;
  const width = (s, e) => ((differenceInCalendarDays(toDate(e), toDate(s)) + 1) / span) * 100;
  const today = new Date();
  const todayPct = pos(today);
  const showToday = todayPct >= 0 && todayPct <= 100;

  const months = eachMonthOfInterval({ start, end });
  const weeks = span <= 120 ? eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }) : [];

  const rows = order.tasks.flatMap((t) => [
    { ...t, kind: 'task', label: t.task_name, key: `t${t.id}` },
    ...t.subtasks.map((s) => ({ ...s, kind: 'sub', label: s.subtask_name, key: `s${s.id}` })),
  ]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        {/* Scale */}
        <div className="grid grid-cols-[240px_1fr] border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
          <div className="px-3 py-2 font-semibold uppercase tracking-wide">Task</div>
          <div className="relative h-8">
            {months.map((m) => {
              const left = Math.max(0, pos(m));
              return (
                <div key={m.toISOString()} className="absolute top-0 h-full border-l border-slate-300 pl-1 pt-2 font-medium" style={{ left: `${left}%` }}>
                  {format(m, 'MMM yyyy')}
                </div>
              );
            })}
          </div>
        </div>

        {rows.map((r) => {
          const status = effectiveStatus(r, today);
          const milestone = r.start_date === r.end_date;
          return (
            <div
              key={r.key}
              className={`grid grid-cols-[240px_1fr] border-b border-slate-100 ${r.kind === 'task' ? 'bg-white' : 'bg-slate-50/60'}`}
            >
              <div className={`truncate px-3 py-1.5 text-sm ${r.kind === 'task' ? 'font-medium' : 'pl-8 text-xs text-slate-600'}`} title={r.label}>
                {r.kind === 'task' ? `${r.seq}. ` : '↳ '}
                {r.label}
                {r.owner_name && <span className="ml-1 text-xs font-normal text-slate-400">· {r.owner_name}</span>}
              </div>
              <div className="relative">
                {weeks.map((w) => (
                  <div key={w.toISOString()} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${pos(w)}%` }} />
                ))}
                {showToday && <div className="absolute inset-y-0 z-10 w-px bg-red-400" style={{ left: `${todayPct}%` }} />}
                {milestone ? (
                  <div
                    className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 ${STATUS_BAR[status]}`}
                    style={{ left: `${pos(r.start_date) + width(r.start_date, r.end_date) / 2}%` }}
                    title={`${r.label}: ${displayDate(r.start_date)} (${status})`}
                  />
                ) : (
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 rounded ${STATUS_BAR[status]} ${r.kind === 'task' ? 'h-4' : 'h-2 opacity-80'}`}
                    style={{ left: `${pos(r.start_date)}%`, width: `${Math.max(width(r.start_date, r.end_date), 0.6)}%` }}
                    title={`${r.label}: ${displayDate(r.start_date)} → ${displayDate(r.end_date)} (${status})`}
                  />
                )}
              </div>
            </div>
          );
        })}

        <div className="flex flex-wrap items-center gap-4 px-3 py-2 text-xs text-slate-500">
          {Object.entries(STATUS_BAR).map(([s, cls]) => (
            <span key={s} className="inline-flex items-center gap-1">
              <span className={`inline-block h-2.5 w-4 rounded ${cls}`} /> {s}
            </span>
          ))}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-px bg-red-400" /> Today
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rotate-45 bg-slate-400" /> Milestone
          </span>
        </div>
      </div>
    </div>
  );
}
