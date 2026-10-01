# Palo Alto Live — start here

Built and validated on 2026-10-01. The project is in:

```text
C:\Users\Q\Documents\Codex\2026-10-01\files-pasted-by-the-user-you\codingprojects\paloalto-live
```

The delivery includes `paloalto-live-project.zip` (portable source, lockfile, documentation and compiled builds) and `paloalto-live.plugin` (installable ONLYOFFICE plugin). The working repository retains its local Git history. Archives exclude `.env`, databases, private codes, dependencies and test traces. If extracting the ZIP elsewhere, use that extracted `paloalto-live` directory in the commands below.

## Use the live deployment

The platform is deployed at <https://paloalto-live-production.up.railway.app>. Open <https://paloalto-live-production.up.railway.app/presenter> to control it. In Railway, open project **appealing-charisma**, service **paloalto-live**, **Variables** and reveal/copy `ADMIN_KEY` for presenter/plugin login. Do not share that key with participants.

Railway remains on the active Trial allowance. A 500 MB persistent volume is mounted at `/app/data`; the Docker build, mounted startup, HTTPS health, presenter login and session survival across redeployment passed. 31 simultaneous hosted WebSocket observers received session snapshots without creating students or votes. The empty verification session is finished; choose **Démarrer une session** when preparing your class. The class whitelist is empty, so import your class and distribute personal codes before presenting. See `docs/RAILWAY.md` for the protected import workflow and credit/expiry checks.

## Run the isolated demo locally

Install Node.js 24 or later if needed, then run in PowerShell:

```powershell
cd "C:\Users\Q\Documents\Codex\2026-10-01\files-pasted-by-the-user-you\codingprojects\paloalto-live"
npm ci
npm run demo
```

Open `http://localhost:5173` for the participant page. Use phone `0610000001` and code `demo1234`. Open `http://localhost:5173/presenter` with key `demo-presenter`. If a previous demo session is finished, choose **Démarrer une session**. Demo data is fictional and must not be used for a real class.

For a crowd demonstration, in another terminal at the project root:

```powershell
npm run simulate -- --participants 30
```

This resets the current demo scene, opens voting, connects clients, saves votes/words and shows results. For actual phones, replace the demo URL with a laptop address reachable from their network; `localhost` in a QR code means the phone itself. See `docs/DEPLOYMENT.md`.

## Install in ONLYOFFICE

1. Open a presentation in ONLYOFFICE Desktop Editors (manifest minimum 8.3; plugin loading checked on installed 9.3.1.8).
2. Open **Plugins → Plugin Manager → My plugins → Install plugin manually**.
3. Select the delivered `paloalto-live.plugin` file, or `dist/paloalto-live.plugin` inside the project.
4. Open **Plugins → Palo Alto Live**. For the hosted platform, enter `https://paloalto-live-production.up.railway.app` and the `ADMIN_KEY` from Railway Variables. For the local demo, use `http://localhost:3000` and `demo-presenter`.
5. Select a blank slide in edit mode to insert result/QR PNGs. Images are added without removing existing objects. Inserted images are snapshots; use the large results window or browser projector for live updates.

The final package should be reinstalled even if the earlier validation copy is already present. See `docs/ONLYOFFICE_PLUGIN.md` for the per-user folder alternative and debugging.

## Architecture and completed functionality

An npm-workspace TypeScript project uses React/Vite for phones and presenter screens, Express/Socket.IO for commands and live updates, and SQLite WAL for persistent records. A locally bundled official ONLYOFFICE SDK bridges the same presenter dashboard to documented plugin windows and image insertion APIs.

Implemented: one QR/login across scenes; Moroccan whitelist normalization plus private individual code; expiring sessions; duplicate-vote prevention; configurable single/multiple-choice polls and word choices; frequency-sized clouds; all presenter states and counters; reset confirmations; reconnect snapshots and offline vote retry; anonymous CSV; PNG results and QR; CSV whitelist import; retention/deletion; isolated demo and simulator. UI defaults to French and uses actual free Unlumen primitives, the exact plugin logo, navy/gold branding and aligned SVG icons. JSON config supports 1–100 scenes.

