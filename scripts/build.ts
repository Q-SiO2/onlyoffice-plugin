import { build } from 'esbuild';
import { mkdir, copyFile, cp } from 'node:fs/promises';
await mkdir('dist/backend', { recursive: true });
await build({
  entryPoints: ['backend/src/index.ts'],
  outfile: 'dist/backend/index.js',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
});
await build({
  entryPoints: { 'import-class': 'scripts/import-class.ts', purge: 'scripts/purge.ts' },
  outdir: 'dist/scripts',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
});
await mkdir('onlyoffice-plugin/dist', { recursive: true });
await build({
  entryPoints: {
    app: 'onlyoffice-plugin/src/main.tsx',
    window: 'onlyoffice-plugin/src/window.tsx',
  },
  outdir: 'onlyoffice-plugin/dist',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome100',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
for (const name of ['index.html', 'window.html', 'config.json', 'icon.png', 'icon@2x.png'])
  await copyFile(`onlyoffice-plugin/${name}`, `onlyoffice-plugin/dist/${name}`);
await cp('onlyoffice-plugin/vendor', 'onlyoffice-plugin/dist/vendor', { recursive: true });
console.log('Built backend, participant/presenter web app, and self-contained ONLYOFFICE plugin.');
