import { createApp } from './app.ts';
import { loadSettings } from './settings.ts';
const settings=loadSettings();
const server=createApp(settings);
server.store.purge(settings.retentionDays);
server.http.listen(settings.port,settings.host,()=>{
  console.log(`Palo Alto Live API listening on port ${settings.port}. ${settings.demo ? 'DEMO — fake participants only.' : 'Production mode.'}`);
});
for(const signal of ['SIGTERM','SIGINT'] as const) process.on(signal,()=>void server.close().then(()=>process.exit(0)));
