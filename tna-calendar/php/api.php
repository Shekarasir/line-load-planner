<?php
// T&A Calendar API for PHP hosting (cPanel / CWP / any Apache or nginx + PHP 7.4+).
// Every request comes in as api.php?r=/path; non-GET calls may use ?_method=PUT etc.
// because some shared hosts block PUT/PATCH/DELETE.
define('TNA', true);

if (is_file(__DIR__ . '/config.php')) require __DIR__ . '/config.php';
if (!defined('TNA_DB_FILE') && getenv('TNA_DB_FILE')) define('TNA_DB_FILE', getenv('TNA_DB_FILE'));
date_default_timezone_set(defined('TNA_TIMEZONE') ? TNA_TIMEZONE : 'Asia/Kolkata');

require __DIR__ . '/lib/core.php';
require __DIR__ . '/lib/tna.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/routes.php';

header('X-Content-Type-Options: nosniff');

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'POST' && !empty($_GET['_method'])) $method = strtoupper($_GET['_method']);

    $path = trim((string) ($_GET['r'] ?? ''), '/');
    $seg = $path === '' ? [] : explode('/', $path);
    $head = $seg[0] ?? '';

    if ($head === 'health') send_json(['ok' => true, 'php' => PHP_VERSION, 'sqlite' => in_array('sqlite', PDO::getAvailableDrivers(), true)]);
    if ($head === 'auth') route_auth($method, $seg);

    require_login();
    switch ($head) {
        case 'accounts':
            route_accounts($method, $seg);
        case 'users':
            route_users($method, $seg);
        case 'orders':
            route_orders($method, $seg);
        case 'tasks':
        case 'subtasks':
            if ($method === 'PATCH' && isset($seg[1])) route_patch_item($head, $seg[1]);
            break;
        case 'open-items':
            if ($method === 'GET') route_open_items();
            break;
        case 'backup':
            if ($method === 'GET') route_backup();
            break;
    }
    throw new HttpError(404, 'Not found');
} catch (HttpError $e) {
    send_json(['error' => $e->getMessage(), 'details' => $e->details], $e->status);
} catch (Throwable $e) {
    error_log('[tna] ' . $e);
    send_json(['error' => 'Internal server error'], 500);
}
