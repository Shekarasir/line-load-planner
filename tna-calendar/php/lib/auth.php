<?php
// Logins, sessions and admin-managed accounts (mirrors server/auth.js).
defined('TNA') or exit;

const SESSION_COOKIE = 'tna_session';
const SESSION_DAYS = 30;
const MAX_FAILURES = 8;
const LOCK_MINUTES = 15;

function token_hash($token)
{
    return hash('sha256', $token);
}

function set_session_cookie($token, $maxAge)
{
    setcookie(SESSION_COOKIE, $token, [
        'expires' => $maxAge > 0 ? time() + $maxAge : time() - 3600,
        'path' => app_base_path(),
        'secure' => is_https(),
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

function public_account(array $a)
{
    return [
        'id' => (int) $a['id'],
        'username' => $a['username'],
        'display_name' => $a['display_name'],
        'role' => $a['role'],
        'created_at' => $a['created_at'],
    ];
}

function clean_username($value)
{
    $u = strtolower(trim((string) $value));
    if (!preg_match('/^[a-z0-9._-]{3,32}$/', $u)) {
        throw new HttpError(400, 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore');
    }
    return $u;
}

function check_password_rules($password)
{
    if (!is_string($password) || strlen($password) < 8) {
        throw new HttpError(400, 'Password must be at least 8 characters');
    }
}

function current_account()
{
    static $loaded = false, $account = null;
    if ($loaded) return $account;
    $loaded = true;
    $token = $_COOKIE[SESSION_COOKIE] ?? '';
    if ($token !== '') {
        $account = one(
            "SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id
             WHERE s.token_hash = ? AND s.expires_at > datetime('now')",
            [token_hash($token)]
        );
    }
    return $account;
}

function require_login()
{
    $a = current_account();
    if (!$a) throw new HttpError(401, 'Please sign in');
    return $a;
}

function require_admin()
{
    $a = require_login();
    if ($a['role'] !== 'admin') throw new HttpError(403, 'Only an admin can do this');
    return $a;
}

function account_count()
{
    return (int) q('SELECT COUNT(*) FROM accounts')->fetchColumn();
}

function start_session(array $account)
{
    $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    q("DELETE FROM sessions WHERE expires_at <= datetime('now')");
    q("INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, datetime('now', ?))", [
        token_hash($token), $account['id'], '+' . SESSION_DAYS . ' days',
    ]);
    set_session_cookie($token, SESSION_DAYS * 86400);
}

function route_auth($method, array $seg)
{
    $b = request_body();
    $action = $seg[1] ?? '';

    if ($action === 'status' && $method === 'GET') {
        send_json(['needs_setup' => account_count() === 0]);
    }

    // First run: whoever opens the app first creates the admin login.
    if ($action === 'setup' && $method === 'POST') {
        if (account_count() > 0) throw new HttpError(409, 'The app is already set up. Please sign in.');
        $username = clean_username($b['username'] ?? 'admin');
        check_password_rules($b['password'] ?? null);
        q("INSERT INTO accounts (username, display_name, password_hash, role) VALUES (?, ?, ?, 'admin')", [
            $username, trim((string) ($b['display_name'] ?? 'Administrator')), password_hash($b['password'], PASSWORD_DEFAULT),
        ]);
        $account = one('SELECT * FROM accounts WHERE username = ?', [$username]);
        start_session($account);
        send_json(public_account($account), 201);
    }

    if ($action === 'login' && $method === 'POST') {
        $username = strtolower(trim((string) ($b['username'] ?? '')));
        $password = (string) ($b['password'] ?? '');
        $key = ($_SERVER['REMOTE_ADDR'] ?? '') . '|' . $username;
        $f = one('SELECT * FROM login_failures WHERE key = ?', [$key]);
        if ($f && $f['count'] >= MAX_FAILURES && time() - $f['last'] < LOCK_MINUTES * 60) {
            throw new HttpError(429, 'Too many failed attempts. Try again in ' . LOCK_MINUTES . ' minutes.');
        }
        $account = one('SELECT * FROM accounts WHERE username = ?', [$username]);
        if (!$account || !password_verify($password, $account['password_hash'])) {
            q('INSERT OR IGNORE INTO login_failures (key, count, last) VALUES (?, 0, ?)', [$key, time()]);
            q('UPDATE login_failures SET count = count + 1, last = ? WHERE key = ?', [time(), $key]);
            throw new HttpError(401, 'Wrong username or password');
        }
        q('DELETE FROM login_failures WHERE key = ?', [$key]);
        start_session($account);
        send_json(public_account($account));
    }

    if ($action === 'logout' && $method === 'POST') {
        $token = $_COOKIE[SESSION_COOKIE] ?? '';
        if ($token !== '') q('DELETE FROM sessions WHERE token_hash = ?', [token_hash($token)]);
        set_session_cookie('', 0);
        send_no_content();
    }

    if ($action === 'me' && $method === 'GET') {
        send_json(public_account(require_login()));
    }

    if ($action === 'password' && $method === 'POST') {
        $a = require_login();
        if (!password_verify((string) ($b['current_password'] ?? ''), $a['password_hash'])) {
            throw new HttpError(400, 'Current password is incorrect');
        }
        check_password_rules($b['new_password'] ?? null);
        q('UPDATE accounts SET password_hash = ? WHERE id = ?', [password_hash($b['new_password'], PASSWORD_DEFAULT), $a['id']]);
        q('DELETE FROM sessions WHERE account_id = ? AND token_hash <> ?', [$a['id'], token_hash($_COOKIE[SESSION_COOKIE] ?? '')]);
        send_no_content();
    }

    throw new HttpError(404, 'Not found');
}

function route_accounts($method, array $seg)
{
    $me = require_admin();
    $b = request_body();
    $id = $seg[1] ?? null;
    $admins = function () {
        return (int) q("SELECT COUNT(*) FROM accounts WHERE role = 'admin'")->fetchColumn();
    };

    if ($id === null && $method === 'GET') {
        send_json(array_map('public_account', all('SELECT * FROM accounts ORDER BY username')));
    }

    if ($id === null && $method === 'POST') {
        $username = clean_username($b['username'] ?? '');
        $role = in_array($b['role'] ?? '', ['admin', 'user'], true) ? $b['role'] : 'user';
        check_password_rules($b['password'] ?? null);
        if (one('SELECT id FROM accounts WHERE username = ?', [$username])) {
            throw new HttpError(409, "Username \"$username\" is already taken");
        }
        q('INSERT INTO accounts (username, display_name, password_hash, role) VALUES (?, ?, ?, ?)', [
            $username, trim((string) ($b['display_name'] ?? '')), password_hash($b['password'], PASSWORD_DEFAULT), $role,
        ]);
        send_json(public_account(one('SELECT * FROM accounts WHERE id = ?', [(int) db()->lastInsertId()])), 201);
    }

    $account = $id !== null ? one('SELECT * FROM accounts WHERE id = ?', [$id]) : null;
    if (!$account) throw new HttpError(404, 'Login not found');

    if ($method === 'PUT') {
        $role = in_array($b['role'] ?? '', ['admin', 'user'], true) ? $b['role'] : $account['role'];
        if ($account['role'] === 'admin' && $role !== 'admin' && $admins() <= 1) {
            throw new HttpError(400, 'There must be at least one admin');
        }
        $display = array_key_exists('display_name', $b) ? trim((string) $b['display_name']) : $account['display_name'];
        q('UPDATE accounts SET display_name = ?, role = ? WHERE id = ?', [$display, $role, $account['id']]);
        if (!empty($b['password'])) {
            check_password_rules($b['password']);
            q('UPDATE accounts SET password_hash = ? WHERE id = ?', [password_hash($b['password'], PASSWORD_DEFAULT), $account['id']]);
            q('DELETE FROM sessions WHERE account_id = ?', [$account['id']]);
        }
        send_json(public_account(one('SELECT * FROM accounts WHERE id = ?', [$account['id']])));
    }

    if ($method === 'DELETE') {
        if ($account['id'] === $me['id']) throw new HttpError(400, 'You cannot delete your own login');
        if ($account['role'] === 'admin' && $admins() <= 1) throw new HttpError(400, 'There must be at least one admin');
        q('DELETE FROM accounts WHERE id = ?', [$account['id']]);
        send_no_content();
    }

    throw new HttpError(405, 'Method not allowed');
}
