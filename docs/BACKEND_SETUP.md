# Backend setup

The v1 backend is Node/Express/Socket.IO with SQLite. Supabase/Firebase are evaluated in [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) and are not runtime dependencies. There are no Supabase RLS policies to configure because no Supabase database is used. All data access goes through authenticated server code.

## Environment

Copy `.env.example` to `.env`. Never commit `.env`.

| Variable            | Meaning                                                                     |
| ------------------- | --------------------------------------------------------------------------- |
| `PORT`, `HOST`      | Node bind address; defaults 3000 / 0.0.0.0                                  |
| `DATABASE_PATH`     | Private SQLite file; production default data/paloalto.sqlite                |
| `SCENES_PATH`       | Config file read and validated when each session starts                     |
| `PUBLIC_URL`        | Participant web origin, e.g. https://live.example.edu                       |
| `ADMIN_KEY`         | Random presenter login key; 32+ characters                                  |
| `PHONE_HASH_SECRET` | Different random phone HMAC key; keep stable for the imported whitelist     |
| `ALLOWED_ORIGINS`   | Comma-separated exact origins, including editor origin                      |
| `DEMO_MODE`         | false for class use; demo launcher overrides with an isolated fake database |
| `TRUST_PROXY`       | Exact reverse proxy hop count; 0 direct, 1 behind Caddy/Render              |
| `RETENTION_DAYS`    | Default 30 days for expired finished-session purge                          |

Presenter login exchanges the key for a random 12-hour bearer token stored only in page memory. A backend restart requires presenter login again. Participant tokens are hashed in SQLite and valid for 12 hours; they survive a backend restart within that period. Back up the phone HMAC key separately: changing it makes the existing whitelist unmatchable until re-imported.

## Class import

CSV headers are `phone,name`; `name` and `pin` are optional. Export telephone cells as text, preserving leading zeros. Input supports `06`, `07`, `+2126`, `+2127`, `002126`, `002127`, with spaces, hyphens, dots and parentheses. Bare `212...`, landlines, foreign numbers, wrong lengths and letters are rejected.

```powershell
npm run import:class -- path/to/class.csv data/access-codes.private.csv
```

The script normalizes numbers, skips duplicate normalized rows, warns with row numbers, and imports valid rows in one transaction. It exits with status 2 when invalid rows were skipped; review the warnings before class. Existing participants are updated with the new code/name, not duplicated. A supplied code must contain 8–64 characters; otherwise it generates an individual random code. For a new import output, use a fresh file name: existing credential files are never overwritten.

The private credential CSV is written **before** database changes and contains raw normalized phones, optional names and codes. Give each student only their own code through your normal private class process. Do not put all codes on the projector or in a public group. This project sends no WhatsApp/email/SMS messages. Delete source/private output files when distribution and verification are complete. File modes are restrictive on POSIX; on Windows put them in a private user directory and protect it with normal filesystem access controls.

The whitelist is additive. To deactivate a student with database admin access, set `authorized_participants.active=0` for their HMAC; their token will fail validation and socket will be disconnected on the next snapshot. See [DATABASE.md](DATABASE.md). The UI intentionally exposes no class-list dump.

## Running

```powershell
npm run dev
# Backend alone:
npx tsx watch backend/src/index.ts
# Compiled full app:
npm run build
npm start
```

Always run from the repository root. The SQL migration is applied idempotently at startup. Verify `GET /api/health` returns `ok:true` and the correct `demo` flag. Production refuses missing, short, placeholder or identical secrets. Seed/simulation tools refuse production mode.
