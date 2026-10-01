# Development

Run commands from the repository root. Node 24+ and npm are required. `npm ci` installs versions from the lockfile; use `npm install` only when intentionally changing dependencies.

| Command                                                    | Result                                                        |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| `npm run demo`                                             | Isolated demo DB, fake keys/list, backend + Vite              |
| `npm run dev`                                              | Backend + Vite using your `.env`                              |
| `npm test`                                                 | Node model + SQLite/HTTP/Socket.IO integration tests          |
| `npm run lint`                                             | ESLint/TypeScript rules                                       |
| `npm run typecheck`                                        | Strict TypeScript without emitted files                       |
| `npm run build`                                            | Web app, backend, import/purge CLI and plugin bundles         |
| `npm start`                                                | Production Express serves dist/client                         |
| `npm run package:plugin`                                   | Installable dist/paloalto-live.plugin                         |
| `npm run package:release`                                  | Portable source and production-build ZIP (stage source first) |
| `npm run verify:production`                                | Compiled CLI and production server smoke test                 |
| `npm run simulate -- --participants 30`                    | Synthetic socket clients, votes, words and results            |
| `npm run test:e2e`                                         | Playwright full classroom flow and plugin bundle harness      |
| `npm run format`, `npm run format:check`                   | Prettier format/write or check                                |
| `npm run import:class -- input.csv data/codes.private.csv` | Private whitelist import                                      |
| `npm run purge -- --confirm --days 30`                     | Expired finished-session cleanup                              |

For browser tests install Chromium once with `npx playwright install chromium`. Tests start/reuse the local demo on 5173; stop unrelated services on 3000/5173 to avoid testing the wrong server. Tests modify demo data, never real whitelist data. Trace artifacts can contain synthetic demo auth information and are ignored. There are no tests that connect to external real accounts.

## Scene configuration

Edit `shared/scenes.json` or set `SCENES_PATH` to your JSON. Source changes are unnecessary. A valid scene is:

```json
{
  "id": "silence",
  "title": "On ne peut pas ne pas communiquer",
  "poll": {
    "question": "Yassine communique-t-il malgré son silence ?",
    "mode": "single",
    "options": [
      { "id": "oui", "label": "Oui" },
      { "id": "non", "label": "Non" },
      { "id": "depend", "label": "Ça dépend" }
    ]
  },
  "words": {
    "prompt": "Quels éléments vous ont fait penser qu'il communiquait ?",
    "options": [
      "Silence",
      "Regard",
      "Posture",
      "Distance",
      "Gestes",
      "Soupir",
      "Expression faciale"
    ],
    "maxSelections": 3,
    "allowCustom": false
  },
  "explanation": "Même sans paroles, notre comportement peut être interprété."
}
```

The root contains `title` and `scenes`. Scene IDs and option IDs must be unique, stable 1–40 character letters/digits/underscore/hyphen strings. There may be 1–100 scenes, 2–10 poll options, up to 24 predefined words of 32 characters, and at most 10 selected words. Question/title/prompt are at most 160 characters. `poll.mode="multiple"` enables several choices; percentages then measure participants choosing each option and may sum over 100%. Words are optional. `allowCustom=true` is supported, but predefined choices are recommended for a classroom projector and predictable moderation.

Projector and PNG clouds display the 24 most frequent words to maintain readability when custom text creates many distinct entries. All frequencies remain available in anonymous CSV export.

New sessions re-read and validate config; active sessions retain an immutable snapshot, so edits do not change an open poll. Finish the session and start another to use changed content. Invalid config rejects startup/start rather than sending a broken poll.

## Simulation

Start `npm run demo`, then:

```powershell
npm run simulate -- --participants 30
npm run simulate -- --participants 100 --hold 20
```

The script verifies the server is in demo mode, logs in as demo presenter, creates a session if needed, resets the current scene, opens voting, connects 1–100 distinct fake participants, submits answers and words, checks the count and presence, closes voting and publishes results. It holds connections for `--hold` seconds (default 5), then disconnects. `--url http://host:3000` changes the endpoint. Counters drop after simulated clients disconnect; saved votes remain.

## Plugin development

`npm run build` bundles the shared dashboard as local IIFEs suitable for the editor's embedded browser. Reinstall/reopen after changing source. The bridge's command callback runs in an isolated serialized scope: keep it self-contained and pass image/ratio through `Asc.scope`, never imported closures. The plugin harness executes the serialized function in a fresh mock Office context to detect accidental references. Native editor rehearsal remains separate from that mock.

## Formatting and repository hygiene

Prettier covers TS/TSX/JSON/CSS/Markdown; vendor SDK, private files, generated output and lockfile are excluded. ESLint rejects explicit `any` and unused variables. Git ignores secrets, private data, build bundles, traces and temporary work. Use `.gitattributes` for consistent LF source. Commit source, lockfile, SDK provenance and screenshots; regenerate compiled packages. Keep documentation aligned when changing the state machine or permission model.
