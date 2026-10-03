import { useCallback, useEffect, useState } from 'react';
import { type Snapshot, type Vote } from '../../shared/model.ts';
import { request, ApiError } from './api.ts';
import { Brand, Connection, Notice } from './components.tsx';
import { useLive } from './useLive.ts';
import { fr } from './i18n.ts';
import { Button, Card, Input } from './ui.tsx';
import { ArrowRight, Check, Clock3, Radio, ShieldCheck } from 'lucide-react';

export function Participant() {
  const querySession = new URLSearchParams(location.search).get('session') || '';
  const [session, setSession] = useState(querySession);
  const [token, setToken] = useState(() =>
    session ? localStorage.getItem(`paloalto:${session}`) || '' : '',
  );
  const [publicState, setPublicState] = useState<Snapshot>();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState(''),
    [pin, setPin] = useState('');
  const revoke = useCallback(() => {
    localStorage.removeItem(`paloalto:${session}`);
    setToken('');
    setError('Connexion remplacée ou expirée. Entrez à nouveau votre code.');
  }, [session]);
  const live = useLive('', token, token ? undefined : session || undefined, revoke);
  useEffect(() => {
    if (querySession) return;
    let alive = true;
    const load = () =>
      request<Snapshot>('', '/api/public/state')
        .then((s) => {
          if (!alive) return;
          setPublicState(s);
          if (s.session) {
            setSession(s.session);
            setToken(localStorage.getItem(`paloalto:${s.session}`) || '');
          }
        })
        .catch(() => {
          if (alive) setError('Serveur indisponible. Reconnexion…');
        });
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [querySession]);
  const s =
    live.snapshot?.session === session
      ? live.snapshot
      : publicState?.session === session
        ? publicState
        : undefined;
  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!session && !pin) return;
    setBusy(true);
    setError('');
    try {
      const r = await request<{ token: string; session?: string }>(
        '',
        !querySession || !session || s?.managed ? '/api/presentations/join' : '/api/join',
        '',
        {
          sessionId: session || undefined,
          phone,
          pin,
          code: pin,
        },
      );
      const joined = r.session || session;
      setSession(joined);
      history.replaceState(null, '', `/?session=${joined}`);
      localStorage.setItem(`paloalto:${joined}`, r.token);
      setToken(r.token);
      setPhone('');
      setPin('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="participant-shell">
      <header>
        <Brand />
        {token && <Connection connected={live.connected} />}
      </header>
      <main className="participant-main">
        {!token ? (
          <Card as="section" className="login-card">
            <div className="login-kicker">
              <Radio aria-hidden="true" /> PARTICIPATION EN DIRECT
            </div>
            <h1>
              Votre point de vue
              <br />
              fait partie du cours<span className="accent">.</span>
            </h1>
            <p className="lead">
              Rejoignez la présentation et gardez cette page ouverte pendant les activités.
            </p>
            <form onSubmit={login}>
              <label htmlFor="phone">{fr.phone}</label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="06 12 34 56 78"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                maxLength={40}
              />
              <label htmlFor="pin">
                {!querySession || s?.managed || !session ? 'Code de présentation' : fr.code}
              </label>
              <Input
                id="pin"
                type="password"
                autoComplete="off"
                placeholder="Code partagé par l’organisateur"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                required
                maxLength={64}
              />
              <Button
                className="primary full"
                disabled={busy || (!!querySession && s?.state === 'FINISHED')}
              >
                {busy ? 'Connexion…' : fr.login} <ArrowRight aria-hidden="true" />
              </Button>
            </form>
            {!session && <Notice>La présentation n’a pas encore commencé.</Notice>}
            {querySession && s?.state === 'FINISHED' && (
              <Notice>Cette présentation est terminée.</Notice>
            )}
            {error && <Notice error>{error}</Notice>}
            <p className="fine muted privacy-note">
              <ShieldCheck aria-hidden="true" />
              <span>
                Vos réponses sont présentées de manière anonyme. Votre numéro n’est jamais affiché
                aux autres participants.
              </span>
            </p>
          </Card>
        ) : s ? (
          <Activity
            key={`${s.session}:${s.scene?.id}:${s.epoch}`}
            snapshot={s}
            token={token}
            connected={live.connected}
          />
        ) : (
          <Notice>Chargement de la session…</Notice>
        )}
        {token && (live.error || error) && <Notice error>{live.error || error}</Notice>}
      </main>
      <footer>
        École de Palo Alto <span>•</span> Communication & interaction
      </footer>
    </div>
  );
}
function Activity({
  snapshot: s,
  token,
  connected,
}: {
  snapshot: Snapshot;
  token: string;
  connected: boolean;
}) {
  const [options, setOptions] = useState<string[]>([]),
    [words, setWords] = useState<string[]>([]),
    [custom, setCustom] = useState('');
  const [submitted, setSubmitted] = useState(!!s.submitted),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const queueKey = `paloalto:pending:${s.session}`;
  const [pending, setPending] = useState<Vote | null>(() => {
    try {
      const p = JSON.parse(localStorage.getItem(queueKey) || 'null') as Vote | null;
      return p && p.sceneId === s.scene?.id && p.epoch === s.epoch ? p : null;
    } catch {
      return null;
    }
  });
  const scene = s.scene;
  useEffect(() => {
    if (s.submitted) {
      setSubmitted(true);
      setPending(null);
      localStorage.removeItem(queueKey);
    }
  }, [s.submitted, queueKey]);
  const send = useCallback(
    async (vote: Vote) => {
      setBusy(true);
      setError('');
      try {
        await request('', '/api/vote', token, vote);
        setSubmitted(true);
        setPending(null);
        localStorage.removeItem(queueKey);
      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'ALREADY_VOTED') setSubmitted(true);
          setPending(null);
          localStorage.removeItem(queueKey);
          setError(e.message);
        } else {
          setError('Connexion interrompue. Votre réponse sera réessayée à la reconnexion.');
        }
      } finally {
        setBusy(false);
      }
    },
    [token, queueKey],
  );
  useEffect(() => {
    if (pending && connected && !busy && !submitted) {
      void send(pending);
    }
    // Retry once per reconnect; a short timer below covers HTTP failures while the socket stays online.
  }, [connected]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (pending && !busy && !submitted) void send(pending);
    }, 4000);
    return () => clearInterval(timer);
  }, [pending, busy, submitted, send]);
  useEffect(() => {
    if (s.state !== 'VOTING_OPEN' && pending && !submitted) {
      void send(pending);
    }
    // Let the server acknowledge a previously saved vote or reject a late one.
  }, [s.state]);
  if (s.state === 'FINISHED')
    return <Status symbol="✓" title={fr.finished} text="Vous pouvez fermer cette page." />;
  if (s.state !== 'VOTING_OPEN')
    return (
      <Status
        symbol={s.state === 'SCENE_ACTIVE' ? '◷' : '◎'}
        title={s.state === 'VOTING_CLOSED' ? fr.closed : fr.waiting}
        text={
          s.state === 'SCENE_ACTIVE'
            ? 'Regardez la scène. Le vote apparaîtra automatiquement.'
            : fr.waitHint
        }
        detail={scene?.title}
      />
    );
  if (submitted || s.submitted)
    return (
      <Status
        symbol="✓"
        title={fr.submitted}
        text="Merci ! Gardez cette page ouverte pour la suite."
        detail={scene?.title}
      />
    );
  if (!scene) return null;
  const toggle = (value: string, selected: string[], set: (a: string[]) => void, max: number) => {
    if (selected.includes(value)) set(selected.filter((v) => v !== value));
    else if (selected.length < max) set([...selected, value]);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    const requestId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    const vote: Vote = { sceneId: scene!.id, epoch: s.epoch, optionIds: options, words, requestId };
    localStorage.setItem(queueKey, JSON.stringify(vote));
    setPending(vote);
    await send(vote);
  }
  return (
    <Card as="section" className="vote-card">
      <div className="eyebrow">
        SCÈNE {s.sceneIndex + 1} <span className="live-pill">VOTE OUVERT</span>
      </div>
      <p className="scene-caption">{scene.title}</p>
      <h1>{scene.poll.question}</h1>
      <form onSubmit={submit}>
        <fieldset disabled={busy || !!pending}>
          <legend className="muted">
            {scene.poll.mode === 'single'
              ? 'Choisissez une réponse.'
              : 'Choisissez une ou plusieurs réponses.'}
          </legend>
          <div className="options">
            {scene.poll.options.map((o, i) => (
              <label className={`option ${options.includes(o.id) ? 'selected' : ''}`} key={o.id}>
                <input
                  type={scene.poll.mode === 'single' ? 'radio' : 'checkbox'}
                  name="poll"
                  checked={options.includes(o.id)}
                  onChange={() =>
                    scene.poll.mode === 'single'
                      ? setOptions([o.id])
                      : toggle(o.id, options, setOptions, 10)
                  }
                />
                <span className="option-letter">{String.fromCharCode(65 + i)}</span>
                <strong>{o.label}</strong>
                <span className="option-check" aria-hidden="true">
                  {options.includes(o.id) ? '✓' : '○'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset disabled={busy || !!pending} className="word-choices">
          <legend>{scene.words.prompt}</legend>
          <p className="fine muted">
            Facultatif · {words.length} / {scene.words.maxSelections} mots sélectionnés
          </p>
          <div className="chips">
            {scene.words.options.map((w) => (
              <Button
                type="button"
                key={w}
                aria-pressed={words.includes(w)}
                disabled={!words.includes(w) && words.length >= scene.words.maxSelections}
                className={`chip ${words.includes(w) ? 'selected' : ''}`}
                onClick={() => toggle(w, words, setWords, scene.words.maxSelections)}
              >
                {w}
              </Button>
            ))}
          </div>
          {scene.words.allowCustom && (
            <div className="button-row">
              <Input
                aria-label="Votre mot"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                maxLength={32}
                placeholder="Votre mot"
              />
              <Button
                type="button"
                disabled={!custom.trim() || words.length >= scene.words.maxSelections}
                onClick={() => {
                  toggle(custom.trim(), words, setWords, scene.words.maxSelections);
                  setCustom('');
                }}
              >
                Ajouter
              </Button>
            </div>
          )}
          {words
            .filter((w) => !scene.words.options.includes(w))
            .map((w) => (
              <Button
                className="chip selected"
                type="button"
                key={w}
                onClick={() => setWords(words.filter((v) => v !== w))}
              >
                {w} ×
              </Button>
            ))}
        </fieldset>
        <Button className="primary full" disabled={!options.length || busy || !!pending}>
          {busy ? 'Envoi…' : pending ? 'En attente de connexion…' : fr.send}
          <span aria-hidden="true">→</span>
        </Button>
      </form>
      {error && <Notice error>{error}</Notice>}
    </Card>
  );
}
function Status({
  symbol,
  title,
  text,
  detail,
}: {
  symbol: string;
  title: string;
  text: string;
  detail?: string;
}) {
  return (
    <Card as="section" className="status-card">
      <div className="status-art" aria-hidden="true">
        {symbol === '✓' ? <Check /> : symbol === '◷' ? <Clock3 /> : <Radio />}
      </div>
      <div className="eyebrow">PALO ALTO · LA CLASSE EN DIRECT</div>
      <h1>{title}</h1>
      <p className="lead">{text}</p>
      {detail && <p className="status-detail">{detail}</p>}
      <div className="status-dots" aria-hidden="true">
        ● ● ●
      </div>
    </Card>
  );
}
