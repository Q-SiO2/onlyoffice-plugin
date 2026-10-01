import 'dotenv/config';
import { spawn } from 'node:child_process';
console.log('DEMO ONLY: participant 0610000001 / demo1234; presenter demo-presenter');
console.log('Participant http://localhost:5173 — Presenter http://localhost:5173/presenter');
const child = spawn(
  process.execPath,
  [
    'node_modules/concurrently/dist/bin/concurrently.js',
    '-k',
    '-n',
    'api,web',
    'tsx watch backend/src/index.ts',
    'vite --host 0.0.0.0',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      DEMO_MODE: 'true',
      DATABASE_PATH: 'data/demo.sqlite',
      ADMIN_KEY: 'demo-presenter',
      PHONE_HASH_SECRET: 'demo-only-phone-hash-secret-not-production',
    },
  },
);
child.on('exit', (code) => process.exit(code || 0));
