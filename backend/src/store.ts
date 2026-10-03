import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  aggregate,
  configSchema,
  transition,
  type Action,
  type Config,
  type Snapshot,
  type State,
  type Vote,
} from '../../shared/model.ts';
import {
  digestToken,
  hashPhone,
  hashPresentationCode,
  hashPin,
  opaqueToken,
  verifyPin,
  seal,
  unseal,
} from './security.ts';
import { normalizePhone } from '../../shared/phone.ts';
import type { Settings } from './settings.ts';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
type Session = { id: string; config: string; state: State; scene_index: number; version: number };
export type Identity =
  | { role: 'admin'; sessionId?: string }
  | { role: 'participant'; sessionId: string; participantId: string; tokenHash: string };
type ResponseRow = { option_ids: string; words: string; request_id: string };
export class Store {
  db: DatabaseSync;
  config: Config;
  constructor(public settings: Settings) {
    if (settings.dbPath !== ':memory:') mkdirSync(dirname(settings.dbPath), { recursive: true });
    this.db = new DatabaseSync(settings.dbPath);
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    this.db.exec(readFileSync(resolve('backend/migrations/001_initial.sql'), 'utf8'));
    this.db.exec(readFileSync(resolve('backend/migrations/002_dashboard.sql'), 'utf8'));
    this.config = configSchema.parse(JSON.parse(readFileSync(settings.scenesPath, 'utf8')));
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  session(id?: string): Session | undefined {
    return (
      id
        ? this.db.prepare('SELECT * FROM presentation_sessions WHERE id=?').get(id)
        : this.db
            .prepare(
              'SELECT * FROM presentation_sessions ORDER BY created_at DESC, rowid DESC LIMIT 1',
            )
            .get()
    ) as Session | undefined;
  }

  account(id: string) {
    return this.db.prepare('SELECT * FROM presentation_accounts WHERE session_id=?').get(id) as
      | {
          email: string;
          code_hash: string;
          code_sealed: string;
          revision: number;
          vote_ends_at: number | null;
        }
      | undefined;
  }
  codeLookup(code: string) {
    return hashPresentationCode(code, this.settings.phoneSecret);
  }
  presentationByCode(code: string) {
    return (
      this.db
        .prepare('SELECT session_id FROM presentation_accounts WHERE code_lookup=?')
        .get(this.codeLookup(code)) as { session_id: string } | undefined
    )?.session_id;
  }
  createPresentation(email: string, code: string, title: string) {
    if (this.presentationByCode(code))
      throw new AppError(409, 'CODE_USED', 'Ce code est déjà utilisé. Choisissez-en un autre.');
    return this.transaction(() => {
      const id = randomUUID(),
        config = { title, scenes: [] };
      this.db
        .prepare("INSERT INTO presentation_sessions(id,config,state) VALUES(?,?,'WAITING')")
        .run(id, JSON.stringify(config));
      this.db
        .prepare(
          'INSERT INTO presentation_accounts(session_id,email,code_lookup,code_hash,code_sealed) VALUES(?,?,?,?,?)',
        )
        .run(
          id,
          email.toLowerCase(),
          this.codeLookup(code),
          hashPin(code.trim()),
          seal(code.trim(), this.settings.phoneSecret),
        );
      return id;
    });
  }
  loginPresentation(email: string, code: string) {
    const id = this.presentationByCode(code),
      a = id ? this.account(id) : undefined;
    const valid = verifyPin(code.trim(), a?.code_hash || DUMMY_PIN_HASH);
    if (!id || !a || !valid || a.email !== email.toLowerCase())
      throw new AppError(401, 'AUTH_REQUIRED', 'E-mail ou code incorrect.');
    return this.presenterToken(id);
  }
  presenterToken(id: string) {
    const token = opaqueToken();
    this.db
      .prepare('INSERT INTO presenter_tokens VALUES(?,?,?)')
      .run(digestToken(token), id, Date.now() + 12 * 60 * 60 * 1000);
    return token;
  }
  dashboard(id: string) {
    const a = this.account(id),
      s = this.session(id);
    if (!a || !s) throw new AppError(404, 'NO_PRESENTATION', 'Présentation introuvable.');
    return {
      session: id,
      email: a.email,
      code: unseal(a.code_sealed, this.settings.phoneSecret),
      revision: a.revision,
      config: JSON.parse(s.config) as Config,
      editable:
        s.state === 'WAITING' &&
        !this.db.prepare('SELECT 1 FROM event_log WHERE session_id=?').get(id),
      voters: this.db
        .prepare(
          'SELECT participant_id,phone_sealed,name FROM presentation_voters WHERE session_id=? ORDER BY name,participant_id',
        )
        .all(id)
        .map((r) => ({
          id: String(r.participant_id),
          name: String(r.name),
          phone: unseal(String(r.phone_sealed), this.settings.phoneSecret),
        })),
    };
  }
  savePresentation(id: string, config: Config, revision: number) {
    const d = this.dashboard(id);
    if (!d.editable)
      throw new AppError(
        409,
        'PRESENTATION_STARTED',
        'Les questions sont verrouillées après le démarrage.',
      );
    if (d.revision !== revision)
      throw new AppError(409, 'STALE_DRAFT', 'Modifié ailleurs. Rechargez avant de sauvegarder.');
    config = configSchema.parse(config);
    this.transaction(() => {
      this.db.prepare('DELETE FROM scene_rounds WHERE session_id=?').run(id);
      this.db
        .prepare(
          'UPDATE presentation_sessions SET config=?,scene_index=0,version=version+1 WHERE id=?',
        )
        .run(JSON.stringify(config), id);
      for (const scene of config.scenes)
        this.db
          .prepare('INSERT INTO scene_rounds(session_id,scene_id) VALUES(?,?)')
          .run(id, scene.id);
      this.db
        .prepare('UPDATE presentation_accounts SET revision=revision+1 WHERE session_id=?')
        .run(id);
    });
    return this.dashboard(id);
  }
  addVoter(id: string, phone: string, name: string) {
    if (!this.account(id)) throw new AppError(404, 'NO_PRESENTATION', 'Présentation introuvable.');
    const normalized = normalizePhone(phone),
      hash = hashPhone(normalized, this.settings.phoneSecret);
    this.transaction(() => {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO authorized_participants(id,phone_hash,pin_hash) VALUES(?,?,?)',
        )
        .run(randomUUID(), hash, hashPin(opaqueToken()));
      const p = this.db
        .prepare('SELECT id FROM authorized_participants WHERE phone_hash=?')
        .get(hash)!;
      this.db
        .prepare(
          'INSERT INTO presentation_voters(session_id,participant_id,phone_sealed,name) VALUES(?,?,?,?) ON CONFLICT(session_id,participant_id) DO UPDATE SET name=excluded.name,phone_sealed=excluded.phone_sealed',
        )
        .run(id, p.id, seal(normalized, this.settings.phoneSecret), name);
    });
    return this.dashboard(id);
  }
  removeVoter(id: string, participant: string) {
    this.db
      .prepare(
        'UPDATE participant_sessions SET expires_at=0 WHERE session_id=? AND participant_id=?',
      )
      .run(id, participant);
    this.db
      .prepare('DELETE FROM presentation_voters WHERE session_id=? AND participant_id=?')
      .run(id, participant);
  }
  preview(id: string, sceneId: string) {
    const d = this.dashboard(id);
    if (!d.editable) throw new AppError(409, 'PRESENTATION_STARTED', 'Présentation déjà démarrée.');
    const index = d.config.scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) throw new AppError(400, 'NO_SCENE', 'Scène introuvable.');
    this.db
      .prepare('UPDATE presentation_sessions SET scene_index=?,version=version+1 WHERE id=?')
      .run(index, id);
  }
  tick() {
    const due = this.db
      .prepare('SELECT session_id FROM presentation_accounts WHERE vote_ends_at<=?')
      .all(Date.now());
    for (const row of due)
      this.transaction(() => {
        const id = String(row.session_id),
          s = this.session(id);
        if (s?.state === 'VOTING_OPEN') {
          this.db
            .prepare(
              "UPDATE presentation_sessions SET state='RESULTS',version=version+1 WHERE id=?",
            )
            .run(id);
          this.log(id, 'timer', 'RESULTS');
        }
        this.db
          .prepare('UPDATE presentation_accounts SET vote_ends_at=NULL WHERE session_id=?')
          .run(id);
      });
    return due.length > 0;
  }

  scene(s: Session) {
    return (JSON.parse(s.config) as Config).scenes[s.scene_index];
  }
  epoch(s: Session) {
    return (
      (
        this.db
          .prepare('SELECT epoch FROM scene_rounds WHERE session_id=? AND scene_id=?')
          .get(s.id, this.scene(s).id) as { epoch: number }
      )?.epoch || 0
    );
  }
  start() {
    if (this.db.prepare("SELECT id FROM presentation_sessions WHERE state != 'FINISHED'").get())
      throw new AppError(409, 'ACTIVE_SESSION', 'Une session est déjà ouverte.');
    // Re-read config only for new sessions; an existing session keeps its immutable scene snapshot.
    this.config = configSchema.parse(JSON.parse(readFileSync(this.settings.scenesPath, 'utf8')));
    return this.transaction(() => {
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO presentation_sessions(id,config,state) VALUES(?,?,'WAITING')")
        .run(id, JSON.stringify(this.config));
      for (const scene of this.config.scenes)
        this.db
          .prepare('INSERT INTO scene_rounds(session_id,scene_id) VALUES(?,?)')
          .run(id, scene.id);
      this.log(id, 'start', 'WAITING');
      return id;
    });
  }
  log(session: string, action: string, state: State) {
    this.db
      .prepare('INSERT INTO event_log(session_id,action,state) VALUES(?,?,?)')
      .run(session, action, state);
  }
  command(id: string, action: Action, expectedVersion: number, sceneId?: string) {
    return this.transaction(() => {
      const s = this.session(id);
      if (!s) throw new AppError(404, 'NO_SESSION', 'Session introuvable.');
      if (s.version !== expectedVersion)
        throw new AppError(409, 'STALE_STATE', 'État modifié par un autre contrôle. Réessayez.');
      let target: State;
      try {
        target = transition(s.state, action);
      } catch {
        throw new AppError(
          409,
          'INVALID_TRANSITION',
          'Fermez le vote avant de changer de scène ou de mode.',
        );
      }
      let index = s.scene_index;
      const config = JSON.parse(s.config) as Config;
      if (action === 'next') index++;
      if (action === 'activate' && sceneId)
        index = config.scenes.findIndex((c) => c.id === sceneId);
      if (index < 0 || index >= config.scenes.length)
        throw new AppError(409, 'NO_SCENE', 'Aucune autre scène.');
      if (action === 'reset') {
        this.db
          .prepare('DELETE FROM responses WHERE session_id=? AND scene_id=?')
          .run(id, this.scene(s).id);
        this.db
          .prepare('UPDATE scene_rounds SET epoch=epoch+1 WHERE session_id=? AND scene_id=?')
          .run(id, this.scene(s).id);
      }
      this.db
        .prepare(
          "UPDATE presentation_sessions SET state=?,scene_index=?,version=version+1,finished_at=CASE WHEN ?='FINISHED' THEN CURRENT_TIMESTAMP ELSE finished_at END WHERE id=?",
        )
        .run(target, index, target, id);
      const seconds = config.scenes[index].voteSeconds;
      this.db
        .prepare('UPDATE presentation_accounts SET vote_ends_at=? WHERE session_id=?')
        .run(target === 'VOTING_OPEN' && seconds > 0 ? Date.now() + seconds * 1000 : null, id);
      this.log(id, action, target);
    });
  }
  upsertParticipant(phone: string, pin: string, name?: string) {
    const hash = hashPhone(phone, this.settings.phoneSecret);
    this.db
      .prepare(
        'INSERT INTO authorized_participants(id,phone_hash,pin_hash,name) VALUES(?,?,?,?) ON CONFLICT(phone_hash) DO UPDATE SET pin_hash=excluded.pin_hash,name=excluded.name,active=1',
      )
      .run(randomUUID(), hash, hashPin(pin), name || null);
  }
  seedDemo(count = 100) {
    if (!this.settings.demo) throw new Error('Demo seeding is disabled.');
    this.transaction(() => {
      for (let i = 1; i <= count; i++) {
        const phone = '061' + String(i).padStart(7, '0');
        if (
          !this.db
            .prepare('SELECT id FROM authorized_participants WHERE phone_hash=?')
            .get(hashPhone(phone, this.settings.phoneSecret))
        )
          this.upsertParticipant(phone, 'demo1234');
      }
    });
  }
  join(sessionId: string, phone: string, pin: string) {
    const s = this.session(sessionId);
    if (!s || s.state === 'FINISHED')
      throw new AppError(409, 'NO_ACTIVE_SESSION', 'Cette session est terminée ou indisponible.');
    let p: { id: string; pin_hash: string } | undefined;
    try {
      p = this.db
        .prepare('SELECT id,pin_hash FROM authorized_participants WHERE phone_hash=? AND active=1')
        .get(hashPhone(phone, this.settings.phoneSecret)) as typeof p;
    } catch {
      /* Generic authorization error avoids disclosing membership. */
    }
    // Run the same expensive verifier for unrecognized numbers to reduce timing leakage.
    const managed = this.account(sessionId);
    const valid = verifyPin(pin, managed?.code_hash || p?.pin_hash || DUMMY_PIN_HASH);
    if (
      managed &&
      p &&
      !this.db
        .prepare('SELECT 1 FROM presentation_voters WHERE session_id=? AND participant_id=?')
        .get(sessionId, p.id)
    )
      p = undefined;
    if (!p || !valid)
      throw new AppError(401, 'NOT_AUTHORIZED', 'Numéro non reconnu ou code incorrect.');
    const token = opaqueToken();
    this.db
      .prepare(
        'INSERT INTO participant_sessions(session_id,participant_id,token_hash,expires_at) VALUES(?,?,?,?) ON CONFLICT(session_id,participant_id) DO UPDATE SET token_hash=excluded.token_hash,expires_at=excluded.expires_at',
      )
      .run(sessionId, p.id, digestToken(token), Date.now() + 12 * 60 * 60 * 1000);
    return { token, participantId: p.id };
  }
  identity(token: string): Identity | undefined {
    const presenter = this.db
      .prepare('SELECT session_id FROM presenter_tokens WHERE token_hash=? AND expires_at>?')
      .get(digestToken(token), Date.now()) as { session_id: string } | undefined;
    if (presenter) return { role: 'admin', sessionId: presenter.session_id };
    if (!token || token.length > 200) return;
    const hash = digestToken(token);
    const row = this.db
      .prepare(
        'SELECT ps.session_id,ps.participant_id FROM participant_sessions ps JOIN authorized_participants p ON p.id=ps.participant_id WHERE ps.token_hash=? AND ps.expires_at>? AND p.active=1 AND (NOT EXISTS(SELECT 1 FROM presentation_accounts a WHERE a.session_id=ps.session_id) OR EXISTS(SELECT 1 FROM presentation_voters v WHERE v.session_id=ps.session_id AND v.participant_id=ps.participant_id))',
      )
      .get(hash, Date.now()) as { session_id: string; participant_id: string } | undefined;
    return (
      row && {
        role: 'participant',
        sessionId: row.session_id,
        participantId: row.participant_id,
        tokenHash: hash,
      }
    );
  }
  validateIdentity(identity: Identity) {
    if (identity.role === 'admin') return true;
    return !!this.db
      .prepare(
        'SELECT 1 FROM participant_sessions ps JOIN authorized_participants p ON p.id=ps.participant_id WHERE token_hash=? AND expires_at>? AND p.active=1 AND (NOT EXISTS(SELECT 1 FROM presentation_accounts a WHERE a.session_id=ps.session_id) OR EXISTS(SELECT 1 FROM presentation_voters v WHERE v.session_id=ps.session_id AND v.participant_id=ps.participant_id))',
      )
      .get(identity.tokenHash, Date.now());
  }
  votes(s: Session, sceneId = this.scene(s).id) {
    return (
      this.db
        .prepare(
          'SELECT option_ids,words,request_id FROM responses WHERE session_id=? AND scene_id=?',
        )
        .all(s.id, sceneId) as ResponseRow[]
    ).map((r) => ({
      optionIds: JSON.parse(r.option_ids) as string[],
      words: JSON.parse(r.words) as string[],
      requestId: r.request_id,
    }));
  }
  vote(identity: Extract<Identity, { role: 'participant' }>, vote: Vote) {
    return this.transaction(() => {
      const s = this.session(identity.sessionId);
      if (!s) throw new AppError(404, 'NO_SESSION', 'Session introuvable.');
      const scene = this.scene(s);
      if (vote.sceneId !== scene.id || vote.epoch !== this.epoch(s))
        throw new AppError(
          409,
          'STALE_VOTE',
          'Cette activité a changé. Votre réponse n’a pas été envoyée.',
        );
      const prior = this.db
        .prepare(
          'SELECT request_id FROM responses WHERE session_id=? AND participant_id=? AND scene_id=? AND epoch=?',
        )
        .get(s.id, identity.participantId, scene.id, vote.epoch) as
        { request_id: string } | undefined;
      // A lost HTTP acknowledgement can be retried even after closing the vote.
      if (prior?.request_id === vote.requestId) return { accepted: true, alreadyAccepted: true };
      if (prior) throw new AppError(409, 'ALREADY_VOTED', 'Votre réponse a déjà été enregistrée.');
      if (s.state !== 'VOTING_OPEN' || (this.account(s.id)?.vote_ends_at || Infinity) <= Date.now())
        throw new AppError(409, 'VOTE_CLOSED', 'Le vote est terminé.');
      const ids = new Set(vote.optionIds);
      const words = new Set(vote.words);
      if (
        !ids.size ||
        ids.size !== vote.optionIds.length ||
        (scene.poll.mode === 'single' && ids.size !== 1) ||
        [...ids].some((id) => !scene.poll.options.some((o) => o.id === id))
      )
        throw new AppError(400, 'INVALID_OPTIONS', 'Choisissez une réponse valide.');
      if (
        words.size !== vote.words.length ||
        words.size > scene.words.maxSelections ||
        [...words].some(
          (w) =>
            w.trim() !== w ||
            !w ||
            w.length > 32 ||
            (!scene.words.allowCustom && !scene.words.options.includes(w)),
        )
      )
        throw new AppError(400, 'INVALID_WORDS', 'Sélection de mots non valide.');
      this.db
        .prepare(
          'INSERT INTO responses(session_id,participant_id,scene_id,epoch,option_ids,words,request_id) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          s.id,
          identity.participantId,
          scene.id,
          vote.epoch,
          JSON.stringify([...ids]),
          JSON.stringify([...words]),
          vote.requestId,
        );
      return { accepted: true, alreadyAccepted: false };
    });
  }
  snapshot(identity?: Identity, sessionId?: string, connected = 0): Snapshot {
    const s = this.session(identity?.sessionId || sessionId);
    const title = s ? (JSON.parse(s.config) as Config).title : this.config.title;
    const joinUrl = s ? `${this.settings.publicUrl}/?session=${s.id}` : this.settings.publicUrl;
    if (!s || !(JSON.parse(s.config) as Config).scenes.length)
      return {
        session: s?.id || null,
        title,
        state: 'IDLE',
        version: 0,
        sceneIndex: 0,
        epoch: 0,
        scene: null,
        connected: 0,
        eligible: 0,
        responseCount: 0,
        joinUrl,
        demo: this.settings.demo,
        managed: !!(s && this.account(s.id)),
      };
    const scene = this.scene(s),
      votes = this.votes(s),
      config = JSON.parse(s.config) as Config;
    const presenter = identity?.role === 'admin';
    const managed = this.account(s.id);
    const data: Snapshot = {
      session: s.id,
      title,
      state: s.state,
      version: s.version,
      sceneIndex: s.scene_index,
      epoch: this.epoch(s),
      scene: managed && !presenter ? { ...scene, explanation: '' } : scene,
      connected,
      eligible:
        presenter && managed
          ? (
              this.db
                .prepare('SELECT COUNT(*) AS n FROM presentation_voters WHERE session_id=?')
                .get(s.id) as { n: number }
            ).n
          : presenter
            ? (
                this.db
                  .prepare('SELECT COUNT(*) AS n FROM authorized_participants WHERE active=1')
                  .get() as { n: number }
              ).n
            : 0,
      responseCount: presenter || s.state === 'RESULTS' ? votes.length : 0,
      joinUrl,
      demo: this.settings.demo,
      managed: !!managed,
      voteEndsAt: managed?.vote_ends_at || null,
    };
    if (presenter) data.scenes = config.scenes.map(({ id, title }) => ({ id, title }));
    if (presenter || s.state === 'RESULTS') data.results = aggregate(scene, votes);
    if (identity?.role === 'participant')
      data.submitted = !!this.db
        .prepare(
          'SELECT 1 FROM responses WHERE session_id=? AND participant_id=? AND scene_id=? AND epoch=?',
        )
        .get(s.id, identity.participantId, scene.id, data.epoch);
    return data;
  }
  exportCsv(sessionId: string) {
    const s = this.session(sessionId);
    if (!s) throw new AppError(404, 'NO_SESSION', 'Session introuvable.');
    const esc = (v: string | number) =>
      '"' +
      String(v)
        .replace(/"/g, '""')
        .replace(/^[=+@-]/, "'$&") +
      '"';
    const rows: (string | number)[][] = [
      ['type', 'scene', 'question', 'option_or_word', 'count', 'percentage', 'total_responses'],
    ];
    for (const scene of (JSON.parse(s.config) as Config).scenes) {
      const a = aggregate(scene, this.votes(s, scene.id));
      a.poll.forEach((p) =>
        rows.push([
          'poll',
          scene.title,
          scene.poll.question,
          p.label,
          p.count,
          p.percentage,
          a.total,
        ]),
      );
      a.words.forEach((w) =>
        rows.push(['word', scene.title, scene.words.prompt, w.word, w.count, '', a.total]),
      );
    }
    return '\uFEFF' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
  }
  deleteSession(id: string) {
    const s = this.session(id);
    if (s?.state !== 'FINISHED')
      throw new AppError(
        409,
        'SESSION_ACTIVE',
        'Terminez la session avant de supprimer ses données.',
      );
    this.db.prepare('DELETE FROM presentation_sessions WHERE id=?').run(id);
  }
  purge(days: number) {
    if (!Number.isFinite(days) || days < 0) throw new Error('Invalid retention days.');
    return this.db
      .prepare(
        "DELETE FROM presentation_sessions WHERE state='FINISHED' AND finished_at < datetime('now',?)",
      )
      .run(`-${Math.floor(days)} days`).changes;
  }
}
const DUMMY_PIN_HASH = hashPin('invalid-unrecognized-code');
