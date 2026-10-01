import { useEffect, useRef, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';
import { BarChart3, MessageSquare, QrCode, ExternalLink } from 'lucide-react';
import { type Snapshot, type Aggregate } from '../../shared/model.ts';
import { request } from '../../participant-app/src/api.ts';
import { useLive } from '../../participant-app/src/useLive.ts';
import { resultsPng } from '../../participant-app/src/render-results.ts';
import { Brand, Connection, Notice } from '../../participant-app/src/components.tsx';
import { Button, Input } from '../../participant-app/src/ui.tsx';
import type { AssetBridge, ImageKind } from './asset-bridge.ts';

const defaultLink = 'https://paloalto-live-production.up.railway.app';
type ConnectionInfo = { base: string; session?: string };
function parseLink(value: string): ConnectionInfo {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new Error('Collez le lien HTTP(S) de votre présentation.');
  const session = url.searchParams.get('session') || undefined;
  if (session && !/^[a-f0-9-]{36}$/i.test(session)) throw new Error('Lien de session non valide.');
  return { base: url.origin, session };
}
export function AssetTray({ bridge }: { bridge: AssetBridge }) {
  const [link, setLink] = useState(
    () => localStorage.getItem('paloalto:asset-link') || defaultLink,
  );
  const [connection, setConnection] = useState<ConnectionInfo>();
  const [initial, setInitial] = useState<Snapshot>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [editingLink, setEditingLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [light, setLight] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [updated, setUpdated] = useState(0);
  const syncKey = useRef('');
  const [rendered, setRendered] = useState<{
    key: string;
    images: Partial<Record<ImageKind, string>>;
  }>({ key: '', images: {} });
  const {
    snapshot,
    connected,
    error: liveError,
  } = useLive(connection?.base || '', '', connection?.session || initial?.session || undefined);
  const current =
    snapshot &&
    initial &&
    snapshot.session === initial.session &&
    snapshot.version >= initial.version
      ? snapshot
      : initial;
  const imageKey = `${current?.session}:${current?.scene?.id}:${current?.version}:${current?.epoch}:${current?.state}:${light}`;
  const images = rendered.key === imageKey ? rendered.images : {};
  const base = connection?.base;
  const sceneId = current?.scene?.id;
  async function connect(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setInitial(undefined);
    setConnection(undefined);
    try {
      const next = parseLink(link);
      const state = await request<Snapshot>(
        next.base,
        '/api/public/state' + (next.session ? `?session=${encodeURIComponent(next.session)}` : ''),
      );
      localStorage.setItem('paloalto:asset-link', link.trim());
      setInitial(state);
      setConnection(next);
      setEditingLink(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!connection || connection.session) return;
    let alive = true;
    const refresh = () =>
      void request<Snapshot>(connection.base, '/api/public/state')
        .then((s) => {
          if (alive) setInitial(s);
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : 'Connexion impossible.');
        });
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [connection]);
  useEffect(() => {
    if (!current?.session || !current.scene) return;
    let alive = true;
    const scene = current.scene;
    const results: Aggregate = current.results || {
      total: 0,
      poll: scene.poll.options.map((o) => ({ ...o, count: 0, percentage: 0 })),
      words: scene.words.options.map((word) => ({ word, count: 0 })),
    };
    const options = {
      transparent: true,
      chartOnly: true,
      textColor: light ? '#ffffff' : '#242744',
      // Keep a stable aspect ratio when vote frequencies change. Website exports may be cropped.
      crop: false,
    };
    void Promise.all([
      resultsPng(results, '', 'poll', {
        ...options,
        height: 115 + 130 * scene.poll.options.length,
      }),
      resultsPng(results, '', 'words', { ...options, height: 560 }),
      QRCode.toDataURL(current.joinUrl, { width: 900, margin: 3 }),
    ])
      .then(([poll, words, qr]) => {
        if (alive) setRendered({ key: imageKey, images: { poll, words, qr } });
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Image indisponible.');
      });
    return () => {
      alive = false;
    };
  }, [current, light, imageKey]);
  useEffect(() => {
    if (!base || !sceneId || rendered.key !== imageKey) return;
    const ready = rendered.images;
    if (!ready.poll || !ready.words || !ready.qr) return;
    const key = `${base}:${imageKey}`;
    if (syncKey.current === key) return;
    syncKey.current = key;
    let alive = true;
    setSyncError('');
    void bridge
      .sync({ poll: ready.poll, words: ready.words, qr: ready.qr }, { base, sceneId })
      .then((count) => {
        if (alive) setUpdated(count);
      })
      .catch((e) => {
        if (syncKey.current === key) syncKey.current = '';
        if (alive) setSyncError(e instanceof Error ? e.message : 'Actualisation impossible.');
      });
    return () => {
      alive = false;
    };
  }, [bridge, base, sceneId, rendered, imageKey]);
  async function insert(kind: ImageKind) {
    if (!images[kind] || !connection || !current?.scene) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await bridge.insert(images[kind]!, kind, {
        base: connection.base,
        sceneId: current.scene.id,
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
        <span className="asset-version">v1.1.0</span>
      </header>
      <main>
        <div className="eyebrow">VOS GRAPHIQUES SUR LA DIAPOSITIVE</div>
        <h1>Composez votre slide.</h1>
        <p className="muted">
          Ajoutez un graphique, puis faites-le glisser et redimensionnez-le dans votre diapositive.
        </p>
        {connection && !editingLink ? (
          <Button className="secondary" onClick={() => setEditingLink(true)}>
            Changer le lien
          </Button>
        ) : (
          <form onSubmit={(e) => void connect(e)} className="asset-connect">
            <label htmlFor="asset-link">Lien de la présentation</label>
            <Input
              id="asset-link"
              type="url"
              required
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
            <Button disabled={loading}>{loading ? 'Connexion…' : 'Charger les graphiques'}</Button>
          </form>
        )}
        <a
          className="asset-admin-link"
          href={`${connection?.base || defaultLink}/presenter`}
          target="_blank"
          rel="noreferrer"
        >
          Gérer la séance sur le site <ExternalLink aria-hidden="true" />
        </a>
        {error || liveError || syncError ? (
          <Notice error>{error || liveError || syncError}</Notice>
        ) : null}
        {message ? <Notice>{message}</Notice> : null}
        {connection && <Connection connected={connected} />}
        {current?.scene ? (
          <>
            <div className="asset-scene">
              <span className="eyebrow">SCÈNE ACTIVE · {current.sceneIndex + 1}</span>
              <strong>{current.scene.title}</strong>
              <span>
                {current.results
                  ? 'Résultats publiés'
                  : 'Maquette · en attente des résultats publiés'}
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
                <div className={`asset-preview ${light && kind !== 'qr' ? 'dark' : ''}`}>
                  {images[kind] ? (
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
                <Button disabled={busy || !images[kind]} onClick={() => void insert(kind)}>
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
              Actualisation automatique tant que ce plugin reste ouvert et connecté. Vos positions
              et dimensions sont conservées. Chaque graphique suit sa scène sur le site. Gardez les
              graphiques non groupés pour conserver leur lien.
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
              Démarrez une session sur le site. Les graphiques apparaîtront ici automatiquement.
            </Notice>
          )
        )}
      </main>
    </div>
  );
}
