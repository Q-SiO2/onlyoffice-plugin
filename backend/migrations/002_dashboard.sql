DROP INDEX IF EXISTS one_active_presentation;
CREATE TABLE IF NOT EXISTS presentation_accounts (
 session_id TEXT PRIMARY KEY REFERENCES presentation_sessions(id) ON DELETE CASCADE,
 email TEXT NOT NULL, code_lookup TEXT NOT NULL UNIQUE, code_hash TEXT NOT NULL,
 code_sealed TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, vote_ends_at INTEGER
);
CREATE TABLE IF NOT EXISTS presentation_voters (
 session_id TEXT NOT NULL REFERENCES presentation_accounts(session_id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL REFERENCES authorized_participants(id),
 phone_sealed TEXT NOT NULL, name TEXT NOT NULL,
 PRIMARY KEY(session_id,participant_id)
);
CREATE TABLE IF NOT EXISTS presenter_tokens (
 token_hash TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES presentation_accounts(session_id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(2);
