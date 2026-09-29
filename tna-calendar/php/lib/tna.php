<?php
// Domain rules — a PHP port of shared/tna.js so the API validates exactly like the Node version.
// Written for PHP 7.4+ (no match/nullsafe/str_contains).
defined('TNA') or exit;

const DEPARTMENTS = ['Merch', 'Fabric', 'Store', 'Production', 'OCR', 'Costing', 'Admin', 'Others'];
const TASK_STATUSES = ['Pending', 'In Progress', 'Delayed', 'Completed'];
const USER_STATUSES = ['Active', 'Inactive'];

/** Parse 'Y-m-d' strictly; returns DateTimeImmutable or null. */
function to_date($value)
{
    if (!is_string($value) || $value === '') return null;
    $d = DateTimeImmutable::createFromFormat('!Y-m-d', substr($value, 0, 10));
    if (!$d || $d->format('Y-m-d') !== substr($value, 0, 10)) return null;
    return $d;
}

function iso_date($value)
{
    $d = $value instanceof DateTimeImmutable ? $value : to_date($value);
    return $d ? $d->format('Y-m-d') : '';
}

function display_date($value)
{
    $d = $value instanceof DateTimeImmutable ? $value : to_date($value);
    return $d ? $d->format('d-M-Y') : '—';
}

/** Signed difference in calendar days (b - a). */
function day_diff(DateTimeImmutable $a, DateTimeImmutable $b)
{
    $diff = $a->diff($b);
    return $diff->invert ? -$diff->days : $diff->days;
}

function lead_time_days($booking, $delivery)
{
    $b = to_date($booking);
    $d = to_date($delivery);
    return ($b && $d) ? day_diff($b, $d) : null;
}

function today_date()
{
    return new DateTimeImmutable('today');
}

/** Not completed and past planned end date ⇒ Delayed. */
function effective_status(array $item, DateTimeImmutable $today)
{
    if (($item['status'] ?? '') === 'Completed') return 'Completed';
    $end = to_date($item['end_date'] ?? '');
    if ($end && day_diff($end, $today) > 0) return 'Delayed';
    return $item['status'] ?: 'Pending';
}

function blank($v)
{
    return trim((string) $v) === '';
}

function validate_header(array $o)
{
    $e = [];
    if (blank($o['order_no'] ?? '')) $e['order_no'] = 'Order No is required';
    if (blank($o['buyer_name'] ?? '')) $e['buyer_name'] = 'Buyer is required';
    $q = $o['order_qty'] ?? null;
    if ($q !== null && $q !== '' && (!is_numeric($q) || (float) $q < 0 || floor((float) $q) != (float) $q)) {
        $e['order_qty'] = 'Quantity must be a whole number';
    }
    $b = to_date($o['booking_date'] ?? '');
    $d = to_date($o['delivery_date'] ?? '');
    if (!$b) $e['booking_date'] = 'Booking date is required';
    if (!$d) $e['delivery_date'] = 'Delivery date is required';
    if ($b && $d && day_diff($b, $d) <= 0) $e['delivery_date'] = 'Delivery date must be after the booking date';
    return $e;
}

function validate_task(array $t)
{
    $e = [];
    if (blank($t['task_name'] ?? '')) $e['task_name'] = 'Task name is required';
    $s = to_date($t['start_date'] ?? '');
    $en = to_date($t['end_date'] ?? '');
    if (!$s) $e['start_date'] = 'Start date is required';
    if (!$en) $e['end_date'] = 'End date is required';
    if ($s && $en && day_diff($s, $en) < 0) $e['end_date'] = 'End date is before start date';
    if (!empty($t['department']) && !in_array($t['department'], DEPARTMENTS, true)) $e['department'] = 'Invalid department';
    if (!empty($t['status']) && !in_array($t['status'], TASK_STATUSES, true)) $e['status'] = 'Invalid status';
    return $e;
}

function validate_subtask(array $st, array $parent)
{
    $e = [];
    if (blank($st['subtask_name'] ?? '')) $e['subtask_name'] = 'Name is required';
    $s = to_date($st['start_date'] ?? '');
    $en = to_date($st['end_date'] ?? '');
    $ps = to_date($parent['start_date'] ?? '');
    $pe = to_date($parent['end_date'] ?? '');
    if (!$s) $e['start_date'] = 'Start date is required';
    if (!$en) $e['end_date'] = 'End date is required';
    if ($s && $ps && day_diff($ps, $s) < 0) $e['start_date'] = 'Cannot start before parent start (' . display_date($ps) . ')';
    if ($en && $pe && day_diff($pe, $en) > 0) $e['end_date'] = 'Cannot end after parent end (' . display_date($pe) . ')';
    if ($s && $en && day_diff($s, $en) < 0 && !isset($e['end_date'])) $e['end_date'] = 'End date is before start date';
    return $e;
}

/** Returns a flat list of messages; empty when the document is valid. */
function validate_document(array $doc)
{
    $out = array_values(validate_header($doc));
    foreach ($doc['tasks'] as $i => $task) {
        $name = $task['task_name'] !== '' ? $task['task_name'] : 'Task ' . ($i + 1);
        foreach (validate_task($task) as $m) $out[] = "$name: $m";
        foreach ($task['subtasks'] as $j => $st) {
            $sname = $st['subtask_name'] !== '' ? $st['subtask_name'] : 'Sub-task ' . ($j + 1);
            foreach (validate_subtask($st, $task) as $m) $out[] = "{$task['task_name']} › $sname: $m";
        }
    }
    return $out;
}
