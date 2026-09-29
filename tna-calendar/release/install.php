<?php
// One-time installer for Lakkifashions apps on GoDaddy / cPanel hosting.
// Put this file in a site's folder and open it with ?app=tna, ?app=portal or ?app=lineload.
// It downloads the latest package from GitHub, unpacks it here and deletes itself.
$packages = [
    'tna' => 'tna-upload.zip',
    'portal' => 'portal.zip',
    'lineload' => 'lineload.zip',
];
$app = isset($_GET['app']) ? $_GET['app'] : '';
if (!isset($packages[$app])) exit('Add ?app=tna, ?app=portal or ?app=lineload to the address.');

$url = 'https://raw.githubusercontent.com/Shekarasir/Lakki-T-A/main/release/' . $packages[$app];
$zip = __DIR__ . '/package.zip';
$ch = curl_init($url);
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 60]);
$data = curl_exec($ch);
if (!$data || curl_getinfo($ch, CURLINFO_HTTP_CODE) != 200) exit('Download failed: ' . curl_error($ch));
file_put_contents($zip, $data);

// The start page replaces an old T&A copy in the same folder (its data lives elsewhere and is kept).
if ($app === 'portal') {
    $rm = function ($path) use (&$rm) {
        if (is_dir($path)) {
            foreach (array_diff(scandir($path), ['.', '..']) as $f) $rm("$path/$f");
            rmdir($path);
        } elseif (is_file($path)) {
            unlink($path);
        }
    };
    foreach (['api.php', 'config.sample.php', 'lib', 'assets'] as $old) $rm(__DIR__ . '/' . $old);
}

$z = new ZipArchive();
if ($z->open($zip) !== true) exit('Could not open the downloaded package');
$z->extractTo(__DIR__);
$z->close();
unlink($zip);
unlink(__FILE__);
echo 'Installed! <a href="./">Open it</a>.';
