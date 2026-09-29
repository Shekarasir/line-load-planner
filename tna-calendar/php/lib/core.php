<?php
// HTTP helpers, database connection and schema.
defined('TNA') or exit;

class HttpError extends Exception
{
    public $status;
    public $details;

    public function __construct($status, $message, $details = null)
    {
        parent::__construct($message);
        $this->status = $status;
        $this->details = $details;
    }
}

function send_json($data, $status = 200)
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function send_no_content()
{
    http_response_code(204);
    header('Cache-Control: no-store');
    exit;
}

function request_body()
{
    static $body = null;
    if ($body === null) {
        $raw = file_get_contents('php://input');
        $decoded = $raw === '' ? [] : json_decode($raw, true);
        $body = is_array($decoded) ? $decoded : [];
    }
    return $body;
}

function is_https()
{
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') return true;
    return strtolower($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
}

/** URL path of the folder the app is installed in, e.g. "/tna/". */
function app_base_path()
{
    $dir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
    return rtrim($dir, '/') . '/';
}

function path_is_inside($path, $root)
{
    if (!$root) return false;
    $root = rtrim(str_replace('\\', '/', $root), '/') . '/';
    return strpos(rtrim(str_replace('\\', '/', $path), '/') . '/', $root) === 0;
}

/**
 * Folders that are served on the web: the site's document root and the
 * account's public_html (addon domains often live inside public_html).
 */
function web_roots()
{
    $roots = [];
    $docRoot = realpath($_SERVER['DOCUMENT_ROOT'] ?? '');
    if ($docRoot) $roots[] = $docRoot;
    $appDir = dirname(__DIR__);
    for ($d = $appDir; $d !== dirname($d); $d = dirname($d)) {
        if (in_array(basename($d), ['public_html', 'www', 'htdocs', 'httpdocs', 'html'], true)) $roots[] = $d;
    }
    $roots[] = $appDir;
    return $roots;
}

/**
 * Where the SQLite file lives. Preferred: a "tna-data" folder in the hosting
 * account's home, next to public_html (never reachable from the web). Fallback:
 * a data/ folder inside the app with a random, unguessable file name and a
 * deny-all .htaccess.
 */
function database_file()
{
    if (defined('TNA_DB_FILE') && TNA_DB_FILE) return TNA_DB_FILE;

    $roots = web_roots();
    $candidates = [];
    foreach ($roots as $r) {
        if (in_array(basename($r), ['public_html', 'www', 'htdocs', 'httpdocs', 'html'], true)) $candidates[] = dirname($r);
    }
    // cPanel-style accounts live in /home/<user>/… — use that home even when the
    // site's folder is outside public_html (e.g. a subdomain folder).
    if (preg_match('#^(/home\d*/[^/]+)/#', str_replace('\\', '/', __DIR__), $m)) $candidates[] = $m[1];
    if (function_exists('posix_getpwuid') && function_exists('posix_geteuid')) {
        $pw = @posix_getpwuid(posix_geteuid());
        if (!empty($pw['dir'])) $candidates[] = $pw['dir'];
    }
    $candidates[] = dirname(__DIR__, 3);

    foreach ($candidates as $base) {
        $dir = rtrim($base, '/') . '/tna-data';
        $public = false;
        foreach ($roots as $r) $public = $public || path_is_inside($dir, $r);
        if ($public) continue;
        if ((is_dir($dir) || @mkdir($dir, 0700, true)) && is_writable($dir)) return $dir . '/tna.sqlite';
    }

    $inside = dirname(__DIR__) . '/data';
    if (!is_dir($inside) && !@mkdir($inside, 0700, true)) {
        throw new HttpError(500, 'Cannot create a data folder. Make the app folder writable or set TNA_DB_FILE in config.php.');
    }
    @file_put_contents($inside . '/.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    @file_put_contents($inside . '/index.html', '');
    $nameFile = $inside . '/db-name.php';
    if (!is_file($nameFile)) {
        $name = 'tna-' . bin2hex(random_bytes(12)) . '.sqlite';
        file_put_contents($nameFile, "<?php return '" . $name . "';\n");
    }
    return $inside . '/' . (require $nameFile);
}

function db()
{
    static $pdo = null;
    if ($pdo) return $pdo;
    if (!in_array('sqlite', PDO::getAvailableDrivers(), true)) {
        throw new HttpError(500, 'The PHP "pdo_sqlite" extension is not enabled on this server.');
    }
    $pdo = new PDO('sqlite:' . database_file(), null, null, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA busy_timeout = 5000');
    create_schema($pdo);
    return $pdo;
}

function create_schema(PDO $pdo)
{
    $pdo->exec(<<<'SQL'
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL CHECK (department IN ('Merch','Fabric','Store','Production','OCR','Costing','Admin','Others')),
  designation TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL,
  style_number TEXT NOT NULL DEFAULT '',
  buyer_name TEXT NOT NULL,
  order_qty INTEGER,
  booking_date TEXT NOT NULL,
  delivery_date TEXT NOT NULL,
  total_lead_time_days INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (delivery_date > booking_date)
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  start_pct REAL,
  end_pct REAL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  department TEXT NOT NULL,
  task_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Delayed','Completed')),
  actual_date TEXT,
  remarks TEXT NOT NULL DEFAULT '',
  date_overridden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  subtask_name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  task_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','In Progress','Delayed','Completed')),
  actual_date TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_failures (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  last INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_order ON tasks(order_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
SQL
    );
}

// Older PHP/PDO versions return every column as a string; the React client
// expects real numbers and booleans, so rows are normalised here.
const INT_COLUMNS = ['id', 'order_id', 'task_id', 'account_id', 'seq', 'order_qty', 'total_lead_time_days', 'task_owner_id'];
const FLOAT_COLUMNS = ['start_pct', 'end_pct'];

function norm_row($row)
{
    if (!$row) return $row;
    foreach ($row as $k => $v) {
        if ($v === null) continue;
        if (in_array($k, INT_COLUMNS, true)) $row[$k] = (int) $v;
        elseif (in_array($k, FLOAT_COLUMNS, true)) $row[$k] = (float) $v;
        elseif ($k === 'date_overridden') $row[$k] = (bool) (int) $v;
    }
    return $row;
}

function q($sql, array $params = [])
{
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function one($sql, array $params = [])
{
    $row = q($sql, $params)->fetch();
    return $row ? norm_row($row) : null;
}

function all($sql, array $params = [])
{
    return array_map('norm_row', q($sql, $params)->fetchAll());
}

function transaction(callable $fn)
{
    $pdo = db();
    $pdo->beginTransaction();
    try {
        $result = $fn();
        $pdo->commit();
        return $result;
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
