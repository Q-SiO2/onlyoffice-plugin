# Deployment

## Selected hosted setup: Railway Trial/Free

The user requested hosting off the presentation laptop and confirmed **free/trial only**. The selected service for this implementation is **Railway**, running the complete app with one persistent volume. Follow [RAILWAY.md](RAILWAY.md) for the provider comparison, exact environment/service settings, private import, credit/expiry limits and deployment checklist. The plugin directory reports both Railway and Vercel installed, but live provider account tools were not exposed in this chat; no cloud deployment or paid resource is claimed.

## Free fallback: laptop + LAN

No hosting account is required. Use an existing trusted classroom router/hotspot that allows peer devices. Keep the laptop powered, disable sleep through your normal system settings, and rehearse Wi-Fi access before class.

1. Prepare `.env` and import the whitelist. Set `PUBLIC_URL=http://YOUR-LAN-IP:3000` and include that exact web origin in `ALLOWED_ORIGINS` alongside the required ONLYOFFICE origin(s).
2. Build and run from the project root:

```powershell
npm ci
npm run build
npm start
```

3. On the laptop, open `http://localhost:3000/presenter` (add this origin to the allowlist if using it), or point the plugin to `http://localhost:3000`.
4. A real phone must reach `http://YOUR-LAN-IP:3000/api/health`. QR generation uses `PUBLIC_URL`; it updates when that setting is changed and the server restarted. The browser/plugin QR component regenerates from the current snapshot.
5. Allow inbound TCP 3000 on the intended private network through your normal firewall administration process if necessary. This project does not change firewall settings automatically.

If developing through Vite, use port 5173 in `PUBLIC_URL` and on phones; Vite proxies API and sockets to 3000. The plugin still uses the backend's port 3000. HTTP LAN is suitable for synthetic demo/rehearsal; real credentials should use an HTTPS endpoint or trusted institutional network according to local policy.

## Single-host Docker

The supplied Dockerfile builds the frontend/backend/plugin and retains the runtime source migration/config. It does not embed `.env`. Docker Compose provides a persistent named data volume. Use the same production `.env` with public URL and strong secrets:

```sh
docker compose build
docker compose up -d
docker compose logs -f app
```

Copy a private source CSV into the volume before the import:

```sh
docker compose cp path/to/class.csv app:/app/data/class.csv
docker compose cp app:/app/data/access-codes.private.csv path/to/access-codes.private.csv
```

The source importer uses tsx. The production image installs runtime-only dependencies, so its command is provided as a bundled Node CLI: use `node dist/scripts/import-class.js` instead of `npm run import:class` inside the image:

```sh
docker compose exec app node dist/scripts/import-class.js /app/data/class.csv /app/data/access-codes.private.csv
docker compose exec app node dist/scripts/purge.js --confirm --days 30
```

Stop with `docker compose down` to keep the volume. Do not add `--volumes` unless you intend to delete private database data. Docker execution was not available/validated in this Windows run; application build and production Node startup are validated separately.

## HTTPS on an existing server

Place a TLS reverse proxy in front of the single Node instance. Example `deploy/Caddyfile.example`:

```caddy
live.example.edu {
  reverse_proxy 127.0.0.1:3000
}
```

With an installed Caddy binary and a domain you control:

```sh
caddy run --config deploy/Caddyfile.example
```

Replace the example domain. Set `PUBLIC_URL=https://your-domain`, `TRUST_PROXY=1`, and allow that origin. The proxy must forward WebSocket upgrades and avoid response buffering for the Socket.IO route. Caddy handles this by default; see its [official reverse proxy docs](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). Direct laptop operation uses `TRUST_PROXY=0`.

## Hosted option

Deploy the **whole web app and Node backend together**, with persistent disk and one instance. A paid Render Web Service with a disk is one documented option. Select Node 24, build `npm ci && npm run build`, start `npm start`, health path `/api/health`, bind `HOST=0.0.0.0`, use the platform `PORT`, mount disk at `/var/data`, set `DATABASE_PATH=/var/data/paloalto.sqlite`, `PUBLIC_URL=https://your-service.onrender.com`, `DEMO_MODE=false`, `TRUST_PROXY=1`, and configure the origins/secrets. Import from its privileged shell with the CLI. Protect temporary CSVs. `render.yaml` supplies the same template; replace the public URL and set secrets in the platform UI before use.

**Free Render web services cannot persist this SQLite database** and may sleep after inactivity. Do not use an ephemeral disk host for the real class. A free hosted demo can be disposable, but must not be represented as durable. [Render free limits](https://render.com/docs/free), [persistent disks](https://render.com/docs/disks), [Web Services](https://render.com/docs/web-services).

Supabase is an alternative requiring a different implemented persistence/realtime adapter (not provided here). The current free plan has 500 MB database, 200 peak realtime connections, 2M messages/month and inactivity pausing. Firebase also provides free quota but requires an authorization/rules redesign. See the decision record. Neither can be configured by merely filling environment variables in this v1.

Vercel docs reviewed on 2026-10-01 contradict older WebSocket guidance: the newer June 2026 knowledge-base page supports WebSockets with function-duration limits and external durable state, while an older limits page says they are unsupported. This repository is still **not a Vercel Function deployment**: SQLite and in-process socket presence assume one long-running process. A Vercel frontend split would also need configured API/socket endpoints or a proxy. No Vercel backend compatibility is claimed. [New guidance](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections), [older limits page](https://vercel.com/docs/limits).

No public hosting account, domain or paid resource was created during this task. Public deployment requires your chosen infrastructure and private real-class configuration.
