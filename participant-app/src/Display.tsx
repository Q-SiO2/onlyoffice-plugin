import { Brand, Connection, QR, Results, Notice } from './components.tsx';
import { useLive } from './useLive.ts';
import { stateLabels } from '../../shared/model.ts';
export function Display({
  base = '',
  session,
  mode = 'results',
}: {
  base?: string;
  session: string;
  mode?: string;
}) {
  const { snapshot: s, connected, error } = useLive(base, '', session);
  return (
    <main className="display-shell">
      <header>
        <Brand />
        <Connection connected={connected} />
      </header>
      {error && <Notice error>{error}</Notice>}
      {s ? (
        <>
          {s.state === 'RESULTS' && s.results && s.scene && mode !== 'qr' ? (
            <>
              <div className="display-title">
                <div className="eyebrow">SCÈNE {s.sceneIndex + 1} · LE REGARD DE LA CLASSE</div>
                <h1>{s.scene.title}</h1>
              </div>
              <Results
                results={s.results}
                question={s.scene.poll.question}
                wordPrompt={s.scene.words.prompt}
              />
            </>
          ) : (
            <div className="display-wait">
              <div>
                <div className="eyebrow">
                  {s.state === 'WAITING' || mode === 'qr'
                    ? 'REJOIGNEZ LA PRÉSENTATION'
                    : stateLabels[s.state].toUpperCase()}
                </div>
                <h1>
                  {s.state === 'FINISHED'
                    ? 'Merci pour votre participation.'
                    : s.state === 'EXPLANATION'
                      ? s.scene?.title
                      : s.state === 'VOTING_OPEN'
                        ? 'À vous de jouer.'
                        : 'Chaque regard compte.'}
                </h1>
                <p className="lead">
                  {s.state === 'EXPLANATION'
                    ? s.scene?.explanation
                    : s.state === 'VOTING_OPEN'
                      ? 'Répondez depuis votre téléphone.'
                      : 'Scannez le QR code et gardez la page ouverte.'}
                </p>
                <span className="display-count">{s.connected} participants connectés</span>
              </div>
              {s.state !== 'FINISHED' && <QR url={s.joinUrl} />}
            </div>
          )}
        </>
      ) : (
        <Notice>Connexion à la présentation…</Notice>
      )}
      <footer>Palo Alto Live · Communication & interaction</footer>
    </main>
  );
}
