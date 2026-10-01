import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import { normalizePhone } from '../shared/phone.ts';
import { loadSettings } from '../backend/src/settings.ts';
import { Store } from '../backend/src/store.ts';
const file = process.argv[2];
if (!file)
  throw new Error(
    'Usage: npm run import:class -- path/to/class.csv [path/to/access-codes.private.csv]',
  );
const out = process.argv[3] || 'data/access-codes.private.csv';
const settings = loadSettings(),
  store = new Store(settings);
const rows = parse(await readFile(file, 'utf8'), {
  columns: true,
  skip_empty_lines: true,
  bom: true,
  trim: true,
}) as Record<string, string>[];
if (!rows.length || !('phone' in rows[0]))
  throw new Error('CSV needs a phone column; name and pin are optional.');
const seen = new Set<string>(),
  valid: { phone: string; name: string; pin: string }[] = [];
let invalid = 0,
  duplicates = 0;
rows.forEach((row, index) => {
  try {
    const phone = normalizePhone(row.phone);
    if (seen.has(phone)) {
      duplicates++;
      console.warn(`Row ${index + 2}: duplicate skipped.`);
      return;
    }
    const name = (row.name || '').trim();
    if (name.length > 160) throw new Error('Name too long.');
    const pin = row.pin || randomBytes(8).toString('base64url');
    if (pin.length < 8 || pin.length > 64)
      throw new Error('Access code must contain 8–64 characters.');
    seen.add(phone);
    valid.push({ phone, name, pin });
  } catch (e) {
    invalid++;
    console.warn(`Row ${index + 2}: ${e instanceof Error ? e.message : 'Invalid number'}`);
  }
});
// Write credentials before touching the DB; stop if the target exists to avoid losing prior codes.
const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';
await writeFile(
  out,
  'phone,name,pin\n' + valid.map((r) => [r.phone, r.name, r.pin].map(esc).join(',')).join('\n'),
  { flag: 'wx', mode: 0o600 },
);
try {
  store.transaction(() => {
    for (const r of valid) store.upsertParticipant(r.phone, r.pin, r.name);
  });
} finally {
  store.db.close();
}
console.log(
  `Imported ${valid.length}; duplicate rows ${duplicates}; invalid rows ${invalid}. Private credential file: ${out}`,
);
if (invalid) process.exitCode = 2;
