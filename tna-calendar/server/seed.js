// Seeds a few sample staff members so the owner drop-downs aren't empty on first run.
// Usage: npm run seed
import { openDatabase } from './db.js';

const db = openDatabase();
const { n } = db.prepare('SELECT COUNT(*) AS n FROM users').get();
if (n > 0) {
  console.log(`User Master already has ${n} record(s); nothing seeded.`);
} else {
  const ins = db.prepare('INSERT INTO users (name, department, designation, phone_number) VALUES (?, ?, ?, ?)');
  [
    ['Merchandiser (sample)', 'Merch', 'Senior Merchandiser', '+91 90000 00001'],
    ['Fabric In-charge (sample)', 'Fabric', 'Fabric Manager', '+91 90000 00002'],
    ['Store Keeper (sample)', 'Store', 'Store In-charge', '+91 90000 00003'],
    ['Production Manager (sample)', 'Production', 'Production Manager', '+91 90000 00004'],
    ['OCR Executive (sample)', 'OCR', 'Executive', '+91 90000 00005'],
    ['Costing Executive (sample)', 'Costing', 'Costing Manager', '+91 90000 00006'],
  ].forEach((u) => ins.run(...u));
  console.log('Seeded 6 sample users.');
}
