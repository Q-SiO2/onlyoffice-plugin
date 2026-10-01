# Third-party components

The main project source is distributed under AGPL-3.0 (see `LICENSE`). The unchanged ONLYOFFICE SDK has its own AGPL-3.0 header and additional conditions; that header is retained in source and the plugin package. Do not strip it or represent the SDK as original project work.

`onlyoffice-plugin/vendor/plugins.js` was retrieved on 2026-10-01 from the SDK URL linked by the [official Asc.plugin documentation](https://api.onlyoffice.com/docs/plugins/interacting-with-editors/overview/asc-plugin/):

```text
https://onlyoffice.github.io/sdkjs-plugins/v1/plugins.js
SHA-256: 1bc0bd71eebcb477ceaaee3ab00ed1a10ce7eae117ec68ae8024645c435f524e
```

It is an immutable local snapshot for this release; no build step silently downloads a newer SDK. Updating it is an intentional compatibility change requiring rebuild, license/provenance review and editor rehearsal. The source URL can change over time, so the checksum identifies exactly what was bundled.

Runtime libraries are installed from `package-lock.json`: React/ReactDOM, Express, Socket.IO, Zod, QRCode, csv-parse, CORS, Helmet, dotenv and express-rate-limit. Build/test tools include Vite, esbuild, TypeScript, tsx, Playwright, ESLint, Prettier, concurrently and fflate. Their individual copyright/license notices remain in npm distributions. This project uses no external font service, remote UI image service or tracking SDK. The geometric icon is generated in `scripts/assets.ts`.
