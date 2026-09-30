<?php
// Users, orders, task progress and backup (mirrors server/routes/*.js).
defined('TNA') or exit;

const OWNER_COLS = 'u.name AS owner_name, u.phone_number AS owner_phone, u.department AS owner_department';

// ---------------------------------------------------------------- users

function clean_user(array $b)
{
    $u = [
        'name' => trim((string) ($b['name'] ?? '')),
        'department' => $b['department'] ?? '',
        'designation' => trim((string) ($b['designation'] ?? '')),
        'phone_number' => trim((string) ($b['phone_number'] ?? '')),
        'status' => !empty($b['status']) ? $b['status'] : 'Active',
    ];
    $errors = [];
    if ($u['name'] === '') $errors[] = 'Name is required';
    if (!in_array($u['department'], DEPARTMENTS, true)) $errors[] = 'Department is required';
    if (!in_array($u['status'], USER_STATUSES, true)) $errors[] = 'Invalid status';
    if ($u['phone_number'] !== '' && !preg_match('/^[+\d][\d\s-]{5,19}$/', $u['phone_number'])) $errors[] = 'Invalid phone number';
    if ($errors) throw new HttpError(400, 'Validation failed', $errors);
    return $u;
}

function route_users($method, array $seg)
{
    $id = $seg[1] ?? null;

    if ($id === null && $method === 'GET') {
        if (!empty($_GET['status'])) {
            send_json(all('SELECT * FROM users WHERE status = ? ORDER BY name COLLATE NOCASE', [$_GET['status']]));
        }
        send_json(all('SELECT * FROM users ORDER BY name COLLATE NOCASE'));
    }
    if ($id === null && $method === 'POST') {
        $u = clean_user(request_body());
        q('INSERT INTO users (name, department, designation, phone_number, status) VALUES (?, ?, ?, ?, ?)',
            [$u['name'], $u['department'], $u['designation'], $u['phone_number'], $u['status']]);
        send_json(one('SELECT * FROM users WHERE id = ?', [(int) db()->lastInsertId()]), 201);
    }

    $user = $id !== null ? one('SELECT * FROM users WHERE id = ?', [$id]) : null;
    if (!$user) throw new HttpError(404, 'User not found');

    if ($method === 'GET') send_json($user);
    if ($method === 'PUT') {
        $u = clean_user(request_body());
        q("UPDATE users SET name = ?, department = ?, designation = ?, phone_number = ?, status = ?,
           updated_at = datetime('now') WHERE id = ?",
            [$u['name'], $u['department'], $u['designation'], $u['phone_number'], $u['status'], $user['id']]);
        send_json(one('SELECT * FROM users WHERE id = ?', [$user['id']]));
    }
    if ($method === 'DELETE') {
        $n = (int) q('SELECT (SELECT COUNT(*) FROM tasks WHERE task_owner_id = ?) + (SELECT COUNT(*) FROM subtasks WHERE task_owner_id = ?)',
            [$user['id'], $user['id']])->fetchColumn();
        if ($n > 0) throw new HttpError(409, "This user owns $n task(s). Mark them Inactive instead of deleting.");
        q('DELETE FROM users WHERE id = ?', [$user['id']]);
        send_no_content();
    }
    throw new HttpError(405, 'Method not allowed');
}

// ---------------------------------------------------------------- orders

function owner_id($v)
{
    return ($v === '' || $v === null) ? null : (int) $v;
}

