# Design decisions and research

Reviewed official sources on **2026-10-01**. API availability is checked against current documentation; live validation coverage is separately recorded. Links are primary sources, not copied documentation blocks.

## 1. Node + SQLite + Socket.IO, one service

**Decision:** implement a local-first single-process service with persistent SQLite and role-specific Socket.IO snapshots. Serve the production frontend from Express.

**Reason:** works on the classroom LAN with no external account, SMS provider, cloud configuration or internet dependency after installation. One deployable service and one private DB make setup comprehensible. Database primary keys/transactions enforce unique voting. Fresh snapshots avoid trusting missed realtime-event recovery.

**Alternatives:** Supabase PostgreSQL/Realtime, Firebase Firestore, an external websocket service, serverless functions. Supabase is a strong hosted candidate but would require local CLI/Docker setup or a cloud project plus custom whitelist/code authentication and RLS. Firebase has convenient listeners but distinct rules/transaction and quota semantics. Both were researched rather than assumed.

**Current quota findings:** [Supabase official pricing](https://supabase.com/pricing) lists 500 MB free DB, 200 peak realtime connections, 2M monthly messages and pause after a week of inactivity; backups are not included on free. [Firestore official quotas](https://firebase.google.com/docs/firestore/quotas) list one free DB/project, 1 GiB storage, 50k daily reads and 20k writes/deletes; listener changes consume reads. These suit a small class but do not remove configuration, retention or authentication requirements. Quotas can change; verify before deploying a future adapter.

**Tradeoff:** this delivered stack requires a long-running host with persistent disk for cloud use; a classroom laptop is free. It does not horizontally scale, provide cloud failover or include a Supabase/Firebase adapter. [Node SQLite docs](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html), [Socket.IO reconnect/recovery docs](https://socket.io/docs/v4/connection-state-recovery/).

## 2. Individual access codes complement phones

**Decision:** phone whitelist + per-student random import code. Sessions use opaque expiring bearer tokens.

**Reason:** typing a classmate's phone would otherwise impersonate them. A private code adds a possession factor without paid SMS or WhatsApp assumptions. Auth happens once per presentation; localStorage resumes the phone session. Imported optional codes allow distributing codes before import.

**Tradeoff:** a private distribution step and one extra login field. This proves code possession, not legal phone ownership. Sharing the code remains possible. Codes and phone HMACs are server-only; raw import CSV is temporary private administrative material.

## 3. Modern right panel and local SDK

**Decision:** `type=panelRight`, Presentation Editor only, official SDK and PluginWindow, no DOM interaction with editor internals.

**Reason:** [current configuration](https://api.onlyoffice.com/docs/plugins/configuration/) deprecates legacy mode flags in favor of type; the sidebar provides a read-only graphic tray. Session/voting controls run on the browser dashboard for the presenter or co-presenter.

**Tradeoff:** plugin sidebar visibility during full-screen slideshow is an operational limit. A browser controller is the reliable backup. Minimum manifest version 9.3 for persistent graphic names; no unsupported version promises. SDK snapshot is bundled for LAN reliability and retains its original license.

## 4. Transparent linked slide graphics

**Decision:** render transparent bars/words to PNG and create a borderless rectangle using `GetCurrentSlide`, `CreateShape`, `CreateBlipFill`, `SetPosition`, `AddObject` and `Select` inside `callCommand`. Fit within 48% slide width/60% height. Unique names bind graphics to site origin/scene/kind; replace only their fill using `SetFill` when public state changes. Commands run in a queue to protect shared `Asc.scope`.

**Reason:** official [CreateBlipFill](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/Api/Methods/CreateBlipFill/) supports Base64 sources and [SetFill](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiShape/Methods/SetFill/) updates a shape's picture without replacing its geometry. The current picture is saved in the deck. [Command scope](https://api.onlyoffice.com/docs/plugins/interacting-with-editors/overview/how-to-call-commands/) prevents accidental imported closures.

**Tradeoff:** the plugin must remain open/connected. Active-scene assets update; other scenes retain their picture until activated again. Keep linked shapes ungrouped and names intact. PNG downloads/older images remain snapshots. Add the asset, then move/resize with native handles; direct external drag from the iframe to the canvas is not implemented. Native refresh during fullscreen still needs rehearsal.

## 5. Manual scenes and videos

**Decision:** manual activate/open/close controls; arbitrary JSON-configured scenes independent of slides.

**Reason:** the [official Presentation event list](https://api.onlyoffice.com/docs/plugins/interacting-with-editors/presentation-api/Events/) documents slideshow/slide events, but no reliable embedded-video end hook was found. Automatic voting based on unsupported internal events would compromise classroom reliability.

**Tradeoff:** presenter/co-presenter explicitly opens the vote after playback. Actual video control remains in ONLYOFFICE. No claim is made about undocumented internals or inability to control any presentation media through all future APIs.

## 6. Role-projected results and plain word layout

**Decision:** public projector receives aggregates only in RESULTS; admin preview can always see totals. Participant word choices are predefined by default. Frequency controls font size; flex rows/canvas bounding boxes keep words readable.

**Reason:** avoids premature reveal and accidental exposure of raw rows. No expensive random-position cloud library is needed. Poll percentages count respondents, supporting future multiple choice (already configurable).

**Tradeoff:** cloud layout is intentionally orderly, not an artistic rotated scatter. Custom words are optional, have strict length/count limits, and appear as text; there is no automated moderation service. Prefer predefined words in class.

Cloud displays and PNG exports show the 24 most frequent words when custom responses create more entries. The CSV retains every aggregate frequency; bounding the visible cloud keeps long labels and high-cardinality input within the projector canvas.

## 7. Explicit state versions, rounds and retries

**Decision:** server-authoritative state machine, optimistic command versions, per-scene reset epochs and vote request UUIDs.

**Reason:** stale dashboard clicks cannot overwrite state; delayed offline requests cannot contaminate a reset scene. Duplicate acknowledgement retries are successful but do not create a second response. SQLite transactions serialize validation and storage.

**Tradeoff:** a late unsaved offline vote is rejected after closing. The application cannot honestly guarantee offline votes arriving after the deadline. Socket presence counts live devices only and is not a class attendance ledger.

## 8. Official documentation differences found

ONLYOFFICE's modern networking guide describes `onlyoffice://plugin`; installed 9.3.1.8 serves local plugin HTML from `file://`, requiring opaque `Origin: null`. Both are supported through an explicit allowlist. `null` cannot be restricted uniquely to ONLYOFFICE and must rely on bearer authorization. See [network guide](https://api.onlyoffice.com/docs/ai/guides/custom-providers/) and live coverage.

Vercel's [June 2026 knowledge base](https://vercel.com/kb/guide/do-vercel-serverless-functions-support-websocket-connections) now describes WebSocket support, lifetime-bound to function duration with external state recommended. Its [older limits page](https://vercel.com/docs/limits) says WebSocket servers are unsupported. Favor the newer guidance; do not repeat the outdated categorical restriction. This particular SQLite single-process service is not adapted to that runtime regardless.

Render [free services](https://render.com/docs/free) have ephemeral filesystems and idle spin-down; [persistent disks](https://render.com/docs/disks) require a paid service. Local LAN is therefore the only supplied zero-cost durable deployment. No hosted free-tier durability is promised.

## 9. Hosted provider and UI refresh

The follow-up requirement is to host off the presentation laptop, using **free/trial only**. Railway is now selected for the existing single-process service and volume; see [RAILWAY.md](RAILWAY.md). Its Trial/Free credits and volume expiry are finite, so this updates the earlier LAN-only recommendation without promising permanent free uptime. Vercel's current [WebSocket documentation](https://vercel.com/docs/functions/websockets) confirms support but requires durable shared state across function instances; this SQLite/in-process implementation would need a persistence/presence redesign there.

Actual free Unlumen source primitives provide buttons, live badges, counters, result tabs/highlights and link copying. The exact plugin icon is shared across web, plugin and exported results; locally bundled fonts and aligned SVG icons replace decorative CSS graphics. See [UI_DESIGN.md](UI_DESIGN.md) for provenance and accessibility adaptations. No paid UI resource was used.
