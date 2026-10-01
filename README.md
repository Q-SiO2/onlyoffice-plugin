# Palo Alto Live

An audience interaction system for **ONLYOFFICE Desktop Editors Presentation Editor**. Students scan one QR code, sign in once with their Moroccan mobile number and personal class code, and stay on the same page through every scene. The presenter controls voting, anonymous results, and word clouds from a right sidebar plugin or the matching browser dashboard.

Built for an academic presentation with restrained Memphis geometry, French mobile screens, accessible controls, and readable projector results. Scenes are configurable; the included two Palo Alto scenes are examples, not a five-scene constraint.

The refreshed interface uses free MIT-licensed Lumen controls, Unlumen's public counter primitive and self-hosted Manrope typography. See [UI design and licensing](docs/UI_DESIGN.md). For hosting off the laptop within free/trial allowances, [Railway is the selected provider](docs/RAILWAY.md).

For the handoff, install/run commands, documentation map and verification boundary, read [Start here](docs/DELIVERY.md).

## Quick start — isolated local demo

Requires **Node.js 24+**, npm, and a modern browser. ONLYOFFICE 8.3+ is required only for the editor integration (live load checked on 9.3.1.8).

```powershell
cd codingprojects/paloalto-live
npm install
npm run demo
```

- Participant: <http://localhost:5173> — phone `0610000001`, code `demo1234`.
- Presenter: <http://localhost:5173/presenter> — key `demo-presenter`.
- Demo automatically creates a session and 100 fictitious eligible students (`0610000001` through `0610000100`). These are synthetic fixtures, not verified unassigned telephone numbers. No SMS is sent.
- Run `npm run simulate -- --participants 30` in another terminal. This connects clients, casts votes and words, closes voting, and shows results. It refuses production servers.
- `Ctrl+C` stops development services. Demo uses `data/demo.sqlite`; production credentials and database settings are overridden for the demo.

## Features

Persistent SQLite sessions; Socket.IO updates with fresh reconnect snapshots; server-side authorization; hashed phones and personal codes; one vote per participant per scene; idempotent network retries; configurable single/multiple-choice polls; bounded predefined or custom words; frequency-sized word cloud; counters; confirmed resets; anonymous CSV export; QR generation; 1600×900 result PNGs; non-destructive current-slide insertion; large plugin windows; a public aggregate projector screen.

![Participant voting](docs/screenshots/mobile-vote.png)
![Presenter dashboard](docs/screenshots/presenter.png)

## Architecture

```mermaid
flowchart LR
  O[ONLYOFFICE plugin / browser presenter] -->|Authenticated HTTP commands| B[Node + Express]
  P[Phones] -->|Whitelist + code / votes| B
  B --> D[(SQLite WAL)]
  B -->|Socket.IO role-specific snapshots| O
  B -->|Socket.IO current scene + own status| P
  B -->|Public aggregates when RESULTS| R[Projector / large plugin window]
```

The production backend serves the compiled web app on the same origin. No Supabase account, Firebase project, Vercel account, SMS provider, or cloud secret is needed. The free classroom option is a laptop on the class LAN. Hosted deployments need a long-running Node instance with persistent disk; see deployment documentation.

## Real class setup

```powershell
Copy-Item .env.example .env
# Generate two different values and put them in ADMIN_KEY and PHONE_HASH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Edit PUBLIC_URL and ALLOWED_ORIGINS for your actual address.
npm run import:class -- shared/sample-class.csv data/access-codes.private.csv
npm run dev
```

Import your **own** CSV (`phone,name`, with optional `pin`) before the class. Generated individual codes must be distributed privately; the system does not send messages. Names are optional and never included in audience output. The private output CSV contains phone numbers and codes: keep it outside Git and delete it when no longer needed. Import warnings include row numbers, not phone numbers.

In development, backend is port 3000 and the Vite web app port 5173. `npm run dev` runs both. For backend only: `npx tsx watch backend/src/index.ts`; frontend only: `npx vite --host 0.0.0.0`. For production:

```powershell
npm run build
npm start
```