function normalize_doc(array $b)
{
    $tasks = [];
    foreach ((isset($b['tasks']) && is_array($b['tasks'])) ? $b['tasks'] : [] as $i => $t) {
        $subs = [];
        foreach ((isset($t['subtasks']) && is_array($t['subtasks'])) ? $t['subtasks'] : [] as $j => $s) {
            $subs[] = [
                'seq' => $j + 1,
                'subtask_name' => trim((string) ($s['subtask_name'] ?? '')),
                'start_date' => iso_date($s['start_date'] ?? ''),
                'end_date' => iso_date($s['end_date'] ?? ''),
                'task_owner_id' => owner_id($s['task_owner_id'] ?? null),
                'status' => in_array($s['status'] ?? '', TASK_STATUSES, true) ? $s['status'] : 'Pending',
                'actual_date' => iso_date($s['actual_date'] ?? '') ?: null,
            ];
        }
        $tasks[] = [
            'seq' => (int) ($t['seq'] ?? $i + 1),
            'task_name' => trim((string) ($t['task_name'] ?? '')),
            'start_pct' => isset($t['start_pct']) ? (float) $t['start_pct'] : null,
            'end_pct' => isset($t['end_pct']) ? (float) $t['end_pct'] : null,
            'start_date' => iso_date($t['start_date'] ?? ''),
            'end_date' => iso_date($t['end_date'] ?? ''),
            'department' => in_array($t['department'] ?? '', DEPARTMENTS, true) ? $t['department'] : 'Others',
            'task_owner_id' => owner_id($t['task_owner_id'] ?? null),
            'status' => in_array($t['status'] ?? '', TASK_STATUSES, true) ? $t['status'] : 'Pending',
            'actual_date' => iso_date($t['actual_date'] ?? '') ?: null,
            'remarks' => (string) ($t['remarks'] ?? ''),
            'date_overridden' => !empty($t['date_overridden']) ? 1 : 0,
            'subtasks' => $subs,
        ];
    }
    $qty = $b['order_qty'] ?? null;
    return [
        'order_no' => trim((string) ($b['order_no'] ?? '')),
        'style_number' => trim((string) ($b['style_number'] ?? '')),
        'buyer_name' => trim((string) ($b['buyer_name'] ?? '')),
        'order_qty' => ($qty === '' || $qty === null) ? null : $qty,
        'booking_date' => iso_date($b['booking_date'] ?? ''),
        'delivery_date' => iso_date($b['delivery_date'] ?? ''),
        'tasks' => $tasks,
    ];
}

function assert_valid_doc(array $doc)
{
    $messages = validate_document($doc);
    if ($messages) throw new HttpError(400, 'Validation failed', $messages);
    if (!$doc['tasks']) throw new HttpError(400, 'Validation failed', ['At least one task is required']);
    foreach ($doc['tasks'] as $t) {
        foreach (array_merge([$t['task_owner_id']], array_column($t['subtasks'], 'task_owner_id')) as $oid) {
            if ($oid !== null && !one('SELECT id FROM users WHERE id = ?', [$oid])) {
                throw new HttpError(400, 'Validation failed', ["Task owner #$oid does not exist"]);
            }
        }
    }
}

function write_tasks($orderId, array $tasks)
{
    q('DELETE FROM tasks WHERE order_id = ?', [$orderId]);
    foreach ($tasks as $t) {
        q('INSERT INTO tasks (order_id, seq, task_name, start_pct, end_pct, start_date, end_date, department,
             task_owner_id, status, actual_date, remarks, date_overridden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            $orderId, $t['seq'], $t['task_name'], $t['start_pct'], $t['end_pct'], $t['start_date'], $t['end_date'],
            $t['department'], $t['task_owner_id'], $t['status'], $t['actual_date'], $t['remarks'], $t['date_overridden'],
        ]);
        $taskId = (int) db()->lastInsertId();
        foreach ($t['subtasks'] as $s) {
            q('INSERT INTO subtasks (task_id, seq, subtask_name, start_date, end_date, task_owner_id, status, actual_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
                $taskId, $s['seq'], $s['subtask_name'], $s['start_date'], $s['end_date'], $s['task_owner_id'], $s['status'], $s['actual_date'],
            ]);
        }
    }
}

