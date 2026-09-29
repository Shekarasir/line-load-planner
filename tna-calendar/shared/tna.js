// Shared T&A domain logic — imported by both the React client and the Express API
// so that date calculation and validation rules are identical on both sides.
import { addDays, differenceInCalendarDays, format, isValid, parseISO } from 'date-fns';

export const COMPANY_NAME = 'Lakkifashions Private Limited';

export const DEPARTMENTS = ['Merch', 'Fabric', 'Store', 'Production', 'OCR', 'Costing', 'Admin', 'Others'];

export const TASK_STATUSES = ['Pending', 'In Progress', 'Delayed', 'Completed'];

export const USER_STATUSES = ['Active', 'Inactive'];

// The 10 standard main tasks. Percentages are of the total lead time
// (delivery_date - booking_date), measured from the booking date.
export const TASK_TEMPLATES = [
  { seq: 1, task_name: 'Yarn Procurement', start_pct: 0, end_pct: 10, department: 'Fabric' },
  { seq: 2, task_name: 'Fabric In-house', start_pct: 25, end_pct: 35, department: 'Fabric' },
  { seq: 3, task_name: 'Stitching Accessories', start_pct: 25, end_pct: 35, department: 'Store' },
  { seq: 4, task_name: 'Packaging Accessories', start_pct: 35, end_pct: 45, department: 'Store' },
  { seq: 5, task_name: 'Pre-production Approval', start_pct: 35, end_pct: 45, department: 'Merch' },
  { seq: 6, task_name: 'Pre-production Meeting', start_pct: 36, end_pct: 46, department: 'Production' },
  { seq: 7, task_name: 'Cutting', start_pct: 45, end_pct: 50, department: 'Production' },
  { seq: 8, task_name: 'Final Inspection', start_pct: 75, end_pct: 90, department: 'Production' },
  { seq: 9, task_name: 'OCR (Order Closing Report)', start_pct: 95, end_pct: 95, department: 'OCR' },
  { seq: 10, task_name: 'P&L Report', start_pct: 100, end_pct: 100, department: 'Costing' },
];

const ISO = 'yyyy-MM-dd';

/** Parse a 'yyyy-MM-dd' string into a Date, or null when empty/invalid. */
export function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : parseISO(value);
  return isValid(d) ? d : null;
}

/** Format a Date (or ISO string) as 'yyyy-MM-dd'. */
export function toISODate(value) {
  const d = toDate(value);
  return d ? format(d, ISO) : '';
}

/** Human display format used on screen and in print, e.g. 05-Oct-2026. */
export function displayDate(value) {
  const d = toDate(value);
  return d ? format(d, 'dd-MMM-yyyy') : '—';
}

/** Lead time in calendar days, or null if either date is missing/invalid. */
export function leadTimeDays(bookingDate, deliveryDate) {
  const b = toDate(bookingDate);
  const d = toDate(deliveryDate);
  if (!b || !d) return null;
  return differenceInCalendarDays(d, b);
}

/** booking_date + round(lead_time * pct / 100) as an ISO date. */
export function dateAtPercent(bookingDate, leadDays, pct) {
  const b = toDate(bookingDate);
  if (!b || leadDays == null) return '';
  return toISODate(addDays(b, Math.round((leadDays * pct) / 100)));
}

/** Planned start/end for one template, given the order dates. */
export function calculateTaskDates(template, bookingDate, deliveryDate) {
  const lead = leadTimeDays(bookingDate, deliveryDate);
  return {
    start_date: dateAtPercent(bookingDate, lead, template.start_pct),
    end_date: dateAtPercent(bookingDate, lead, template.end_pct),
  };
}

/** Build the 10 standard tasks for a new order. */
export function generateStandardTasks(bookingDate, deliveryDate) {
  return TASK_TEMPLATES.map((t) => ({
    seq: t.seq,
    task_name: t.task_name,
    start_pct: t.start_pct,
    end_pct: t.end_pct,
    ...calculateTaskDates(t, bookingDate, deliveryDate),
    department: t.department,
    task_owner_id: null,
    status: 'Pending',
    actual_date: '',
    remarks: '',
    date_overridden: false,
    subtasks: [],
  }));
}

/**
 * Re-apply lead-time percentages to existing tasks after the order dates change.
 * Tasks whose dates were edited by hand (date_overridden) keep their dates;
 * owners, statuses and sub-tasks are always preserved.
 */
