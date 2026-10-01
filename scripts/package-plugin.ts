import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { join } from 'node:path';
const entries:Record<string,Uint8Array>={};
async function collect(path:string,prefix='') {for(const item of await readdir(path,{withFileTypes:true})) {const name=prefix+item.name; if(item.isDirectory())await collect(join(path,item.name),name+'/');else entries[name]=await readFile(join(path,item.name));}}
await collect('onlyoffice-plugin/dist');
if(!entries['config.json'] || !entries['app.js'] || !entries['vendor/plugins.js'])throw new Error('Run npm run build first.');
await mkdir('dist',{recursive:true});
await writeFile('dist/paloalto-live.plugin',zipSync(entries));
console.log('Created dist/paloalto-live.plugin (config.json at archive root).');
