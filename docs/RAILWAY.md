# Railway deployment — free/trial only

Deployed and verified on **2026-10-01** for the current React + Express + Socket.IO + SQLite architecture.

## Choice and budget

Deploy the web app and backend **together in one Railway service**, with one attached persistent volume. Your presentation laptop then only runs ONLYOFFICE/the presenter interface; audience traffic and saved votes go to Railway. No separate Vercel frontend or second paid database is needed.

| Option  | Fit for this version                                                                                               | Free conditions                                                                                                                                                              |
| ------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway | Direct fit: persistent Node process, WebSockets and SQLite volume                                                  | New-account trial: $5 credit for up to 30 days; then Free offers $1 monthly credit, 0.5 GB RAM and 0.5 GB volume. Availability depends on your account and remaining credit. |
| Vercel  | WebSockets are supported, but the current in-process state and SQLite file need redesign for distributed Functions | Hobby is available, but a frontend-only deployment leaves the backend to host elsewhere. Not selected for the delivered backend.                                             |

**Stay on Trial/Free; do not choose Hobby, add billing, or purchase credits.** Free credit is a usage budget, not an unlimited uptime guarantee. Check credit and trial expiry before the presentation. Railway says trial volumes may be deleted 30 days after credit expiry; export and back up results before then. Do not rely on trial storage as a permanent student archive.

31 participants are a modest application workload: the local 100-client simulator has passed. That is useful functional evidence, not a guarantee of performance on a particular free host/network. Hosting removes the laptop server/network setup from the presentation, rather than solving a demonstrated 31-client capacity failure.