export function recalculateTasks(tasks, bookingDate, deliveryDate) {
  return tasks.map((task) => {
    if (task.date_overridden) return task;
    const template = TASK_TEMPLATES.find((t) => t.seq === task.seq) || task;
    if (template.start_pct == null) return task;
    return { ...task, ...calculateTaskDates(template, bookingDate, deliveryDate) };
  });
}

/**
 * A task is effectively "Delayed" when it is not completed and its planned end
 * date has passed, even if nobody updated the stored status yet.
 */
export function effectiveStatus(item, today = new Date()) {
  if (!item) return 'Pending';
  if (item.status === 'Completed') return 'Completed';
  const end = toDate(item.end_date);
  if (end && differenceInCalendarDays(today, end) > 0) return 'Delayed';
  return item.status || 'Pending';
}

export function validateOrderHeader(order) {
  const errors = {};
  if (!order.order_no || !String(order.order_no).trim()) errors.order_no = 'Order No is required';
  if (!order.buyer_name || !String(order.buyer_name).trim()) errors.buyer_name = 'Buyer is required';
  if (order.order_qty !== '' && order.order_qty != null) {
    const q = Number(order.order_qty);
    if (!Number.isFinite(q) || q < 0 || !Number.isInteger(q)) errors.order_qty = 'Quantity must be a whole number';
  }
  const b = toDate(order.booking_date);
  const d = toDate(order.delivery_date);
  if (!b) errors.booking_date = 'Booking date is required';
  if (!d) errors.delivery_date = 'Delivery date is required';
  if (b && d && differenceInCalendarDays(d, b) <= 0) {
    errors.delivery_date = 'Delivery date must be after the booking date';
  }
  return errors;
}

/** Validate one sub-task against its parent's date window. Returns an error map. */
export function validateSubtask(subtask, parent) {
  const errors = {};
  if (!subtask.subtask_name || !String(subtask.subtask_name).trim()) errors.subtask_name = 'Name is required';
  const s = toDate(subtask.start_date);
  const e = toDate(subtask.end_date);
  const ps = toDate(parent.start_date);
  const pe = toDate(parent.end_date);
  if (!s) errors.start_date = 'Start date is required';
  if (!e) errors.end_date = 'End date is required';
  if (s && ps && differenceInCalendarDays(s, ps) < 0) {
    errors.start_date = `Cannot start before parent start (${displayDate(ps)})`;
  }
  if (e && pe && differenceInCalendarDays(e, pe) > 0) {
    errors.end_date = `Cannot end after parent end (${displayDate(pe)})`;
  }
  if (s && e && differenceInCalendarDays(e, s) < 0 && !errors.end_date) {
    errors.end_date = 'End date is before start date';
  }
  return errors;
}

export function validateTask(task) {
  const errors = {};
  if (!task.task_name || !String(task.task_name).trim()) errors.task_name = 'Task name is required';
  const s = toDate(task.start_date);
  const e = toDate(task.end_date);
  if (!s) errors.start_date = 'Start date is required';
  if (!e) errors.end_date = 'End date is required';
  if (s && e && differenceInCalendarDays(e, s) < 0) errors.end_date = 'End date is before start date';
  if (task.department && !DEPARTMENTS.includes(task.department)) errors.department = 'Invalid department';
  if (task.status && !TASK_STATUSES.includes(task.status)) errors.status = 'Invalid status';
  return errors;
}

/**
 * Validate a full T&A document (order header + tasks + sub-tasks).
 * Returns { valid, header, tasks: [{ errors, subtasks: [errors] }] }.
 */
export function validateTnaDocument(doc) {
  const header = validateOrderHeader(doc);
  let valid = Object.keys(header).length === 0;
  const tasks = (doc.tasks || []).map((task) => {
    const errors = validateTask(task);
    if (Object.keys(errors).length) valid = false;
    const subtasks = (task.subtasks || []).map((st) => {
      const stErrors = validateSubtask(st, task);
      if (Object.keys(stErrors).length) valid = false;
      return stErrors;
    });
    return { errors, subtasks };
  });
  return { valid, header, tasks };
}

/** Flatten a validation result into readable messages (used for API 400 responses). */
export function validationMessages(result, doc) {
  const out = Object.values(result.header);
  result.tasks.forEach((t, i) => {
    const task = doc.tasks[i];
    Object.values(t.errors).forEach((m) => out.push(`${task.task_name || `Task ${i + 1}`}: ${m}`));
    t.subtasks.forEach((st, j) => {
      const name = task.subtasks[j].subtask_name || `Sub-task ${j + 1}`;
      Object.values(st).forEach((m) => out.push(`${task.task_name} › ${name}: ${m}`));
    });
  });
  return out;
}
