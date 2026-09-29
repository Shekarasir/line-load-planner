import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ArrowLeft, Printer } from 'lucide-react';
import { COMPANY_NAME, displayDate, effectiveStatus } from '../../shared/tna.js';
import { api } from '../lib/api.js';
import { useAsync } from '../lib/useAsync.js';
import { ErrorState, Loading } from '../components/ui.jsx';

const ORIENTATION_KEY = 'tna.printOrientation';

function readOrientation() {
  try {
    return localStorage.getItem(ORIENTATION_KEY) === 'portrait' ? 'portrait' : 'landscape';
  } catch {
    return 'landscape';
  }
}

function statusText(item) {
  const s = effectiveStatus(item);
  return item.actual_date ? `${s} (${displayDate(item.actual_date)})` : s;
}

/** The printable A4 T&A document. Also rendered on screen as an A4 preview. */
export function TnaDocument({ order }) {
  const printedAt = format(new Date(), 'dd-MMM-yyyy HH:mm');
  return (
    <div className="print-doc">
      <div className="doc-title">
        <h1>{COMPANY_NAME}</h1>
        <h2>Time &amp; Action Calendar</h2>
      </div>

      <table className="meta">
        <tbody>
          <tr>
            <td className="k">Order No</td>
            <td>{order.order_no}</td>
            <td className="k">Buyer</td>
            <td>{order.buyer_name}</td>
            <td className="k">Style No</td>
            <td>{order.style_number || '—'}</td>
          </tr>
          <tr>
            <td className="k">Order Qty</td>
            <td>{order.order_qty != null ? `${order.order_qty.toLocaleString('en-IN')} pcs` : '—'}</td>
            <td className="k">Booking Date</td>
            <td>{displayDate(order.booking_date)}</td>
            <td className="k">Delivery Date</td>
            <td>{displayDate(order.delivery_date)}</td>
          </tr>
          <tr>
            <td className="k">Total Lead Time</td>
            <td>{order.total_lead_time_days} days</td>
            <td className="k">Tasks</td>
            <td>
              {order.tasks.length} main / {order.tasks.reduce((n, t) => n + t.subtasks.length, 0)} sub
            </td>
            <td className="k">Printed</td>
            <td>{printedAt}</td>
          </tr>
        </tbody>
      </table>

      <table className="plan">
        <colgroup>
          <col style={{ width: '5%' }} />
          <col style={{ width: '21%' }} />
          <col style={{ width: '8.5%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '13%' }} />
        </colgroup>
        <thead>
          <tr>
            <th className="c">Sr No</th>
            <th>Task / Sub-task</th>
            <th>Department</th>
            <th>Owner</th>
            <th>Phone</th>
            <th>Plan Start</th>
            <th>Plan End</th>
            <th>Actual / Status</th>
            <th>Sign-off</th>
          </tr>
        </thead>
        <tbody>
          {order.tasks.flatMap((t) => [
            <tr key={`t${t.id}`} className="parent">
              <td className="num">{t.seq}</td>
              <td className="name">{t.task_name}</td>
              <td>{t.department}</td>
              <td>{t.owner_name || ''}</td>
              <td>{t.owner_phone || ''}</td>
              <td>{displayDate(t.start_date)}</td>
              <td>{displayDate(t.end_date)}</td>
              <td>{statusText(t)}</td>
              <td />
            </tr>,
            ...t.subtasks.map((s, j) => (
              <tr key={`s${s.id}`} className="child">
                <td className="num">
                  {t.seq}.{j + 1}
                </td>
                <td className="name">{s.subtask_name}</td>
                <td>{t.department}</td>
                <td>{s.owner_name || ''}</td>
                <td>{s.owner_phone || ''}</td>
                <td>{displayDate(s.start_date)}</td>
                <td>{displayDate(s.end_date)}</td>
                <td>{statusText(s)}</td>
                <td />
              </tr>
            )),
          ])}
        </tbody>
      </table>

      <div className="signoffs">
        <div>Prepared By (Merch)</div>
        <div>Production Head</div>
        <div>Store / Fabric Head</div>
        <div>Approved By</div>
      </div>

      <div className="doc-footer">
        <span>
          {COMPANY_NAME} · T&amp;A · Order {order.order_no}
        </span>
        <span>Printed {printedAt}</span>
      </div>
    </div>
  );
}

export default function PrintView() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data: order, error, loading } = useAsync(() => api.orders.get(id), [id]);
  const [orientation, setOrientation] = useState(readOrientation);

  useEffect(() => {
    try {
      localStorage.setItem(ORIENTATION_KEY, orientation);
    } catch {
      /* storage unavailable — keep in memory only */
    }
  }, [orientation]);

  useEffect(() => {
    if (order) document.title = `T&A - ${order.order_no} - ${order.buyer_name}`;
  }, [order]);

  // "Print T&A" opens this page with ?autoprint=1 — print once the data is on screen.
  useEffect(() => {
    if (!order || params.get('autoprint') !== '1') return;
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, [order, params]);

  if (loading) return <Loading />;
  if (error) return <div className="p-4"><ErrorState error={error} /></div>;

  return (
    <div className="print-root min-h-screen bg-slate-200 pb-8">
      {/* @page must be global; it is switched with the orientation toggle */}
      <style>{`@page { size: A4 ${orientation}; margin: 10mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt Arial, sans-serif; color: #444; } }`}</style>

      <div className="no-print sticky top-0 z-10 mb-4 border-b border-slate-300 bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-2">
          <Link to={`/orders/${id}`} className="btn-ghost">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
          <div className="ml-auto inline-flex rounded-lg bg-slate-100 p-1 text-sm">
            {['portrait', 'landscape'].map((o) => (
              <button
                key={o}
                onClick={() => setOrientation(o)}
                className={`rounded-md px-3 py-1 capitalize ${orientation === o ? 'bg-white shadow-sm' : 'text-slate-500'}`}
              >
                A4 {o}
              </button>
            ))}
          </div>
          <button className="btn-primary" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="overflow-x-auto px-2">
        <div className={`a4-sheet ${orientation}`}>
          <TnaDocument order={order} />
        </div>
      </div>
    </div>
  );
}
