PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS authorized_participants (
 id TEXT PRIMARY KEY, phone_hash TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL,
 name TEXT, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS presentation_sessions (
 id TEXT PRIMARY KEY, config TEXT NOT NULL CHECK(json_valid(config)), state TEXT NOT NULL CHECK(state IN ('WAITING','SCENE_ACTIVE','VOTING_OPEN','VOTING_CLOSED','RESULTS','EXPLANATION','FINISHED')),
 scene_index INTEGER NOT NULL DEFAULT 0 CHECK(scene_index >= 0), version INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, finished_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_presentation ON presentation_sessions ((1)) WHERE state != 'FINISHED';
CREATE TABLE IF NOT EXISTS scene_rounds (
 session_id TEXT NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE, scene_id TEXT NOT NULL, epoch INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(session_id, scene_id)
);
CREATE TABLE IF NOT EXISTS participant_sessions (
 session_id TEXT NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE,
 participant_id TEXT NOT NULL REFERENCES authorized_participants(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(session_id, participant_id)
);
CREATE TABLE IF NOT EXISTS responses (
 session_id TEXT NOT NULL, participant_id TEXT NOT NULL, scene_id TEXT NOT NULL, epoch INTEGER NOT NULL,
 option_ids TEXT NOT NULL CHECK(json_valid(option_ids)), words TEXT NOT NULL CHECK(json_valid(words)), request_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(session_id, participant_id, scene_id, epoch),
 FOREIGN KEY(session_id,participant_id) REFERENCES participant_sessions(session_id,participant_id) ON DELETE CASCADE,
 FOREIGN KEY(session_id,scene_id) REFERENCES scene_rounds(session_id,scene_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS responses_aggregation ON responses(session_id,scene_id,epoch);
CREATE INDEX IF NOT EXISTS tokens_expiry ON participant_sessions(expires_at);
CREATE TABLE IF NOT EXISTS event_log (
 id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES presentation_sessions(id) ON DELETE CASCADE,
 action TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO schema_migrations(version) VALUES(1);
