# Security model

This is a classroom tool with an explicit authorization boundary. A phone whitelist checks eligibility; **it does not prove phone ownership**. Real-class login therefore requires a random individual class code too. The code is issued privately at import, not via WhatsApp membership lookup. No bank-grade identity claim or SMS verification is made. A student who shares their number and code can deliberately lend their identity; this is outside the v1 identity guarantee.

## Permissions

| Role                   | Operations                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Public projector       | Current scene/status and public join URL; aggregates only in RESULTS                                          |
| Participant            | Authenticate, view current state and their own submitted status, submit one valid current-round answer        |
| Presenter              | Start/finish, scene/state changes, reset, read aggregates, export anonymous CSV, delete finished-session data |
| Local DB administrator | Import/deactivate/delete whitelist and manage retention/backups                                               |

Presenter key is environment-only. Login returns a cryptographically random bearer token, stored as a hash in an expiring in-memory map. Closing/reloading the dashboard requires login again. Participant session tokens are random, stored as SHA-256 in SQLite, and persist in that phone's localStorage for session recovery. Tokens never appear in query strings, QR codes, CSVs or public screens. An XSS or stolen unlocked phone can steal a localStorage token; keep the web origin trusted and use HTTPS. The app uses React text rendering, no untrusted HTML injection, security headers and CSP in production.

Phone comparisons use HMAC-SHA-256 with a secret server key, not a plain phone SHA-256 vulnerable to enumerating the small phone space. Codes use salted scrypt hashes. Database disclosure without the HMAC key does not directly reveal numbers; disclosure of both permits enumeration. Optional names remain plaintext and should be omitted if unnecessary. SQLite itself is not encrypted: protect the laptop/disk and backups.

Duplicate login with the correct personal code rotates the one participant-session token and revokes the old browser. Existing votes stay attached to the same internal participant. There is no bypass token for participants. One-response uniqueness is a DB constraint, with transactional state and option validation. Confirmed presenter resets explicitly allow another response and increment epoch to invalidate offline attempts. A lost acknowledgement retries the same UUID successfully, including after voting closes.

All HTTP mutations require server-side role checks. Client-disabled buttons are convenience only. Express validates body shape/size, membership, scene, epoch, count and configured options. SQL uses prepared bindings. CSV cell values are quoted and potentially formula-leading values escaped. Socket connections authenticate on handshake; stored participant tokens are revalidated at snapshots, and presenter expiry is checked every heartbeat. An invalid/rotated participant token is refused over HTTP and disconnected over Socket.IO.

Login has a shared-IP 300/minute limit to accommodate classroom NAT plus 8/minute per normalized phone hash; vote requests have a 20/minute bearer-token limit. Rate limits use in-process memory, not a distributed abuse service. Do not deploy many replicas or trust arbitrary forwarding headers. `TRUST_PROXY` must equal the real number of reverse-proxy hops; production public hosting should retain its upstream traffic protections. Login errors do not distinguish unknown phone from wrong code; an unknown number still incurs scrypt verification.

CORS allows configured exact origins, including `onlyoffice://plugin` and optional legacy `null`; WebSocket upgrades enforce the same list. CORS is not authorization and nonbrowser clients can omit Origin. `null` can be any opaque sandbox/file origin, not ONLYOFFICE alone. Keep it only if your desktop version needs it. No credentialed cookies are used. HTTPS is required for internet deployment; HTTP LAN demo sends credentials in cleartext to the local network.

## Secrets and demo separation

`.env`, SQLite, data/, work/, private credential CSVs, generated bundles and test traces are ignored. `.env.example` has placeholders only. Production refuses short, equal or placeholder secrets. `npm run demo` overrides DB and keys with **public fake credentials**; use it only for demonstration. Simulation and seed are disabled against production. Do not import real students into the demo database.

Code import updates do not revoke already-authenticated sessions on their own; changing a code is not an emergency logout feature. To revoke immediately, deactivate the participant or finish/delete the session. Whitelist administration is intentionally local and privileged. Hosting account creation, paid plans, domain changes and live student import were not performed during development.