function load_order($id)
{
    $order = one('SELECT * FROM orders WHERE id = ?', [$id]);
    if (!$order) return null;
    $tasks = all('SELECT t.*, ' . OWNER_COLS . ' FROM tasks t LEFT JOIN users u ON u.id = t.task_owner_id
                  WHERE t.order_id = ? ORDER BY t.seq, t.id', [$id]);
    foreach ($tasks as &$t) {
        $t['subtasks'] = all('SELECT s.*, ' . OWNER_COLS . ' FROM subtasks s LEFT JOIN users u ON u.id = s.task_owner_id
                              WHERE s.task_id = ? ORDER BY s.seq, s.id', [$t['id']]);
    }
    unset($t);
    $order['tasks'] = $tasks;
    return $order;
}

function summarize_order(array $order, DateTimeImmutable $today)
{
    $stats = ['total' => 0, 'completed' => 0, 'delayed' => 0, 'in_progress' => 0, 'pending' => 0];
    $open = [];
    foreach ($order['tasks'] as $t) {
        foreach (array_merge([$t], $t['subtasks']) as $item) {
            $stats['total']++;
            $s = effective_status($item, $today);
            if ($s === 'Completed') $stats['completed']++;
            elseif ($s === 'Delayed') $stats['delayed']++;
            elseif ($s === 'In Progress') $stats['in_progress']++;
            else $stats['pending']++;
        }
        if ($t['status'] !== 'Completed') $open[] = $t;
    }
    usort($open, function ($a, $b) { return strcmp($a['end_date'], $b['end_date']); });
    $next = $open ? $open[0] : null;
    $header = $order;
    unset($header['tasks']);
    $header['stats'] = $stats;
    $header['order_status'] = $stats['completed'] === $stats['total'] ? 'Completed' : ($stats['delayed'] ? 'Delayed' : 'On Track');
    $header['next_task'] = $next ? [
        'id' => $next['id'],
        'task_name' => $next['task_name'],
        'end_date' => $next['end_date'],
        'status' => effective_status($next, $today),
        'owner_name' => $next['owner_name'],
        'owner_phone' => $next['owner_phone'],
    ] : null;
    return $header;
}

function route_orders($method, array $seg)
{
    $id = $seg[1] ?? null;

    if ($id === null && $method === 'GET') {
        $today = today_date();
        $out = [];
        foreach (all('SELECT id FROM orders ORDER BY delivery_date, id') as $row) {
            $out[] = summarize_order(load_order($row['id']), $today);
        }
        send_json($out);
    }

    if ($id === null && $method === 'POST') {
        $doc = normalize_doc(request_body());
        assert_valid_doc($doc);
        $newId = transaction(function () use ($doc) {
            q('INSERT INTO orders (order_no, style_number, buyer_name, order_qty, booking_date, delivery_date, total_lead_time_days)
               VALUES (?, ?, ?, ?, ?, ?, ?)', [
                $doc['order_no'], $doc['style_number'], $doc['buyer_name'], $doc['order_qty'], $doc['booking_date'],
                $doc['delivery_date'], lead_time_days($doc['booking_date'], $doc['delivery_date']),
            ]);
            $orderId = (int) db()->lastInsertId();
            write_tasks($orderId, $doc['tasks']);
            return $orderId;
        });
        send_json(load_order($newId), 201);
    }

    if ($id === null) throw new HttpError(405, 'Method not allowed');

    if ($method === 'GET') {
        $order = load_order($id);
        if (!$order) throw new HttpError(404, 'Order not found');
        send_json($order);
    }
    if ($method === 'PUT') {
        $doc = normalize_doc(request_body());
        assert_valid_doc($doc);
        transaction(function () use ($doc, $id) {
            $n = q("UPDATE orders SET order_no = ?, style_number = ?, buyer_name = ?, order_qty = ?, booking_date = ?,
                    delivery_date = ?, total_lead_time_days = ?, updated_at = datetime('now') WHERE id = ?", [
                $doc['order_no'], $doc['style_number'], $doc['buyer_name'], $doc['order_qty'], $doc['booking_date'],
                $doc['delivery_date'], lead_time_days($doc['booking_date'], $doc['delivery_date']), $id,
            ])->rowCount();
            if (!$n) throw new HttpError(404, 'Order not found');
            write_tasks((int) $id, $doc['tasks']);
        });
        send_json(load_order($id));
    }
    if ($method === 'DELETE') {
        require_admin(); // only admins may delete orders
        if (!q('DELETE FROM orders WHERE id = ?', [$id])->rowCount()) throw new HttpError(404, 'Order not found');
        send_no_content();
    }
    throw new HttpError(405, 'Method not allowed');
}

