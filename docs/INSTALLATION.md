# Installation

Install Node.js 24 or later (includes npm). Use current Chrome, Firefox, Safari or Edge on phones; keep cookies/storage enabled for this origin. ONLYOFFICE Desktop Editors 9.3+ is required for linked graphics. Installed 9.3.1.8 supports the documented APIs; native insertion and refresh still need rehearsal. Internet is needed for initial dependency installation, not for LAN operation afterward.

From the repository root:

```powershell
npm ci
npm run demo
```

Open <http://localhost:5173/presenter>, enter `demo-presenter`, and use `0610000001` / `demo1234` on the participant page. The fake list contains 100 fixtures. Run the simulator in a second terminal. Stop the demo before starting the real-class server.

For your real class:

```powershell
Copy-Item .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run the random-secret command twice. Put the different values in `.env`. Set `DEMO_MODE=false`; replace `PUBLIC_URL` with the address phones can access; set the allowed origins to your web origin and required editor origins. Import the class list as described in [BACKEND_SETUP.md](BACKEND_SETUP.md). Run `npm run dev` for development or `npm run build` then `npm start` for class use.

For the plugin, run `npm run build` then `npm run package:plugin`; install `dist/paloalto-live.plugin` using [ONLYOFFICE_PLUGIN.md](ONLYOFFICE_PLUGIN.md). A phone does not need ONLYOFFICE installed.

Smoke-check with one real phone before admitting the class: scan, authenticate, open vote, choose answer and words, submit, close, show results, move to another scene. Rehearse on the same Wi-Fi and projector you will use in class.
