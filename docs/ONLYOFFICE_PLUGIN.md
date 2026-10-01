# ONLYOFFICE Desktop Presentation plugin

Plugin **1.1.0** is a read-only asset tray. Session, scene and voting controls run on the website `/presenter`. No admin key or admin request is used inside the editor.

## Build and install

Run `npm run build` then `npm run package:plugin`. The archive `dist/paloalto-live.plugin` has `config.json` at its root. Open a presentation, choose **Plugins → Plugin Manager → My plugins → Install plugin manually**, select the archive, then open **Palo Alto Live**.

The manifest uses `panelRight`, `EditorsSupport: ["slide"]`, `initDataType: "none"`, local HTML and the stable GUID `asc.{A7E2C42A-3184-4E8B-9477-893BC54F8591}`. Minimum editor version is **9.3.0**, because persistent bindings use documented object names. This computer has 9.3.1.8.

The official Windows custom-plugin location is:

```text
%LOCALAPPDATA%\ONLYOFFICE\DesktopEditors\data\sdkjs-plugins\{A7E2C42A-3184-4E8B-9477-893BC54F8591}\
```

Close ONLYOFFICE normally before replacing this folder. Back up its contents first, replace only this custom GUID's files, and reopen. Website deployment does not update a locally installed plugin. On macOS use `~/Library/Application Support/asc.onlyoffice.ONLYOFFICE/data/sdkjs-plugins`; on Linux use `~/.local/share/onlyoffice/desktopeditors/sdkjs-plugins`. See [official installation](https://api.onlyoffice.com/docs/desktop-editors/usage-api/adding-plugins/).

## Use and layout

1. Start a session and activate a scene on the website.
2. Paste the public participation link or site address into the plugin and choose **Charger les graphiques**. The isolated demo uses `http://localhost:5173`.
3. Select your styled slide in edit mode. Choose **Ajouter** for the poll, word cloud or QR.
4. The added graphic is selected. Drag and resize it with native ONLYOFFICE handles. The initial graphic fits within 48% slide width/60% height, preserving aspect ratio.
5. Keep the plugin open and connected. Publishing, hiding or resetting updates that scene's placed graphics.

Charts are transparent PNGs without a branded frame or question heading; the slide owns the surrounding design. A white-text option supports dark slides. Each scene/type uses stable PNG dimensions as frequencies change, so replacement does not stretch the picture. Website downloads default to cropped transparent PNGs, with an optional full 1600×900 branded export.

Clicking **Ajouter** adds an independent asset; external drag directly from the iframe to the slide canvas is not implemented. Once added, positioning uses the editor's normal drag handles.

## Live bindings and preservation

`src/main.tsx` mounts `AssetTray` in `Asc.plugin.init`. `asset-bridge.ts` executes self-contained SDK functions using only `Api` and `Asc.scope`.

Insertion creates a borderless rectangle with `CreateShape`, `CreateBlipFill`, `SetName`, `SetPosition`, `AddObject` and `Select`. A unique persistent name records site origin, scene ID and asset kind. It contains no credentials or participant data.

Refresh scans `GetAllSlides` / `GetAllShapes` and calls only `SetFill(CreateBlipFill(...))` on matching graphics. Position, size, rotation, z-order and selection remain untouched. No slide/object is removed or reinserted.

Only the active scene's poll/word assets update; other scenes retain their last picture until activated again. QR graphics follow the connected session. Bindings can be reused across sessions on the same origin and scene IDs. A root site address follows the latest session; a link containing `session=` stays bound to that session.

Keep linked graphics **ungrouped** and their object names intact. The documented shape collection returns top-level shapes, so grouping/renaming prevents discovery. A closed/offline plugin leaves the last saved picture. Downloaded PNGs and graphics from older plugin versions remain snapshots; recreate those once using **Ajouter**. Save the deck normally to retain pictures and bindings.

SDK commands run serially to protect shared scope. An unconfirmed 15-second command blocks further commands until the panel is reopened; inspect the slide before repeating insertion. Native edit/fullscreen refresh has not been verified; rehearse on a deck copy and use the browser `/display` as the tested projection fallback.

## Scrolling, network and packaging

The viewport-height `#root` scrolls independently when the host locks document/body scrolling. Wheel and Ctrl+End are verified at 360 × 420 in the packaged file-origin harness.

Only the public link is saved in plugin localStorage. Fetch and Socket.IO connect directly to the selected origin; the demo's Vite proxy forwards them to port 3000. Public snapshots expose aggregates only in RESULTS. Use HTTPS for the hosted service.

Modern documentation describes `onlyoffice://plugin`; installed 9.3.1.8 previously loaded local plugin HTML from `file://` with opaque `Origin: null`. The explicit allowlist supports both. Opaque origins cannot uniquely identify ONLYOFFICE; admin mutations still require bearer authentication on the website. Do not disable browser security.

The SDK, Unlumen primitives, fonts and licenses are locally bundled. The legacy public `window.html` entry remains packaged for compatibility, but the asset tray does not open windows or mount the admin dashboard.

## Native verification boundary

The initial revision appeared and loaded in the native sidebar. The user stopped Computer Use before corrected native connection and actual insertion could be retested. Browser/API-contract tests cover this revision's public connection, transparency, scrolling, insertion and automatic refresh; they do not prove native slide behavior. See [VALIDATION.md](VALIDATION.md).

## Primary API references

- [Configuration](https://api.onlyoffice.com/docs/plugins/configuration/)
- [Command serialization and Asc.scope](https://api.onlyoffice.com/docs/plugins/interacting-with-editors/overview/how-to-call-commands/)
- [CreateShape](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/Api/Methods/CreateShape/)
- [CreateBlipFill](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/Api/Methods/CreateBlipFill/)
- [SetFill](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiShape/Methods/SetFill/)
- [SetName](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiShape/Methods/SetName/)
- [GetAllShapes](https://api.onlyoffice.com/docs/office-api/usage-api/presentation-api/ApiSlide/Methods/GetAllShapes/)
