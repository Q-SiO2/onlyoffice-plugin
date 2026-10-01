import { type ReactNode, useEffect, useState, useId } from 'react';
import { useReducedMotion } from 'motion/react';
import { BarChart3, MessageSquare, Link2 } from 'lucide-react';
import QRCode from 'qrcode';
import { type Aggregate } from '../../shared/model.ts';
import { fr } from './i18n.ts';
import { Button, Card } from './ui.tsx';
import logo from '../../onlyoffice-plugin/icon@2x.png';
import { GlowingBadge } from './vendor/glowing-badge.tsx';
import { CopyButton } from './vendor/copy.tsx';
import {
  Tabs,
  TabsList,
  TabsHighlight,
  TabsHighlightItem,
  TabsTrigger,
  TabsContent,
} from './vendor/tabs.tsx';
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <img className="brand-icon" src={logo} width={40} height={40} alt="" aria-hidden="true" />
      <div className="brand-name">
        Palo Alto <span className="brand-live">LIVE</span>
      </div>
    </div>
  );
}
export function Connection({ connected }: { connected: boolean }) {
  const reduce = useReducedMotion();
  return (
    <GlowingBadge
      className={`connection ${connected ? 'online' : 'offline'}`}
      role="status"
      variant={connected ? 'success' : 'warning'}
      pulse={connected && !reduce}
    >
      {connected ? fr.connected : fr.lost}
    </GlowingBadge>
  );
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return (
    <div className={`notice ${error ? 'error' : ''}`} role={error ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
export function Results({
  results,
  question,
  wordPrompt,
  compact = false,
}: {
  results: Aggregate;
  question: string;
  wordPrompt: string;
  compact?: boolean;
}) {
  const max = Math.max(1, ...results.words.map((w) => w.count));
  const id = useId();
  const reduce = useReducedMotion();
  const poll = (
    <Card as="section" className="result-card">
      <div className="eyebrow">LES RÉPONSES · {results.total} PARTICIPATIONS</div>
      <h2>{question}</h2>
      {!results.total && <p className="muted">Aucune réponse pour le moment.</p>}
      <div className="bars">
        {results.poll.map((p, i) => (
          <div className="bar-row" key={p.id}>
            <div className="bar-label">
              <strong>{p.label}</strong>
              <span>
                {p.count} <small>vote{p.count !== 1 ? 's' : ''}</small> · {p.percentage} %
              </span>
            </div>
            <div className="bar-track">
              <div className={`bar-fill color-${i % 3}`} style={{ width: `${p.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="muted fine">
        Pourcentage des répondants. En choix multiple, le total peut dépasser 100 %.
      </p>
    </Card>
  );
  const words = (
    <Card as="section" className="result-card">
      <div className="eyebrow">LES INDICES DE LA CLASSE</div>
      <h2>{wordPrompt}</h2>
      <div className="word-cloud" aria-label="Fréquence des mots">
        {results.words.length ? (
          results.words.slice(0, 24).map((w, i) => (
            <span
              className={`word color-text-${i % 3}`}
              key={w.word}
              style={{ fontSize: `${18 + 34 * Math.sqrt(w.count / max)}px` }}
            >
              {w.word}
              <sup>{w.count}</sup>
            </span>
          ))
        ) : (
          <p className="muted">Les mots apparaîtront ici.</p>
        )}
      </div>
      {results.words.length > 24 && (
        <p className="fine muted">
          24 mots les plus fréquents. Toutes les fréquences sont conservées dans l’export CSV.
        </p>
      )}
    </Card>
  );
  if (!compact)
    return (
      <div className="results">
        {poll}
        {words}
      </div>
    );
  return (
    <Tabs defaultValue="poll" className="result-tabs">
      <TabsList className="tabs-list" aria-label="Aperçu des résultats">
        <TabsHighlight
          className="tabs-indicator"
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 30 }}
        >
          <TabsHighlightItem value="poll">
            <TabsTrigger value="poll" id={`${id}-poll`} aria-controls={`${id}-poll-panel`}>
              <BarChart3 aria-hidden="true" />
              Sondage
            </TabsTrigger>
          </TabsHighlightItem>
          <TabsHighlightItem value="words">
            <TabsTrigger value="words" id={`${id}-words`} aria-controls={`${id}-words-panel`}>
              <MessageSquare aria-hidden="true" />
              Mots de la classe
            </TabsTrigger>
          </TabsHighlightItem>
        </TabsHighlight>
      </TabsList>
      <TabsContent value="poll" id={`${id}-poll-panel`} aria-labelledby={`${id}-poll`}>
        {poll}
      </TabsContent>
      <TabsContent value="words" id={`${id}-words-panel`} aria-labelledby={`${id}-words`}>
        {words}
      </TabsContent>
    </Tabs>
  );
}
export function QR({ url }: { url: string }) {
  const [src, setSrc] = useState('');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let alive = true;
    void QRCode.toDataURL(url, {
      width: 480,
      margin: 3,
      errorCorrectionLevel: 'M',
      color: { dark: '#242744', light: '#ffffff' },
    }).then((s) => {
      if (alive) setSrc(s);
    });
    return () => {
      alive = false;
    };
  }, [url]);
  return (
    <div className="qr-block">
      {src && <img src={src} alt="QR code pour rejoindre la présentation" />}
      <p>
        Scannez une fois.
        <br />
        <strong>Participez à chaque scène.</strong>
      </p>
      <div className="join-link-row">
        <Link2 aria-hidden="true" />
        <a href={url} target="_blank" rel="noreferrer" className="join-link">
          {url}
        </a>
        <CopyButton
          type="button"
          className="copy-link"
          content={url}
          variant="ghost"
          hoverScale={1}
          tapScale={1}
          aria-label={copied ? 'Lien copié' : 'Copier le lien de participation'}
          onCopiedChange={setCopied}
        />
      </div>
      <span className="sr-only" role="status">
        {copied ? 'Lien copié dans le presse-papiers.' : ''}
      </span>
    </div>
  );
}
export function Confirm({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 id="confirm-title">Confirmer l’action</h2>
        <p>{message}</p>
        <div className="button-row">
          <Button autoFocus onClick={onCancel} className="secondary">
            Annuler
          </Button>
          <Button onClick={onConfirm} className="danger">
            Confirmer
          </Button>
        </div>
      </section>
    </div>
  );
}
