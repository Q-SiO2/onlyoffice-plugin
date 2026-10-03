import { useCallback, useState } from 'react';
import QRCode from 'qrcode';
import { allowed, stateLabels, type Action } from '../../shared/model.ts';
import { request, downloadCsv, downloadPng } from './api.ts';
import { Brand, Confirm, Connection, Notice, QR, Results } from './components.tsx';
import { useLive } from './useLive.ts';
import { resultsPng } from './render-results.ts';
import { Button, Card, Input, Progress, SectionLabel } from './ui.tsx';
import {
  LayoutDashboard,
  Play,
  Users,
  BarChart3,
  QrCode,
  ArrowUpRight,
  Radio,
  LockKeyhole,
  CheckCircle2,
} from 'lucide-react';
import { LiveCount } from './LiveCount.tsx';
export type PluginBridge = {
  insert: (dataUrl: string) => Promise<void>;
  showWindow: (base: string, session: string, mode: 'qr' | 'results') => void;
};
const labels: Record<Action, string> = {
  activate: 'Démarrer la scène',
  open: 'Ouvrir le vote',
  close: 'Fermer le vote',
  results: 'Afficher les résultats',
  hide: 'Masquer les résultats',
  explain: 'Expliquer l’axiome',
  wait: 'Retour attente',
  next: 'Scène suivante',
  reset: 'Réinitialiser les réponses',
  finish: 'Terminer la session',
};
export function Presenter({ bridge }: { bridge?: PluginBridge }) {
  const [base, setBase] = useState(() =>
    bridge ? localStorage.getItem('paloalto:backend') || 'http://localhost:3000' : '',
  );
  const [address, setAddress] = useState(base),
    [key, setKey] = useState(''),
    [token, setToken] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [showQr, setShowQr] = useState(false);
  const [transparentAssets, setTransparentAssets] = useState(true);
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const revoke = useCallback(() => {
    setToken('');
    setError('Connexion présentateur expirée. Reconnectez-vous.');
  }, []);
  const { snapshot: s, connected, error: liveError } = useLive(base, token, undefined, revoke);
  async function operate(fn: () => Promise<unknown>, success = '') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Opération impossible.');
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    let url = address.trim().replace(/\/$/, '');
    if (bridge) {
      try {
        const u = new URL(url);
        if (!['http:', 'https:'].includes(u.protocol)) throw new Error();
        url = u.origin;
      } catch {
        setError('Saisissez une URL HTTP(S) valide.');
        return;
      }
    }
    await operate(async () => {
      const r = await request<{ token: string }>(url, '/api/admin/login', '', { key });
      setBase(url);
      localStorage.setItem('paloalto:backend', url);
      setToken(r.token);
      setKey('');
    });
  }
  const command = (action: Action, sceneId?: string) =>
    void operate(() =>
      request(base, '/api/admin/command', token, {
        action,
        sceneId,
        expectedVersion: s!.version,
        confirm: ['reset', 'finish'].includes(action),
      }),
    );
  function action(a: Action) {
    if (a === 'reset' || a === 'finish')
      setConfirm({
        message:
          a === 'reset'
            ? 'Supprimer les réponses de cette scène ? Les participants pourront voter à nouveau.'
            : 'Terminer la présentation ? Les participants ne pourront plus voter.',
        run: () => command(a),
      });
    else command(a);
  }
  async function insert(kind: 'poll' | 'words' | 'qr') {
    if (!s) return;
    await operate(
      async () => {
        const data =
          kind === 'qr'
            ? await QRCode.toDataURL(s.joinUrl, { width: 900, margin: 3 })
            : await resultsPng(
                s.results!,
                kind === 'poll' ? s.scene!.poll.question : s.scene!.words.prompt,
                kind,
                transparentAssets ? { transparent: true, chartOnly: true } : {},
              );
        if (bridge) await bridge.insert(data);
        else {
          downloadPng(data, `paloalto-${kind}.png`);
        }
      },
      bridge
        ? 'Image ajoutée à la diapositive. Vous pouvez la déplacer ou annuler avec Ctrl+Z.'
        : 'Image téléchargée.',
    );
  }
  return (
    <div
      className={`presenter-shell ${bridge ? 'plugin-shell' : ''} ${token ? 'has-session' : ''}`}
    >
      <header className="presenter-header">
        <Brand small />
        <span className="eyebrow">ESPACE PRÉSENTATEUR</span>
        {token && <Connection connected={connected} />}
      </header>
      {token && !bridge && (
        <aside className="presenter-sidebar" aria-label="Navigation du présentateur">
          <Brand />
          <div className="sidebar-label">VOTRE PRÉSENTATION</div>
          <nav>
            <a href="#dashboard" className="nav-active">
              <LayoutDashboard aria-hidden="true" /> Vue d’ensemble
            </a>
            <a href="#controls">
              <Play aria-hidden="true" /> Scènes & activités
            </a>
            <a href="#share">
              <Users aria-hidden="true" /> Inviter la classe
            </a>
            {s?.results && (
              <a href="#results">
                <BarChart3 aria-hidden="true" /> Résultats en direct
              </a>
            )}
          </nav>
          <div className="sidebar-note">
            <span className="sidebar-note-icon" aria-hidden="true">
              <QrCode />
            </span>
            <strong>Un seul QR code.</strong>
            <p>Les étudiants restent connectés à toutes les scènes.</p>
          </div>
          <div className="sidebar-bottom">
            École de Palo Alto
            <br />
            <span>Communication & interaction</span>
          </div>
        </aside>
      )}
      {!token ? (
        <main className="admin-login">
          <div className="login-kicker">
            <LockKeyhole aria-hidden="true" /> ESPACE PRIVÉ
          </div>
          <h1>
            La classe, en direct<span className="accent">.</span>
          </h1>
          <p className="lead">
            Pilotez les scènes, recueillez les regards et donnez du sens aux échanges.
          </p>
          <form onSubmit={login}>
            {bridge && (
              <>
                <label htmlFor="backend">Adresse du serveur</label>
                <Input
                  id="backend"
                  type="url"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </>
            )}
            <label htmlFor="admin-key">Clé présentateur</label>
            <Input
              id="admin-key"
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
            <Button className="primary full" disabled={busy}>
              {busy ? 'Connexion…' : 'Ouvrir le tableau de bord'} →
            </Button>
          </form>

          {error && <Notice error>{error}</Notice>}
        </main>
      ) : (
        <main className="dashboard" id="dashboard">
          <div className="dashboard-top">
            <div>
              <div className="eyebrow">COMMUNICATION & INTERACTION</div>
              <h1>{s?.title || 'Présentation Palo Alto'}</h1>
              <p className="muted">Un seul QR code. Toutes les activités.</p>
            </div>
            <Button
              className="secondary"
              onClick={() =>
                void operate(async () => {
                  await request(base, '/api/admin/logout', token, {});
                  setToken('');
                })
              }
            >
              Se déconnecter
            </Button>
          </div>
          {(error || liveError) && <Notice error>{error || liveError}</Notice>}
          {message && <Notice>{message}</Notice>}
          {s ? (
            <>
              <div className="stats-grid">
                <Card className="stat">
                  <span>
                    <Users aria-hidden="true" />
                    Participants connectés
                  </span>
                  <strong>
                    <LiveCount value={s.connected} />
                    <small> / {s.eligible}</small>
                  </strong>
                  <Progress
                    value={s.connected}
                    max={Math.max(1, s.eligible)}
                    aria-label="Participants connectés sur la liste autorisée"
                  />
                  <span className="fine">Appareils en direct</span>
                </Card>
                <Card className="stat">
                  <span>
                    <CheckCircle2 aria-hidden="true" />
                    Réponses à cette scène
                  </span>
                  <strong>
                    <LiveCount value={s.responseCount} />
                    <small> / {s.eligible}</small>
                  </strong>
                  <Progress
                    value={s.responseCount}
                    max={Math.max(1, s.eligible)}
                    aria-label="Réponses sur la liste autorisée"
                  />
                  <span className="fine">
                    {s.responseCount > s.connected
                      ? 'Certains répondants sont déconnectés'
                      : 'Participation de la classe'}
                  </span>
                </Card>
                <Card className="stat state-stat">
                  <span>
                    <Radio aria-hidden="true" />
                    État de la présentation
                  </span>
                  <strong
                    className={`state-label ${s.state === 'VOTING_OPEN' ? 'green' : s.state === 'VOTING_CLOSED' || s.state === 'FINISHED' ? 'red' : 'amber'}`}
                  >
                    {stateLabels[s.state]}
                  </strong>
                  <span className="fine">
                    {s.session ? `Session ${s.session.slice(0, 8)}` : 'Prêt à démarrer'}
                  </span>
                </Card>
              </div>
              <div className="control-grid">
                <Card as="section" className="control-card" id="controls">
                  <SectionLabel icon={<Play />}>CONDUITE DE LA SÉANCE</SectionLabel>
                  {s.scene ? (
                    <>
                      <span className="scene-number">
                        {String(s.sceneIndex + 1).padStart(2, '0')}
                      </span>
                      <h2>{s.scene.title}</h2>
                      <label htmlFor="scene">Scène à activer</label>
                      <select
                        id="scene"
                        value={s.scene.id}
                        disabled={busy || s.state === 'VOTING_OPEN' || s.state === 'FINISHED'}
                        onChange={(e) => command('activate', e.target.value)}
                      >
                        {s.scenes?.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <h2>Prêt pour la première scène ?</h2>
                  )}
                  {['IDLE', 'FINISHED'].includes(s.state) && (
                    <Button
                      className="primary full"
                      disabled={busy || !connected}
                      onClick={() =>
                        void operate(() => request(base, '/api/admin/start', token, {}))
                      }
                    >
                      Démarrer une session →
                    </Button>
                  )}
                  {s.state !== 'IDLE' && s.state !== 'FINISHED' && (
                    <>
                      <div className="action-grid">
                        {(
                          [
                            'activate',
                            'open',
                            'close',
                            'results',
                            'hide',
                            'explain',
                            'wait',
                            'next',
                          ] as Action[]
                        ).map((a) => (
                          <Button
                            className={a === 'open' || a === 'close' ? 'primary' : 'secondary'}
                            key={a}
                            disabled={
                              busy ||
                              !connected ||
                              !allowed[a].includes(s.state) ||
                              (a === 'next' && s.sceneIndex + 1 >= (s.scenes?.length || 0))
                            }
                            onClick={() => action(a)}
                          >
                            {labels[a]}
                            {a === 'next' ? ' →' : ''}
                          </Button>
                        ))}
                      </div>
                      <div className="destructive">
                        <Button disabled={busy || !connected} onClick={() => action('reset')}>
                          {labels.reset}
                        </Button>
                        <Button disabled={busy || !connected} onClick={() => action('finish')}>
                          {labels.finish}
                        </Button>
                      </div>
                    </>
                  )}
                  {s.state === 'FINISHED' && (
                    <Button
                      className="danger full"
                      onClick={() =>
                        setConfirm({
                          message:
                            'Supprimer toutes les données de cette session, y compris les votes ? Exportez les résultats avant de continuer.',
                          run: () =>
                            void operate(
                              () =>
                                request(
                                  base,
                                  `/api/admin/session/${s.session}`,
                                  token,
                                  { confirm: true },
                                  'DELETE',
                                ),
                              'Données de session supprimées.',
                            ),
                        })
                      }
                    >
                      Effacer cette session
                    </Button>
                  )}
                </Card>
                <Card as="section" className="control-card share-card" id="share">
                  <SectionLabel icon={<QrCode />}>PARTAGER & PROJETER</SectionLabel>
                  <h2>Invitez la classe</h2>
                  <p className="muted">
                    Les étudiants gardent la même page ouverte jusqu’à la fin.
                  </p>
                  <div className="button-stack">
                    <Button
                      className="secondary"
                      disabled={!s.session}
                      onClick={() => setShowQr(!showQr)}
                    >
                      {showQr ? 'Masquer le QR code' : 'Afficher le QR code'}
                    </Button>
                    {showQr && <QR url={s.joinUrl} />}
                    <Button
                      className="secondary"
                      disabled={!s.session || busy}
                      onClick={() => void insert('qr')}
                    >
                      {bridge ? 'Insérer le QR code dans la diapositive' : 'Télécharger le QR code'}
                    </Button>
                    {bridge ? (
                      <>
                        <Button
                          className="secondary"
                          disabled={!s.session}
                          onClick={() => bridge.showWindow(base, s.session!, 'qr')}
                        >
                          QR code en grande fenêtre
                        </Button>
                        <Button
                          className="secondary"
                          disabled={!s.session}
                          onClick={() => bridge.showWindow(base, s.session!, 'results')}
                        >
                          Résultats en grande fenêtre
                        </Button>
                      </>
                    ) : (
                      s.session && (
                        <a
                          className="button secondary"
                          href={`/display?session=${s.session}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ouvrir l’écran de projection <ArrowUpRight aria-hidden="true" />
                        </a>
                      )
                    )}
                    <Button
                      className="secondary"
                      disabled={!s.session || busy}
                      onClick={() =>
                        void operate(
                          () => downloadCsv(base, token, s.session!),
                          'Export anonyme téléchargé.',
                        )
                      }
                    >
                      Exporter les résultats CSV ↓
                    </Button>
                  </div>
                </Card>
              </div>
              {s.scene && s.results && (
                <>
                  <div className="results-heading" id="results">
                    <div>
                      <div className="eyebrow">APERÇU PRÉSENTATEUR · EN DIRECT</div>
                      <h2>Ce que voit la classe</h2>
                      <p className="fine muted">
                        {s.state === 'RESULTS'
                          ? 'Les résultats sont visibles sur l’écran de projection.'
                          : 'Aperçu privé. Fermez le vote puis affichez les résultats pour les projeter.'}
                      </p>
                    </div>
                    <div className="button-row">
                      <label className="asset-export-option">
                        <Input
                          type="checkbox"
                          checked={transparentAssets}
                          onChange={(e) => setTransparentAssets(e.target.checked)}
                        />
                        Graphiques transparents pour vos diapositives
                      </label>
                      <Button
                        disabled={busy}
                        onClick={() => void insert('poll')}
                        className="secondary"
                      >
                        {bridge ? 'Insérer le sondage' : 'Télécharger le sondage'}
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => void insert('words')}
                        className="secondary"
                      >
                        {bridge ? 'Insérer le nuage de mots' : 'Télécharger le nuage'}
                      </Button>
                    </div>
                  </div>
                  <Results
                    compact
                    results={s.results}
                    question={s.scene.poll.question}
                    wordPrompt={s.scene.words.prompt}
                  />
                </>
              )}
            </>
          ) : (
            <Notice>Chargement du tableau de bord…</Notice>
          )}
        </main>
      )}
      {confirm && (
        <Confirm
          message={confirm.message}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}
