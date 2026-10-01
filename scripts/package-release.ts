import { execFileSync } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync, unzipSync } from 'fflate';

// Tracked source plus explicitly selected builds. Never archive the checkout wholesale.
const entries: Record<string, Uint8Array> = {};
const sourceFiles = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
if (!sourceFiles.includes('docs/VALIDATION.md'))
  throw new Error('Commit or stage the complete source and documentation first.');

function assertPublicPath(path: string) {
  if (
    /(^|\/)(\.git|node_modules|data|work|test-results|playwright-report)(\/|$)/.test(path) ||
    (/(^|\/)\.env($|\.)/.test(path) && !path.endsWith('.env.example')) ||
    /\.(?:sqlite(?:-wal|-shm)?|private\.csv|log)$/.test(path)
  )
    throw new Error(`Refusing to package private/generated path: ${path}`);
}

for (const path of sourceFiles) {
  assertPublicPath(path);
  entries[`paloalto-live/${path}`] = await readFile(path);
}

async function collect(path: string) {
  for (const item of await readdir(path, { withFileTypes: true })) {
    const next = join(path, item.name).replaceAll('\\', '/');
    if (item.isDirectory()) await collect(next);
    else {
      assertPublicPath(next);
      entries[`paloalto-live/${next}`] = await readFile(next);
    }
  }
}

for (const path of ['dist/backend', 'dist/client', 'dist/scripts', 'onlyoffice-plugin/dist'])
  await collect(path);
entries['paloalto-live/dist/paloalto-live.plugin'] = await readFile('dist/paloalto-live.plugin');

const required = [
  'README.md',
  '.env.example',
  'package-lock.json',
  'shared/scenes.json',
  'backend/migrations/001_initial.sql',
  'docs/VALIDATION.md',
  'dist/backend/index.js',
  'dist/client/index.html',
  'dist/scripts/import-class.js',
  'dist/paloalto-live.plugin',
  'onlyoffice-plugin/dist/config.json',
];
for (const path of required)
  if (!entries[`paloalto-live/${path}`]) throw new Error(`Missing release file: ${path}`);

const archive = zipSync(entries, { level: 6 });
const verified = unzipSync(archive);
if (Object.keys(verified).length !== Object.keys(entries).length)
  throw new Error('Archive verification failed.');
await writeFile('dist/paloalto-live-project.zip', archive);
console.log(
  `Created dist/paloalto-live-project.zip: ${Object.keys(entries).length} files, ${(archive.length / 1024 / 1024).toFixed(2)} MiB. No database, private codes, installed dependencies or .env included.`,
);
