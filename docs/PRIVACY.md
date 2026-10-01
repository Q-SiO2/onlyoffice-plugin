# Privacy

Students see French anonymous interaction screens. Projected results and CSVs expose question labels, counts, percentages and word frequencies only. No phone number, internal participant ID, personal name or authentication token is displayed to the audience. Public session UUIDs identify the shared presentation, not individual participants.

## Data inventory

- Whitelist: keyed HMAC of normalized phone, salted personal-code hash, internal UUID, active flag, import time, optional deliberately imported name. Names are not used or displayed in this v1.
- Authentication: token hash, participant/session relationship, creation time and 12-hour expiry. Raw token lives only on the device; the presenter token lives in dashboard memory.
- Responses: chosen option IDs, selected words, scene/round reference, internal participant/session relationship, idempotency UUID and timestamp.
- Session data: immutable scene config, state/version and created/finished timestamps.
- Event log: presenter action/state/time, without participants or request bodies.
- Connection presence: distinct connected sockets in memory; not a historical attendance record.
- Private import output: raw phone/name/code for private distribution; not part of public APIs. Treat this file and the source CSV as sensitive.

This allows eligibility checks, duplicate prevention, session resumption and anonymous aggregation. Responses are pseudonymous internally rather than mathematically anonymous: an administrator with database access can link them to whitelist records. A plaintext imported name makes that link more identifiable. Small-group aggregates can also reveal individual choices by inference.

## Retention and deletion

Finished sessions older than `RETENTION_DAYS` (default 30) are purged at backend startup. For a continuously running server, run `npm run purge -- --confirm --days 30` periodically according to your institution's process. The tool deletes finished sessions only. A nontechnical presenter can finish and use **Effacer cette session** immediately, after exporting if needed. This deletes response/token/round/log rows for that session through cascades.

The whitelist remains until a DB administrator deletes or deactivates it; it has no automatic expiry. Expired authentication rows are retained as session relationships until that presentation is deleted. Private CSVs and exports have no automated deletion. Delete them after their purpose ends, and apply a separate retention rule to backups. See [DATABASE.md](DATABASE.md) for logical versus physical SQLite deletion and full private database removal.

Phones are never stored raw in SQLite. The HMAC key must remain private and stable; a plain unkeyed hash would be weak for phone numbers. Protect the OS account and disk: HMAC does not encrypt optional names or responses. Avoid adding web analytics or logging request bodies. Reverse proxies/hosts may retain IP access logs under their own policies; local application logs intentionally contain no phone inputs or tokens.

Explain before class that participation is limited to the approved list, results are displayed anonymously, and individual codes must stay private. Offer your institution's normal alternative participation method where appropriate. This implementation does not establish a legal compliance determination; the university controls real-class data collection and retention.
