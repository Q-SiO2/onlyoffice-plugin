import { type ReactNode, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { type Aggregate } from '../../shared/model.ts';
import { fr } from './i18n.ts';
export function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? 'small' : ''}`}>
      <span className="brand-mark" aria-hidden="true">
        p<span>•</span>
      </span>
      <div>
        Palo Alto<span className="brand-live">LIVE</span>
      </div>
    </div>
  );
}
export function Connection({ connected }: { connected: boolean }) {
  return (
    <span className={`connection ${connected ? 'online' : 'offline'}`} role="status">
      <span aria-hidden="true">●</span> {connected ? fr.connected : fr.lost}
    </span>
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
}: {
  results: Aggregate;
  question: string;
  wordPrompt: string;
}) {
  const max = Math.max(1, ...results.words.map((w) => w.count));
  return (
    <div className="results">
      <section className="result-card">
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
      </section>
      <section className="result-card">
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
      </section>
    </div>
  );
}
export function QR({ url }: { url: string }) {
  const [src, setSrc] = useState('');
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
      <a href={url} target="_blank" rel="noreferrer" className="join-link">
        {url}
      </a>
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
          <button autoFocus onClick={onCancel} className="secondary">
            Annuler
          </button>
          <button onClick={onConfirm} className="danger">
            Confirmer
          </button>
        </div>
      </section>
    </div>
  );
}