// ---------------------------------------------------------------- progress

function route_patch_item($table, $id)
{
    $row = one("SELECT * FROM $table WHERE id = ?", [$id]);
    if (!$row) throw new HttpError(404, 'Not found');
    $b = request_body();
    $status = $b['status'] ?? $row['status'];
    if (!in_array($status, TASK_STATUSES, true)) throw new HttpError(400, 'Invalid status');
    $actual = array_key_exists('actual_date', $b) ? (iso_date($b['actual_date']) ?: null) : $row['actual_date'];
    if ($status === 'Completed' && !$actual) $actual = today_date()->format('Y-m-d');
    if ($status !== 'Completed' && isset($b['status']) && !array_key_exists('actual_date', $b)) $actual = null;
    q("UPDATE $table SET status = ?, actual_date = ? WHERE id = ?", [$status, $actual, $row['id']]);
    $orderId = $table === 'tasks' ? $row['order_id'] : (int) q('SELECT order_id FROM tasks WHERE id = ?', [$row['task_id']])->fetchColumn();
    q("UPDATE orders SET updated_at = datetime('now') WHERE id = ?", [$orderId]);
    send_json(one("SELECT * FROM $table WHERE id = ?", [$row['id']]));
}

function route_open_items()
{
    $today = today_date();
    $items = array_merge(
        all("SELECT 'task' AS kind, t.id, t.task_name AS name, NULL AS parent_name, t.start_date, t.end_date, t.status,
                    t.department, o.id AS order_id, o.order_no, o.buyer_name, o.style_number, " . OWNER_COLS . "
             FROM tasks t JOIN orders o ON o.id = t.order_id LEFT JOIN users u ON u.id = t.task_owner_id
             WHERE t.status <> 'Completed'"),
        all("SELECT 'subtask' AS kind, s.id, s.subtask_name AS name, t.task_name AS parent_name, s.start_date, s.end_date,
                    s.status, t.department, o.id AS order_id, o.order_no, o.buyer_name, o.style_number, " . OWNER_COLS . "
             FROM subtasks s JOIN tasks t ON t.id = s.task_id JOIN orders o ON o.id = t.order_id
             LEFT JOIN users u ON u.id = s.task_owner_id
             WHERE s.status <> 'Completed'")
    );
    foreach ($items as &$i) $i['effective_status'] = effective_status($i, $today);
    unset($i);
    usort($items, function ($a, $b) {
        return strcmp($a['end_date'], $b['end_date']) ?: strcmp($a['order_no'], $b['order_no']);
    });
    send_json($items);
}

// ---------------------------------------------------------------- backup

function route_backup()
{
    require_admin();
    $data = [
        'app' => 'Lakkifashions T&A Calendar',
        'exported_at' => gmdate('c'),
        'users' => all('SELECT * FROM users ORDER BY id'),
        'orders' => all('SELECT * FROM orders ORDER BY id'),
        'tasks' => all('SELECT * FROM tasks ORDER BY id'),
        'subtasks' => all('SELECT * FROM subtasks ORDER BY id'),
        'accounts' => array_map('public_account', all('SELECT * FROM accounts ORDER BY id')),
    ];
    header('Content-Disposition: attachment; filename="tna-backup-' . date('Y-m-d') . '.json"');
    send_json($data);
}
