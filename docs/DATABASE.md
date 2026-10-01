# Database

SQLite file path is server-only. Node's built-in `node:sqlite` avoids a native npm addon; Node 24+ is required. WAL mode, foreign keys and a five-second busy timeout are enabled. Use a local persistent filesystem, not shared NFS. The one-process deployment model is intentional.

| Table                     | Purpose and constraints                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `authorized_participants` | UUID, unique phone HMAC, salted scrypt code hash, optional name, active flag, timestamp                                       |
| `presentation_sessions`   | Public UUID, immutable validated JSON scene/config snapshot, state, current scene index, state version, creation/finish times |
| `scene_rounds`            | Composite session+scene key, reset epoch; session foreign key with cascade                                                    |
| `participant_sessions`    | Composite session+participant key, unique token SHA-256, 12-hour expiry; whitelist and session foreign keys                   |
| `responses`               | Composite session+participant+scene+epoch primary key, choice IDs and words JSON, request UUID, timestamp                     |
| `event_log`               | Presenter action/state/timestamp, session foreign key; no phone, participant or token payloads                                |
| `schema_migrations`       | Applied migration version and timestamp                                                                                       |

`backend/migrations/001_initial.sql` is applied at startup and is idempotent. For future schema changes, add a numbered migration and update the startup migration runner; do not modify a deployed database ad hoc. Foreign keys on responses ensure a participant session and scene round exist. An index on response session/scene/epoch supports aggregation; token hashes and phone hashes are unique; expiry is indexed. A partial unique index allows only one unfinished presentation. State and JSON validity have SQL constraints; payload choices and bounds are enforced within the server transaction.

Scene and poll definitions are stored together as a validated immutable config snapshot rather than separate tiny tables. There is one poll per scene. Option IDs remain stable in that snapshot. Response choices/words are bounded JSON arrays; no arbitrary SQL string comes from input. This removes unnecessary joins while retaining relationship and uniqueness constraints. A reset deletes all current-scene responses and increments epoch in one transaction; the old round is not retained for analytics.

## Maintenance

Finish and delete a session through the presenter. Its responses, participant tokens, rounds and log cascade away. The class whitelist remains. CLI retention purge:

```powershell
npm run purge -- --confirm --days 30
```

Startup also purges finished sessions older than `RETENTION_DAYS`. Ongoing sessions are not automatically deleted. Backups have their own retention; database deletion does not erase backups or downloaded CSVs. SQLite deletion may leave free pages/WAL content until checkpoint and compaction. For a complete wipe, shut down the server, remove the intended private database and its `-wal`/`-shm` files, and handle backups/credential CSVs too. For selective physical cleanup, a DB administrator can checkpoint and VACUUM while offline. This is separate from logical deletion.

To empty the whitelist with a DB administration tool while the server is stopped: `DELETE FROM authorized_participants;` (cascades participant sessions and their responses). To deactivate one import, compute the phone HMAC using the unchanged secret and update `active=0` by that hash. No frontend endpoint exposes this privileged operation.

Backup SQLite using its backup API/tool, or stop the service before copying the file. Keep the phone HMAC secret with a separate protected backup. Restart after restoring and test authentication; presenter tokens in process memory are not backed up.