Official sources: [pricing](https://railway.com/pricing), [plan resources](https://docs.railway.com/pricing/plans), [free trial and retention](https://docs.railway.com/pricing/free-trial), [volumes](https://docs.railway.com/volumes/reference), [Vercel WebSocket lifecycle and persistent state](https://vercel.com/docs/functions/websockets).

## Account/tool status

Railway was reconnected. The user confirmed active free trial credit. The dashboard shows Trial; no paid plan or billing upgrade was selected.

- Repository: [Q-SiO2/onlyoffice-plugin](https://github.com/Q-SiO2/onlyoffice-plugin), branch `main`.
- Project: `appealing-charisma`; service: `paloalto-live`; environment: `production`.
- Participant URL: <https://paloalto-live-production.up.railway.app>.
- Presenter URL: <https://paloalto-live-production.up.railway.app/presenter>.
- One replica in US West (California), with `paloalto-live-volume` attached at `/app/data`, **500 MB**. Volume ID: `53652360-3107-423f-b09e-ec5b65ac6f71`.
- Successful deployment: `d4af48ea-8645-45af-b3b7-bdea80bcd930`, building UI commit `ccdf931` with the root Dockerfile. Runtime logs confirm the volume mounted and the API started in production mode.
- HTTPS `/api/health` returns `ok: true`, `demo: false`; public state reports the correct HTTPS join URL. Live browser inspection passed without console errors.

CPU/memory use the account's Trial defaults (dashboard maximum 2 vCPU / 1 GB); custom lower caps were unavailable on this account. These are maximum resources, not measured consumption. The earlier requested Amsterdam/512 MB settings did not apply. The actual settings above were read back after deployment.

Generated `ADMIN_KEY` and `PHONE_HASH_SECRET` are stored in Railway Variables. Reveal/copy `ADMIN_KEY` there to log into the presenter or plugin; it is never included in the repository or downloads. Production has an **empty whitelist**. Import the real class using the workflow below before inviting participants. No real student data has been uploaded. An empty presentation session survived a deliberate redeployment (`cbfbd11b-9007-4b7d-9414-40a733fc69dd`); its ID and WAITING state were read back unchanged. Presenter login with the generated key and 31 simultaneous production WebSocket observer connections passed. This transport check created no participant records or votes; the authenticated voting simulation remains the local 100-client test. The empty verification session was finished afterward. Real phone/editor rehearsal remains to perform with the imported class.

## Service setup

1. In your Railway account, confirm the active plan is Trial/Free and that credit remains. Create a project and **one** application service from this repository/project root. If connecting GitHub, use a private repository unless you intentionally publish the source. Never upload `.env`, `data/`, `work/`, real CSVs or test traces as source.
2. Use the included root `Dockerfile` (Node 24). It builds the web app, backend and compiled administrative CLIs. The start command is `node dist/backend/index.js`. The server honors Railway's supplied `PORT`; `HOST` must be `0.0.0.0`.
3. Attach one volume, mounted at `/app/data`, within the Trial/Free storage allowance. Set `DATABASE_PATH=/app/data/paloalto.sqlite`. SQLite must never be placed on the service's ephemeral filesystem. Keep one replica; Railway volumes do not support replicas.
4. In service settings, set healthcheck path `/api/health`. Choose a nearby available region. Set a restart policy for failures. Avoid redeployment while a class is voting; a service with a volume has a brief restart/downtime.
5. Generate a Railway HTTPS domain in public networking. It will serve `/`, `/presenter`, `/display`, `/api/*` and `/socket.io/*` from the same service.
6. Set the environment variables in the next section, using your actual domain, then deploy/redeploy.

Railway's current [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code) replaces legacy `railway.json`/`railway.toml` deployment configuration. This project intentionally supplies dashboard settings and environment examples instead of introducing a soon-deprecated legacy file.

## Environment variables

Copy values from `deploy/railway.env.example` into Railway variables; this file contains placeholders, not usable production secrets.

```dotenv
NODE_ENV=production
HOST=0.0.0.0
DATABASE_PATH=/app/data/paloalto.sqlite
SCENES_PATH=shared/scenes.json
DEMO_MODE=false
PUBLIC_URL=https://YOUR-SERVICE.up.railway.app
ALLOWED_ORIGINS=https://YOUR-SERVICE.up.railway.app,onlyoffice://plugin,null
TRUST_PROXY=1
RETENTION_DAYS=30
ADMIN_KEY=YOUR-DISTINCT-RANDOM-SECRET
PHONE_HASH_SECRET=YOUR-OTHER-DISTINCT-RANDOM-SECRET
RAILWAY_RUN_UID=0
```

Generate each secret separately with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`RAILWAY_RUN_UID=0` follows Railway's [documented volume permission workaround](https://docs.railway.com/volumes/reference) for Docker images that normally run as a non-root user. The included Dockerfile defaults to `node`; Railway-mounted volume ownership otherwise may prevent writes. For a hardened long-term deployment, arrange writable volume ownership for a non-root UID instead. Never change `PHONE_HASH_SECRET` after import without intentionally reimporting the whitelist.

Do not set demo credentials on a real class service. The explicit `null` CORS origin supports the local file-origin ONLYOFFICE plugin and still requires bearer authorization. If your editor uses only the modern `onlyoffice://plugin` origin, remove `null` after rehearsal. Keep the browser origin exact.

## Class import without putting phones in the source repository

Use a privileged Railway shell/SSH or volume file transfer to upload the real CSV to `/app/data/class.private.csv`. Run the compiled CLI **inside the deployed container**, against its mounted DB:

```sh
node dist/scripts/import-class.js /app/data/class.private.csv /app/data/access-codes.private.csv
```

Download the generated private output through the protected volume/shell workflow, distribute individual codes privately, then remove temporary CSVs from the service when no longer needed. The import script deliberately refuses to overwrite an existing output file. Do not use `railway run npm run import:class` locally as a substitute: `railway run` executes on your laptop and does not mount the remote service volume.

## Verify the deployed service

1. Confirm `https://YOUR-SERVICE.up.railway.app/api/health` returns `ok: true` and `demo: false`.
2. Open `/presenter`, authenticate with the configured key and start a session. The same domain must appear in the QR code.
3. Join from an actual phone with an authorized number and personal code. Open/close a vote, show results, and move to another scene without logging in again.
4. Point the ONLYOFFICE plugin to the HTTPS domain. Rehearse image insertion and large windows using a copy of the deck. Native insertion is still a manual verification item.
5. Confirm the data survives an intentional service restart, verify available credits, and export results after the class. Never run the synthetic simulator against the real service; it intentionally refuses production mode.

The deployed app offers participant pages, not video streaming. Presentation video stays local in ONLYOFFICE, so audience connections mostly carry small state/vote messages.

## Free allowance contingency

If your trial is unavailable/expired or Free credit is exhausted, no paid fallback is authorized. Rehearse the existing local LAN option in `DEPLOYMENT.md`, or postpone deployment until free access is available. Do not replace SQLite with ephemeral storage merely to make a free deployment appear successful.
