<?php
// One-time admin password reset for the T&A Calendar (PHP version).
// Put this file in the app's folder (next to api.php), open it in the browser,
// choose a new password. It deletes itself afterwards.
define('TNA', true);
if (!is_file(__DIR__ . '/lib/core.php')) exit('Put this file in the T&A app folder (the one that contains api.php).');
if (is_file(__DIR__ . '/config.php')) require __DIR__ . '/config.php';
require __DIR__ . '/lib/core.php';

$admin = one("SELECT * FROM accounts WHERE role = 'admin' ORDER BY id LIMIT 1");
if (!$admin) exit('No admin login exists yet — just open the app to create one.');

$msg = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $p = (string) ($_POST['password'] ?? '');
    if (strlen($p) < 8) {
        $msg = 'Password must be at least 8 characters.';
    } elseif ($p !== (string) ($_POST['confirm'] ?? '')) {
        $msg = 'Passwords do not match.';
    } else {
        q('UPDATE accounts SET password_hash = ? WHERE id = ?', [password_hash($p, PASSWORD_DEFAULT), $admin['id']]);
        q('DELETE FROM sessions WHERE account_id = ?', [$admin['id']]);
        q('DELETE FROM login_failures');
        @unlink(__FILE__);
        exit('<p style="font:16px sans-serif">Password changed for <b>' . htmlspecialchars($admin['username']) .
            '</b>. This reset page has been deleted. <a href="./">Sign in</a>.</p>');
    }
}
?>
<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Reset admin password</title>
<form method="post" style="font:16px sans-serif;max-width:340px;margin:40px auto;display:grid;gap:10px">
  <h2 style="margin:0">Reset admin password</h2>
  <div>Admin username: <b><?= htmlspecialchars($admin['username']) ?></b></div>
  <?php if ($msg) echo '<div style="color:#b91c1c">' . htmlspecialchars($msg) . '</div>'; ?>
  <input type="password" name="password" placeholder="New password (min 8)" required style="padding:10px">
  <input type="password" name="confirm" placeholder="Confirm new password" required style="padding:10px">
  <button style="padding:10px;background:#233f99;color:#fff;border:0;border-radius:6px">Set new password</button>
</form>
