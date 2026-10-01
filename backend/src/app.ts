import express, { type Request, type Response, type NextFunction } from 'express';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import { Server } from 'socket.io';
import { z } from 'zod';
import { actions } from '../../shared/model.ts';
import { Store, AppError, type Identity } from './store.ts';
import { digestToken, hashPhone, opaqueToken, secureEqual } from './security.ts';
import type { Settings } from './settings.ts';

const joinSchema = z.object({
  sessionId: z.string().uuid(),
  phone: z.string().max(40),
  pin: z.string().min(1).max(64),
});
const voteSchema = z.object({
  sceneId: z.string().max(40),
  epoch: z.number().int().min(0),
  optionIds: z.array(z.string().max(40)).max(10),
  words: z.array(z.string().max(32)).max(10),
  requestId: z.string().uuid(),
});
const commandSchema = z.object({
  action: z.enum(actions),
  expectedVersion: z.number().int(),
  sceneId: z.string().max(40).optional(),
  confirm: z.boolean().optional(),
});
export function createApp(settings: Settings) {
  const store = new Store(settings);
  const app = express(),
    http = createServer(app);
  const admins = new Map<string, number>();
  const validOrigin = (origin: string | undefined) => !origin || settings.origins.includes(origin);
  const io = new Server(http, {
    cors: { origin: (origin, cb) => cb(null, validOrigin(origin)), methods: ['GET', 'POST'] },
    allowRequest: (req, cb) => cb(null, validOrigin(req.headers.origin)),
  });
  app.disable('x-powered-by');
  app.set('trust proxy', settings.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) =>
        cb(
          validOrigin(origin) ? null : new AppError(403, 'ORIGIN', 'Origine non autorisée.'),
          validOrigin(origin),
        ),
      allowedHeaders: ['Authorization', 'Content-Type'],
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  const loginLimit = rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: 'RATE_LIMIT', message: 'Trop de tentatives. Patientez une minute.' },
  });
  const accountLimit = rateLimit({
    windowMs: 60_000,
    limit: 8,
    keyGenerator: (req) => {
      try {
        return hashPhone(req.body?.phone || '', settings.phoneSecret);
      } catch {
        return digestToken('invalid-phone');
      }
    },
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      code: 'RATE_LIMIT',
      message: 'Trop de tentatives pour ce numéro. Patientez une minute.',
    },
  });
  const voteLimit = rateLimit({
    windowMs: 60_000,
    limit: 20,
    keyGenerator: (req) =>
      req.headers.authorization
        ? digestToken(req.headers.authorization)
        : ipKeyGenerator(req.ip || 'unknown'),
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { code: 'RATE_LIMIT', message: 'Veuillez patienter.' },
  });
  function identity(token: string): Identity | undefined {
    const exp = admins.get(digestToken(token));
    if (exp && exp > Date.now()) return { role: 'admin' };
    return store.identity(token);
  }
  function requireIdentity(req: Request, admin = false) {
    const id = identity(req.headers.authorization?.replace(/^Bearer /, '') || '');
    if (!id) throw new AppError(401, 'AUTH_REQUIRED', 'Reconnectez-vous à la session.');
    if (admin && id.role !== 'admin')
      throw new AppError(403, 'FORBIDDEN', 'Accès présentateur requis.');
    return id;
  }
  function connected(session?: string) {
    return new Set(
      [...io.sockets.sockets.values()]
        .map((s) => s.data.identity as Identity | undefined)
        .filter(
          (i): i is Extract<Identity, { role: 'participant' }> =>
            i?.role === 'participant' && i.sessionId === (session || store.session()?.id),
        )
        .map((i) => i.participantId),
    ).size;
  }
  function broadcast() {
    for (const socket of io.sockets.sockets.values()) {
      const id = socket.data.identity as Identity | undefined;
      if (id && !store.validateIdentity(id)) {
        socket.emit('revoked');
        socket.disconnect(true);
        continue;
      }
      socket.emit(
        'snapshot',
        store.snapshot(
          id,
          socket.data.sessionId,
          connected(id?.role === 'participant' ? id.sessionId : socket.data.sessionId),
        ),
      );
    }
  }
  io.use((socket, next) => {
    const auth = socket.handshake.auth as { token?: string; sessionId?: string; public?: boolean };
    const id = auth.token ? identity(auth.token) : undefined;
    if (!id && !(auth.public && auth.sessionId && store.session(auth.sessionId)))
      return next(new Error('AUTH_REQUIRED'));
    socket.data.identity = id;
    socket.data.sessionId = auth.sessionId;
    next();
  });
  io.on('connection', (socket) => {
    broadcast();
    socket.on('disconnect', () => broadcast());
  });
  // Full snapshots make reconnect independent of missed events. Revalidate long-lived sockets too.
  const heartbeat = setInterval(() => {
    for (const [hash, exp] of admins) if (exp < Date.now()) admins.delete(hash);
    for (const socket of io.sockets.sockets.values()) {
      const token = socket.handshake.auth.token as string | undefined;
      if (socket.data.identity?.role === 'admin' && (!token || !identity(token))) {
        socket.emit('revoked');
        socket.disconnect(true);
      }
    }
    broadcast();
  }, 15_000);
  heartbeat.unref();
  app.get('/api/health', (_req, res) => res.json({ ok: true, demo: settings.demo }));
  app.get('/api/public/state', (req, res) => {
    const sid = typeof req.query.session === 'string' ? req.query.session : undefined;
    if (sid && !store.session(sid)) throw new AppError(404, 'NO_SESSION', 'Session introuvable.');
    res.json(store.snapshot(undefined, sid, connected(sid)));
  });
  app.post('/api/admin/login', loginLimit, (req, res) => {
    const { key } = z.object({ key: z.string().max(200) }).parse(req.body);
    if (!secureEqual(key, settings.adminKey))
      throw new AppError(401, 'AUTH_REQUIRED', 'Clé incorrecte.');
    const token = opaqueToken();
    admins.set(digestToken(token), Date.now() + 12 * 60 * 60 * 1000);
    res.json({ token });
  });
  app.post('/api/admin/logout', (req, res) => {
    requireIdentity(req, true);
    admins.delete(digestToken(req.headers.authorization!.slice(7)));
    for (const socket of io.sockets.sockets.values())
      if (socket.handshake.auth.token === req.headers.authorization!.slice(7))
        socket.disconnect(true);
    res.json({ ok: true });
  });
  app.post('/api/join', loginLimit, accountLimit, (req, res) => {
    const v = joinSchema.parse(req.body),
      result = store.join(v.sessionId, v.phone, v.pin);
    broadcast(); // Rotated tokens revoke the old browser without exposing participant identifiers.
    res.json({ token: result.token });
  });
  app.get('/api/state', (req, res) => {
    const id = requireIdentity(req);
    res.json(
      store.snapshot(
        id,
        undefined,
        connected(id.role === 'participant' ? id.sessionId : undefined),
      ),
    );
  });
  app.post('/api/vote', voteLimit, (req, res) => {
    const id = requireIdentity(req);
    if (id.role !== 'participant')
      throw new AppError(403, 'FORBIDDEN', 'Accès participant requis.');
    res.json(store.vote(id, voteSchema.parse(req.body)));
    broadcast();
  });
  app.post('/api/admin/start', (req, res) => {
    requireIdentity(req, true);
    const id = store.start();
    broadcast();
    res.json({ session: id });
  });
  app.post('/api/admin/command', (req, res) => {
    requireIdentity(req, true);
    const v = commandSchema.parse(req.body),
      s = store.session();
    if (!s) throw new AppError(404, 'NO_SESSION', 'Démarrez une session.');
    if (['reset', 'finish'].includes(v.action) && !v.confirm)
      throw new AppError(400, 'CONFIRM_REQUIRED', 'Confirmation requise.');
    store.command(s.id, v.action, v.expectedVersion, v.sceneId);
    broadcast();
    res.json(store.snapshot({ role: 'admin' }, s.id, connected(s.id)));
  });
  app.get('/api/admin/export', (req, res) => {
    requireIdentity(req, true);
    const id = typeof req.query.session === 'string' ? req.query.session : store.session()?.id;
    if (!id) throw new AppError(404, 'NO_SESSION', 'Session introuvable.');
    res
      .type('text/csv')
      .set('Content-Disposition', 'attachment; filename="paloalto-results.csv"')
      .send(store.exportCsv(id));
  });
  app.delete('/api/admin/session/:id', (req, res) => {
    requireIdentity(req, true);
    if (req.body?.confirm !== true)
      throw new AppError(400, 'CONFIRM_REQUIRED', 'Confirmation requise.');
    store.deleteSession(String(req.params.id));
    broadcast();
    res.json({ ok: true });
  });
  const client = resolve('dist/client');
  if (existsSync(client)) {
    app.use(express.static(client));
    app.get(['/', '/presenter', '/display'], (_req, res) =>
      res.sendFile(resolve(client, 'index.html')),
    );
  }
  app.use('/api', (_req, res) =>
    res.status(404).json({ code: 'NOT_FOUND', message: 'Route introuvable.' }),
  );
  app.use((e: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (e instanceof AppError) {
      res.status(e.status).json({ code: e.code, message: e.message });
      return;
    }
    if (e instanceof z.ZodError || (e instanceof SyntaxError && 'body' in e)) {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'Données non valides.' });
      return;
    }
    // Never print request bodies, tokens or phone numbers.
    console.error('Backend operation failed:', e instanceof Error ? e.name : 'UnknownError');
    res.status(500).json({ code: 'SERVER_ERROR', message: 'Erreur serveur. Réessayez.' });
  });
  if (settings.demo) {
    store.seedDemo();
    if (!store.session()) store.start();
  }
  const close = async () => {
    clearInterval(heartbeat);
    await new Promise<void>((r) => io.close(() => r()));
    store.db.close();
  };
  return { app, http, io, store, close };
}
