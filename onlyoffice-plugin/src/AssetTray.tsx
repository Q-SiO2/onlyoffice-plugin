import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { BarChart3, MessageSquare, QrCode, ExternalLink } from 'lucide-react';
import { request } from '../../participant-app/src/api.ts';
import { resultsPng } from '../../participant-app/src/render-results.ts';
import { Brand, Connection, Notice } from '../../participant-app/src/components.tsx';
import { Button, Input } from '../../participant-app/src/ui.tsx';
import { useEditorAssets, type EditorConnection } from './useEditorAssets.ts';
import type { AssetBridge, ImageKind } from './asset-bridge.ts';

const defaultBase = 'https://paloalto-live-production.up.railway.app';
const storageKey = 'paloalto:editor:v2';
function saved(key: string) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function remember(key: string, value: string) {
  // Desktop hosts can deny storage; a working in-memory login must still load assets.
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* Stay signed in for this panel's lifetime. */
  }
}
type Rendered = { key: string; images: Record<ImageKind, string> };
function baseUrl(value: string) {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Adresse du serveur HTTP(S) non valide.');
  return url.origin;
}
function restored(): EditorConnection | undefined {
  try {
    const value = JSON.parse(saved(storageKey) || 'null');
    if (value?.token && typeof value.token === 'string')
      return { base: baseUrl(value.base), token: value.token };
  } catch {
    /* A corrupt saved connection returns to login. */
  }
}
export function AssetTray({ bridge }: { bridge: AssetBridge }) {
  const [connection, setConnection] = useState<EditorConnection | undefined>(restored);
  const [base, setBase] = useState(() => restored()?.base || defaultBase);
  const [email, setEmail] = useState(() => saved('paloalto:editor-email'));
  const [code, setCode] = useState('');
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [light, setLight] = useState(false),
    [selected, setSelected] = useState('');
  const [syncError, setSyncError] = useState(''),
    [updated, setUpdated] = useState(0);
  const [retry, setRetry] = useState(0);
  const [rendered, setRendered] = useState<Record<string, Rendered>>({});
  const cache = useRef<Record<string, Rendered>>({});
  const synced = useRef(new Map<string, string>());
  const revoke = useCallback(() => {
    remember(storageKey, '');
    setConnection(undefined);
    setRendered({});
    cache.current = {};
    synced.current.clear();
    setError('Session expirée. Reconnectez-vous avec votre e-mail et votre code.');
  }, []);
  const { assets, connected, error: liveError } = useEditorAssets(connection, revoke);
  const current = assets?.scenes.find((entry) => entry.scene.id === selected) || assets?.scenes[0];
  const sceneId = current?.scene.id;
  const imageKey = (entry: NonNullable<typeof current>) =>
    JSON.stringify({
      base: connection?.base,
      session: assets?.session,
      scene: entry.scene,
      epoch: entry.epoch,
      results: entry.results,
      joinUrl: assets?.joinUrl,
      light,
    });
  const expectedKey = current ? imageKey(current) : '';
  const images =
    sceneId && rendered[sceneId]?.key === expectedKey ? rendered[sceneId].images : undefined;
  async function login(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const nextBase = baseUrl(base);
      const { token } = await request<{ token: string }>(nextBase, '/api/presentations/login', '', {
        email: email.trim(),
        code: code.trim(),
      });
      const next = { base: nextBase, token };
      // Verify the complete asset feed before storing a successful connection.
      await request(nextBase, '/api/editor/assets', token);
      remember(storageKey, JSON.stringify(next));
      remember('paloalto:editor-email', email.trim());
      setCode('');
      setSelected('');
      setRendered({});
      cache.current = {};
      synced.current.clear();
      setConnection(next);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? 'Serveur inaccessible. Vérifiez la connexion et l’adresse du serveur.'
          : e instanceof Error
            ? e.message
            : 'Connexion impossible.',
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!assets || !connection) return;
    let alive = true;
    const render = async () => {
      const next: Record<string, Rendered> = {};
      const qr = await QRCode.toDataURL(assets.joinUrl, { width: 900, margin: 3 });
      for (const entry of assets.scenes) {
        if (!alive) return;
        const key = JSON.stringify({
          base: connection.base,
          session: assets.session,
          scene: entry.scene,
          epoch: entry.epoch,
          results: entry.results,
          joinUrl: assets.joinUrl,
          light,
        });
        const cached = cache.current[entry.scene.id];
        if (cached?.key === key) {
          next[entry.scene.id] = cached;
          continue;
        }
        const options = {
          transparent: true,
          chartOnly: true,
          textColor: light ? '#ffffff' : '#242744',
          crop: false,
        };
        const previewResults = entry.results.total
          ? entry.results
          : {
              ...entry.results,
              words: entry.scene.words.options.map((word) => ({ word, count: 0 })),
            };
        const [poll, words] = await Promise.all([
          resultsPng(previewResults, '', 'poll', {
            ...options,
            height: 115 + 130 * entry.scene.poll.options.length,
          }),
          resultsPng(previewResults, '', 'words', { ...options, height: 560 }),
        ]);
        next[entry.scene.id] = { key, images: { poll, words, qr } };
      }
      if (alive) {
        cache.current = next;
        setRendered(next);
      }
    };
    void render().catch((e) => {
      if (alive) setError(e instanceof Error ? e.message : 'Image indisponible.');
    });
    return () => {
      alive = false;
    };
  }, [assets, connection, light]);
  useEffect(() => {
    if (!connection || !assets) return;
    let alive = true;
    const sync = async () => {
      let total = 0;
      setSyncError('');
      for (const [id, entry] of Object.entries(rendered)) {
        if (!alive) return;
        const source = assets.scenes.find((item) => item.scene.id === id);
        if (
          !source ||
          entry.key !==
            JSON.stringify({
              base: connection.base,
              session: assets.session,
              scene: source.scene,
              epoch: source.epoch,
              results: source.results,
              joinUrl: assets.joinUrl,
              light,
            })
        )
          continue;
        const key = `${connection.base}:${assets.session}:${id}`;
        if (synced.current.get(key) === entry.key) continue;
        const count = await bridge.sync(entry.images, {
          base: connection.base,
          session: assets.session,
          sceneId: id,
        });
        if (!alive) return;
        synced.current.set(key, entry.key);
        total += count;
      }
      if (alive) setUpdated(total);
    };
    void sync().catch((e) => {
      if (alive) setSyncError(e instanceof Error ? e.message : 'Actualisation impossible.');
    });
    return () => {
      alive = false;
    };
  }, [bridge, connection, assets, rendered, retry, light]);
  async function insert(kind: ImageKind) {
    if (!images || !connection || !assets || !sceneId) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await bridge.insert(images[kind], kind, {
        base: connection.base,
        session: assets.session,
        sceneId,
      });
      setMessage(
        'Image sélectionnée sur la diapositive. Déplacez-la et redimensionnez-la avec ses poignées.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insertion impossible.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="asset-tray">
      <header className="asset-tray-header">
        <Brand small />
        <span className="asset-version">v1.2.1</span>
      </header>
      <main>
        <div className="eyebrow">VOS GRAPHIQUES SUR LA DIAPOSITIVE</div>
        <h1>Composez votre slide.</h1>
        <p className="muted">
          Choisissez une scène préparée, puis placez ses graphiques dans votre diapositive.
        </p>
        {!connection ? (
          <form onSubmit={(e) => void login(e)} className="asset-connect">
            <label htmlFor="asset-email">E-mail de l’organisateur</label>
            <Input
              id="asset-email"
              type="email"
              autoComplete="email"
              required
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <label htmlFor="asset-code">Code de présentation</label>
            <Input
              id="asset-code"
              type="password"
              autoComplete="off"
              required
              maxLength={64}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <details>
              <summary>Adresse du serveur</summary>
              <label htmlFor="asset-server">Serveur</label>
              <Input
                id="asset-server"
                type="url"
                required
                value={base}
                onChange={(e) => setBase(e.target.value)}
              />
            </details>
            <Button disabled={loading}>{loading ? 'Connexion…' : 'Se connecter'}</Button>
          </form>
        ) : (
          <>
            <Connection connected={connected} />
            <Button
              className="secondary"
              disabled={busy}
              onClick={() => {
                revoke();
                setError('');
                setSelected('');
              }}
            >
              Changer de présentation
            </Button>
          </>
        )}
        <a
          className="asset-admin-link"
          href={`${connection?.base || defaultBase}/presenter`}
          target="_blank"
          rel="noreferrer"
        >
          Gérer la séance sur le site <ExternalLink aria-hidden="true" />
        </a>
        {error || liveError || syncError ? (
          <Notice error>{error || liveError || syncError}</Notice>
        ) : null}
        {syncError && (
          <Button onClick={() => setRetry((n) => n + 1)}>Réessayer l’actualisation</Button>
        )}
        {message && <Notice>{message}</Notice>}
        {current && assets ? (
          <>
            <div className="asset-scene">
              <strong>{assets.title}</strong>
              <label htmlFor="asset-scene">Scène à placer</label>
              <select
                id="asset-scene"
                value={sceneId}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setMessage('');
                }}
              >
                {assets.scenes.map((entry, index) => (
                  <option key={entry.scene.id} value={entry.scene.id}>
                    {index + 1}. {entry.scene.title}
                  </option>
                ))}
              </select>
              <span>
                {current.results.total} réponse(s)
                {assets.state === 'VOTING_OPEN' && sceneId === assets.activeSceneId
                  ? ' · Vote en direct'
                  : ''}
              </span>
            </div>
            <label className="asset-theme">
              <Input type="checkbox" checked={light} onChange={(e) => setLight(e.target.checked)} />{' '}
              Texte blanc pour une diapositive sombre
            </label>
            {(['poll', 'words', 'qr'] as const).map((kind) => (
              <section className="asset-card" key={kind}>
                <h2>
                  {kind === 'poll' ? (
                    <BarChart3 />
                  ) : kind === 'words' ? (
                    <MessageSquare />
                  ) : (
                    <QrCode />
                  )}
                  {kind === 'poll' ? 'Sondage' : kind === 'words' ? 'Nuage de mots' : 'QR code'}
                </h2>
                {kind !== 'qr' && (
                  <p className="muted">
                    {kind === 'poll' ? current.scene.poll.question : current.scene.words.prompt}
                  </p>
                )}
                <div className={`asset-preview ${light && kind !== 'qr' ? 'dark' : ''}`}>
                  {images ? (
                    <img
                      src={images[kind]}
                      alt={
                        kind === 'qr'
                          ? 'QR de participation'
                          : `Aperçu ${kind === 'poll' ? 'du sondage' : 'du nuage de mots'}`
                      }
                    />
                  ) : (
                    <span>Préparation…</span>
                  )}
                </div>
                <Button disabled={busy || !images || !connected} onClick={() => void insert(kind)}>
                  Ajouter{' '}
                  {kind === 'poll'
                    ? 'le sondage'
                    : kind === 'words'
                      ? 'le nuage de mots'
                      : 'le QR code'}
                </Button>
              </section>
            ))}
            <p className="fine muted">
              Les sondages et nuages de toutes les scènes s’actualisent pendant les votes, même sur
              d’autres diapositives. Gardez le plugin ouvert, connecté et les graphiques non
              groupés. Vos positions et dimensions sont conservées.
            </p>
            {updated > 0 && (
              <p className="fine muted" role="status">
                {updated} graphique(s) actualisé(s).
              </p>
            )}
          </>
        ) : (
          connection && (
            <Notice>
              {assets
                ? 'Ajoutez et enregistrez vos scènes sur le site. Elles apparaîtront ici automatiquement.'
                : 'Chargement de vos scènes…'}
            </Notice>
          )
        )}
      </main>
    </div>
  );
}