Phones are stored as keyed hashes; personal codes use scrypt; audience displays contain only aggregate results. No admin secret is included in frontend bundles. The system does not query WhatsApp or send messages.

## Verification evidence

- 16 Node tests passed, including phone rules, authorization, unique/idempotent voting, invalid inputs, state/reset safety, privacy, persistence, concurrent realtime clients and actual CSV import CLI.
- Three Playwright tests passed: classroom flow including Unlumen tabs and clipboard, the built file-origin plugin at 360 px, and responsive/reduced-motion checks with logo alignment.
- Lint, strict typecheck, formatting, production build and plugin packaging passed.
- Compiled production server and compiled import CLI passed a smoke test covering static routes/CSP, login, vote and public results.
- Both 30- and 100-client real Socket.IO simulations passed.
- Final `npm audit` reported zero known vulnerabilities.
- Release ZIP is checked for required files and unpacking, with explicit private-file exclusions.

Full details are in `docs/VALIDATION.md`. These are classroom-sized checks, not a general scalability certification.

## Known limits and remaining setup

The plugin appeared and loaded in the native ONLYOFFICE sidebar. The user stopped Computer Use with Escape before the corrected native backend connection and real slide insertion could be retested. Both passed browser/API-contract checks afterward, but **native connection, native insertion, large windows during fullscreen slides/video, and real Android/iPhone network behavior remain unverified**. Rehearse using a copy of the deck before the class.

Scenes and voting are manual. No dependable embedded-video-end hook was found in the official event documentation. Use the presenter/co-presenter controls after playback. Static slide images do not refresh automatically. Custom text is optional and has no moderation service; visible clouds show the top 24 words, while CSV retains all frequencies.

The delivered backend runs as one Node service on Railway with a mounted SQLite disk. Railway built the Docker image and successfully started it in production mode. Trial credit and expiry limit hosting availability; check both before class. The classroom LAN remains a fallback. Compose, Render and Caddy configurations remain alternative templates.

For a real class on the hosted service: import your own CSV into its mounted database, distribute generated access codes privately, back up/export results, and complete the native/device rehearsal. Railway already holds generated distinct secrets, the HTTPS URL and allowed origins. The import preserves the class list until an administrator explicitly replaces/deletes it; finished sessions have documented 30-day retention.

## Documentation map

All documents are inside `docs/` in the project/ZIP. `README.md` is the main linked index.

| File                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `INSTALLATION.md`      | Requirements and first setup                        |
| `ARCHITECTURE.md`      | Components, state and realtime synchronization      |
| `ONLYOFFICE_PLUGIN.md` | SDK APIs, install/package/debug workflow and limits |
| `BACKEND_SETUP.md`     | Environment and private CSV import                  |
| `DEPLOYMENT.md`        | LAN, Docker, persistent hosting and HTTPS           |
| `DATABASE.md`          | Migration, indexes, uniqueness and relations        |
| `SECURITY.md`          | Authentication, permissions and threat model        |
| `PRIVACY.md`           | Stored information, retention and deletion          |
| `USER_GUIDE.md`        | Participant instructions in French                  |
| `PRESENTER_GUIDE.md`   | Presenter classroom runbook in French               |
| `DEVELOPMENT.md`       | Commands, scene configuration and tests             |
| `TROUBLESHOOTING.md`   | Network, login, state and plugin fixes              |
| `DESIGN_DECISIONS.md`  | Tradeoffs, alternatives and official research links |
| `VALIDATION.md`        | Executed checks and remaining manual verification   |
| `THIRD_PARTY.md`       | SDK provenance and license notices                  |

See `RAILWAY.md` for hosting and `UI_DESIGN.md` for exact free primitive provenance. Screenshots are in `docs/screenshots/`. Deployment templates are `Dockerfile`, `compose.yaml`, `render.yaml` and `deploy/Caddyfile.example`. Root `LICENSE` and SDK notices describe AGPL licensing.
