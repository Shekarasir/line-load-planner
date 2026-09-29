// Builds the PHP-hosting package in dist-php/ (upload its contents to e.g. public_html/tna/).
//   npm run build:php
import { cpSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

rmSync('dist-php', { recursive: true, force: true });
execSync('npx vite build --mode php', { stdio: 'inherit' });
cpSync('php', 'dist-php', { recursive: true });
if (existsSync('dist-php/config.php')) rmSync('dist-php/config.php'); // never ship a local config
console.log('\nPHP package ready in dist-php/ — upload its contents to public_html/tna/');
