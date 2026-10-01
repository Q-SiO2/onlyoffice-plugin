import { loadSettings } from '../backend/src/settings.ts';
import { Store } from '../backend/src/store.ts';
const settings=loadSettings(),store=new Store(settings);
if(!process.argv.includes('--confirm'))throw new Error('Use npm run purge -- --confirm [--days 30]. Finished sessions older than the retention period will be deleted.');
const index=process.argv.indexOf('--days'),days=index>=0 ? Number(process.argv[index+1]) : settings.retentionDays;
console.log(`Deleted ${store.purge(days)} expired finished sessions.`);store.db.close();