Set `PUBLIC_URL=http://YOUR-LAN-IP:3000` for a production build on a LAN, or an HTTPS domain for public deployment. `localhost` in a QR code points to the student's phone, not your laptop. Use HTTPS for real-class credentials whenever possible.

## ONLYOFFICE installation

```powershell
npm run build
npm run package:plugin
```

1. Open a presentation in ONLYOFFICE Desktop Editors.
2. Choose **Plugins → Plugin Manager → My plugins → Install plugin manually**.
3. Select `dist/paloalto-live.plugin`.
4. Choose **Plugins → Palo Alto Live**. In the sidebar enter the backend address (demo: `http://localhost:3000`) and presenter key.
5. Select a slide in edit mode before using insertion buttons. Existing objects are preserved. Use a blank results slide and undo with `Ctrl+Z` if needed.

This workspace's plugin was also installed through the official per-user plugin folder for local validation. The `.plugin` archive contains `config.json` at its root and bundles the SDK locally for use without a CDN.

## Validation and build

```powershell
npm test
npm run lint
npm run typecheck
npm run build
npm run package:plugin
npm run verify:production
npx playwright install chromium
npm run test:e2e
npm run format:check
```

Browser tests use the isolated demo and change its session data. The simulator also resets the current demo scene. Current evidence and manual editor coverage are recorded in [VALIDATION.md](docs/VALIDATION.md).

After staging or committing source, run `npm run package:release` to create `dist/paloalto-live-project.zip` with tracked source and selected production builds. It excludes databases, private codes, `.env`, installed dependencies and test traces. Local Git history remains in this workspace; the ZIP is a portable source delivery.

## Project layout

```text
backend/             Express routes, auth, SQLite store, migration
participant-app/     React mobile, presenter and projector screens
onlyoffice-plugin/   Manifest, SDK bridge, bundled SDK and package inputs
shared/              Configuration, scene schema, state machine, phone rules
scripts/             Demo, simulator, CSV import, build, package and purge
tests/               Model/backend tests and Playwright classroom flow
docs/                Runbooks, architecture, research and screenshots
dist/                Generated production web/backend and .plugin archive
data/                Private local databases and codes (ignored)
```

## Documentation

| Document                                       | Purpose                                       |
| ---------------------------------------------- | --------------------------------------------- |
| [Installation](docs/INSTALLATION.md)           | Requirements and first setup                  |
| [Architecture](docs/ARCHITECTURE.md)           | Components, state and synchronization         |
| [ONLYOFFICE plugin](docs/ONLYOFFICE_PLUGIN.md) | APIs, packaging, installation and limits      |
| [Backend setup](docs/BACKEND_SETUP.md)         | Environment variables and CSV import          |
| [Deployment](docs/DEPLOYMENT.md)               | LAN, Docker, HTTPS and hosted options         |
| [Database](docs/DATABASE.md)                   | Tables, constraints and migration             |
| [Security](docs/SECURITY.md)                   | Permissions, authentication and threat model  |
| [Privacy](docs/PRIVACY.md)                     | Stored data, retention and deletion           |
| [Participant guide](docs/USER_GUIDE.md)        | Student instructions in French                |
| [Presenter guide](docs/PRESENTER_GUIDE.md)     | Nontechnical classroom runbook in French      |
| [Development](docs/DEVELOPMENT.md)             | Commands, scene editing and tests             |
| [Troubleshooting](docs/TROUBLESHOOTING.md)     | Practical fixes                               |
| [Design decisions](docs/DESIGN_DECISIONS.md)   | Alternatives, tradeoffs and official research |
| [Validation](docs/VALIDATION.md)               | Results and remaining manual checks           |
| [Railway deployment](docs/RAILWAY.md)          | Selected Trial/Free hosting and setup         |
| [UI design](docs/UI_DESIGN.md)                 | Free UI resources, tokens and accessibility   |

Source is provided under AGPL-3.0; the unmodified ONLYOFFICE SDK retains its copyright header and additional license terms. See `LICENSE` and [third-party notices](docs/THIRD_PARTY.md). No real credentials are included.
