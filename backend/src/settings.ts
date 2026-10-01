import 'dotenv/config';
import { resolve } from 'node:path';
export type Settings = {
  demo: boolean;
  dbPath: string;
  scenesPath: string;
  publicUrl: string;
  adminKey: string;
  phoneSecret: string;
  origins: string[];
  port: number;
  host: string;
  trustProxy: number;
  retentionDays: number;
};
export function loadSettings(): Settings {
  const demo = process.env.DEMO_MODE === 'true';
  const adminKey = process.env.ADMIN_KEY || (demo ? 'demo-presenter' : '');
  const phoneSecret =
    process.env.PHONE_HASH_SECRET || (demo ? 'demo-only-phone-hash-secret-not-production' : '');
  if (
    !demo &&
    (adminKey.length < 32 ||
      phoneSecret.length < 32 ||
      adminKey.startsWith('replace-') ||
      phoneSecret.startsWith('replace-') ||
      adminKey === phoneSecret)
  ) {
    throw new Error(
      'Configure distinct ADMIN_KEY and PHONE_HASH_SECRET (32+ random characters) in .env, or use npm run demo.',
    );
  }
  const publicUrl = (process.env.PUBLIC_URL || 'http://localhost:5173').replace(/\/$/, '');
  const url = new URL(publicUrl);
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('PUBLIC_URL must be an HTTP(S) URL.');
  return {
    demo,
    adminKey,
    phoneSecret,
    publicUrl,
    dbPath: resolve(
      process.env.DATABASE_PATH || (demo ? 'data/demo.sqlite' : 'data/paloalto.sqlite'),
    ),
    scenesPath: resolve(process.env.SCENES_PATH || 'shared/scenes.json'),
    origins: [
      url.origin,
      ...(
        process.env.ALLOWED_ORIGINS ||
        'http://localhost:5173,http://127.0.0.1:5173,onlyoffice://plugin,null'
      )
        .split(',')
        .map((o) => o.trim()),
    ],
    port: Number(process.env.PORT || 3000),
    host: process.env.HOST || '0.0.0.0',
    trustProxy: Number(process.env.TRUST_PROXY || 0),
    retentionDays: Number(process.env.RETENTION_DAYS || 30),
  };
}
