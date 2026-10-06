import { useCallback, useEffect, useState } from 'react';
import { type Config, type Scene, stateLabels, configSchema } from '../../shared/model.ts';
import { request, downloadCsv, downloadPng } from './api.ts';
import { Brand, Connection, Notice, QR, Results, Confirm } from './components.tsx';
import { Button, Card, Input } from './ui.tsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './vendor/tabs.tsx';
import { CopyButton } from './vendor/copy.tsx';
import { useLive } from './useLive.ts';
import { resultsPng } from './render-results.ts';
import { Plus, Play, Users, Clapperboard, ArrowRight, Trash2, Save, LogOut } from 'lucide-react';

type Dashboard = {
  session: string;
  email: string;
  code: string;
  revision: number;
  config: Config;
  editable: boolean;
  voters: { id: string; phone: string; name: string }[];
};
const newScene = (): Scene => ({
  id: crypto.randomUUID(),
  title: 'Nouvelle scène',
  poll: {
    question: '',
    mode: 'single',
    options: [
      { id: 'a', label: '' },
      { id: 'b', label: '' },
    ],
  },
  words: { prompt: 'Quels mots retenez-vous ?', options: [], maxSelections: 3, allowCustom: true },
  explanation: '',
  voteSeconds: 60,
});
const newCode = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(16)),
    (n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32],
  ).join('');

export function DashboardPresenter() {
  const [token, setToken] = useState(() => localStorage.getItem('paloalto:presenter:v2') || '');
  const [creating, setCreating] = useState(false),
    [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [title, setTitle] = useState('');
  const [data, setData] = useState<Dashboard>(),
    [draft, setDraft] = useState<Config>(),
    [dirty, setDirty] = useState(false),
    [selected, setSelected] = useState(0),
    [tab, setTab] = useState('scenes');
  const [name, setName] = useState(''),
    [phone, setPhone] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const [now, setNow] = useState(Date.now());
  const revoke = useCallback(() => {
    localStorage.removeItem('paloalto:presenter:v2');
    setToken('');
    setData(undefined);
    setDraft(undefined);
    setError('Reconnectez-vous avec votre e-mail et votre code.');
  }, []);
  const live = useLive('', token, undefined, revoke),
    s = live.snapshot?.session === data?.session ? live.snapshot : undefined;
  useEffect(() => {
    if (!token) return;
    let alive = true,
      loaded = false;
    const load = () => {
      if (loaded) return;
      void request<Dashboard>('', '/api/admin/presentation', token)
        .then((d) => {
          if (alive && !loaded) {
            loaded = true;
            setError('');
            setData(d);
            setDraft(d.config);
            setDirty(false);
          }
        })
        .catch((e) => {
          if (alive && !loaded) {
            if (e.status === 401) revoke();
            else setError(e.message);
          }
        });
    };
    load();
    const retry = setInterval(load, 10000);
    window.addEventListener('online', load);
    return () => {
      alive = false;
      clearInterval(retry);
      window.removeEventListener('online', load);
    };
  }, [token, revoke]);
  useEffect(() => {
    if (!s?.voteEndsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [s?.voteEndsAt]);
  useEffect(() => {
    const prevent = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  async function operate(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Réessayez.');
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent) {
    e.preventDefault();
    await operate(async () => {
      const r = await request<{ token: string }>(
        '',
        creating ? '/api/presentations' : '/api/presentations/login',
        '',
        { email, code, ...(creating ? { title } : {}) },
      );
      localStorage.setItem('paloalto:presenter:v2', r.token);
      setToken(r.token);
      setCreating(false);
      setSelected(0);
      setTab('scenes');
      setCode('');
    });
  }
  function edit(scene: Scene) {
    setDraft((d) => d && { ...d, scenes: d.scenes.map((x, i) => (i === selected ? scene : x)) });
    setDirty(true);
  }
  async function save() {
    if (!draft || !data) return;
    const parsed = configSchema.safeParse({
      ...draft,
      scenes: draft.scenes.map((scene) => ({
        ...scene,
        words: {
          ...scene.words,
          options: scene.words.options.map((w) => w.trim()).filter(Boolean),
        },
      })),
    });
    if (!parsed.success) {
      setError(
        'Complétez le titre et les questions : 2 à 10 réponses distinctes par sondage, et des mots sans doublons.',
      );
      return;
    }
    await operate(async () => {
      const d = await request<Dashboard>('', '/api/admin/presentation', token, {
        config: parsed.data,
        revision: data.revision,
      });
      setData(d);
      setDraft(d.config);
      setDirty(false);
      setMessage('Enregistré sur Railway. Vous pouvez revenir le jour de la présentation.');
    });
  }
  async function command(action: string, sceneId?: string) {
    if (!s) return;
    await request('', '/api/admin/command', token, {
      action,
      sceneId,
      expectedVersion: s.version,
      confirm: ['finish', 'reset'].includes(action),
    });
    setData((d) => d && { ...d, editable: false });
  }
  async function runVote() {
    if (!s || !draft) return;
    if (dirty) throw new Error('Enregistrez vos scènes avant de démarrer.');
    if (!draft.scenes.length || !data?.voters.length)
      throw new Error('Ajoutez au moins une scène et un votant avant de démarrer.');
    if (['WAITING', 'RESULTS', 'EXPLANATION'].includes(s.state)) {
      const activated = await request<{ version: number }>('', '/api/admin/command', token, {
        action: 'activate',
        sceneId: s.scene?.id,
        expectedVersion: s.version,
      });
      await request('', '/api/admin/command', token, {
        action: 'open',
        expectedVersion: activated.version,
      });
    } else await command('open');
    setData((d) => d && { ...d, editable: false });
  }
  function changeTab(value: string) {
    if (value === 'live' && dirty) {
      setError('Enregistrez vos modifications avant de présenter.');
      return;
    }
    setTab(value);
  }
  const scene = draft?.scenes[selected],
    editable =
      !!data?.editable && !s?.state.match(/SCENE_ACTIVE|VOTING|RESULTS|EXPLANATION|FINISHED/);
  if (!token)
    return (
      <div className="studio-login">
        <Brand />
        <Card className="studio-auth">
          <span className="eyebrow">VOTRE ESPACE DE PRÉSENTATION</span>
          <h1>{creating ? 'Préparez votre présentation.' : 'Retrouvez votre présentation.'}</h1>
          <p className="lead">Scènes, questions et votants : tout est prêt avant le jour J.</p>
          <form onSubmit={login}>
            <label htmlFor="email">E-mail de l’organisateur</label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={160}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {creating && (
              <>
                <label htmlFor="presentation-title">Titre de la présentation</label>
                <Input
                  id="presentation-title"
                  required
                  maxLength={160}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </>
            )}
            <label htmlFor="presentation-code">Code de présentation</label>
            <Input
              id="presentation-code"
              type={creating ? 'text' : 'password'}
              required
              minLength={10}
              maxLength={64}
              autoComplete={creating ? 'new-password' : 'current-password'}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {creating && (
              <p className="fine muted">
                Gardez votre e-mail d’organisateur privé. Partagez uniquement le code avec les
                votants.
              </p>
            )}
            <Button className="primary full" disabled={busy}>
              {busy ? 'Connexion…' : creating ? 'Créer la présentation' : 'Ouvrir ma présentation'}
              <ArrowRight />
            </Button>
          </form>
          <Button
            className="secondary full"
            onClick={() => {
              setCreating(!creating);
              setError('');
              setCode(creating ? '' : newCode());
            }}
          >
            {creating ? 'J’ai déjà une présentation' : 'Créer une présentation'}
          </Button>
          {error && <Notice error>{error}</Notice>}
        </Card>
      </div>
    );
  return (
    <div className="studio">
      <header className="studio-header">
        <Brand />
        <div>
          <Connection connected={live.connected} />
          <Button
            aria-label="Se déconnecter"
            disabled={busy}
            onClick={() =>
              void operate(async () => {
                await request('', '/api/admin/logout', token, {});
                revoke();
                setError('');
              })
            }
          >
            <LogOut />
          </Button>
        </div>
      </header>
      {!data || !draft ? (
        <>
          {error && <Notice error>{error}</Notice>}
          <Notice>Chargement de votre présentation…</Notice>
        </>
      ) : (
        <>
          <div className="studio-heading">
            <div>
              <span className="eyebrow">PRÉPARER AU CALME. PRÉSENTER SIMPLEMENT.</span>
              <h1>{draft.title}</h1>
              <p>
                {draft.scenes.length} scènes · {data.voters.length} votants autorisés ·{' '}
                {dirty ? 'Modifications à enregistrer' : 'Enregistré'}
              </p>
            </div>
            <div className="studio-code">
              <span>CODE DE PRÉSENTATION</span>
              <strong>{data.code}</strong>
              <CopyButton content={data.code} aria-label="Copier le code" />
            </div>
          </div>
          {error && <Notice error>{error}</Notice>}
          {message && <Notice>{message}</Notice>}
          <Tabs value={tab} onValueChange={changeTab}>
            <TabsList className="studio-tabs" aria-label="Navigation de la présentation">
              <TabsTrigger value="scenes" id="tab-scenes" aria-controls="panel-scenes">
                <Clapperboard />
                1. Scènes & questions
              </TabsTrigger>
              <TabsTrigger value="voters" id="tab-voters" aria-controls="panel-voters">
                <Users />
                2. Votants
              </TabsTrigger>
              <TabsTrigger value="live" id="tab-live" aria-controls="panel-live">
                <Play />
                3. Présenter
              </TabsTrigger>
            </TabsList>
            <TabsContent value="scenes" id="panel-scenes" aria-labelledby="tab-scenes">
              <div className="studio-prep">
                <aside className="scene-list">
                  <label htmlFor="draft-title">Titre de la présentation</label>
                  <Input
                    id="draft-title"
                    value={draft.title}
                    maxLength={160}
                    disabled={!editable}
                    onChange={(e) => {
                      setDraft({ ...draft, title: e.target.value });
                      setDirty(true);
                    }}
                  />
                  {draft.scenes.map((x, i) => (
                    <Button
                      key={x.id}
                      className={i === selected ? 'scene-picked' : ''}
                      onClick={() => setSelected(i)}
                    >
                      <span>{String(i + 1).padStart(2, '0')}</span>
                      {x.title}
                    </Button>
                  ))}
                  <Button
                    className="secondary"
                    disabled={!editable || draft.scenes.length >= 100}
                    onClick={() => {
                      setSelected(draft.scenes.length);
                      setDraft({ ...draft, scenes: [...draft.scenes, newScene()] });
                      setDirty(true);
                    }}
                  >
                    <Plus />
                    Ajouter une scène
                  </Button>
                  <Button
                    className="primary"
                    disabled={!editable || !dirty || busy}
                    onClick={() => void save()}
                  >
                    <Save />
                    Enregistrer les scènes
                  </Button>
                  <span className="fine muted">
                    Les questions sont verrouillées au démarrage pour conserver les réponses.
                  </span>
                </aside>
                <Card className="scene-editor">
                  {scene ? (
                    <>
                      <div className="editor-heading">
                        <span className="eyebrow">SCÈNE {selected + 1}</span>
                        <div>
                          <Button
                            disabled={!editable || selected === 0}
                            onClick={() => {
                              const scenes = [...draft.scenes];
                              [scenes[selected - 1], scenes[selected]] = [
                                scenes[selected],
                                scenes[selected - 1],
                              ];
                              setDraft({ ...draft, scenes });
                              setSelected(selected - 1);
                              setDirty(true);
                            }}
                          >
                            Monter
                          </Button>
                          <Button
                            disabled={!editable || selected === draft.scenes.length - 1}
                            onClick={() => {
                              const scenes = [...draft.scenes];
                              [scenes[selected + 1], scenes[selected]] = [
                                scenes[selected],
                                scenes[selected + 1],
                              ];
                              setDraft({ ...draft, scenes });
                              setSelected(selected + 1);
                              setDirty(true);
                            }}
                          >
                            Descendre
                          </Button>
                        </div>
                      </div>
                      <fieldset disabled={!editable}>
                        <label htmlFor="scene-title">Titre de la scène</label>
                        <Input
                          id="scene-title"
                          value={scene.title}
                          maxLength={160}
                          onChange={(e) => edit({ ...scene, title: e.target.value })}
                        />
                        <h2>Sondage</h2>
                        <label htmlFor="poll-question">Question du sondage</label>
                        <Input
                          id="poll-question"
                          value={scene.poll.question}
                          maxLength={160}
                          placeholder="Quelle question poser à la classe ?"
                          onChange={(e) =>
                            edit({ ...scene, poll: { ...scene.poll, question: e.target.value } })
                          }
                        />
                        <label htmlFor="poll-mode">Type de réponse</label>
                        <select
                          id="poll-mode"
                          value={scene.poll.mode}
                          onChange={(e) =>
                            edit({
                              ...scene,
                              poll: {
                                ...scene.poll,
                                mode: e.target.value as 'single' | 'multiple',
                              },
                            })
                          }
                        >
                          <option value="single">Une seule réponse</option>
                          <option value="multiple">Plusieurs réponses</option>
                        </select>
                        {scene.poll.options.map((o, i) => (
                          <div className="option-editor" key={o.id}>
                            <label htmlFor={`option-${o.id}`}>Réponse {i + 1}</label>
                            <Input
                              id={`option-${o.id}`}
                              value={o.label}
                              maxLength={160}
                              onChange={(e) =>
                                edit({
                                  ...scene,
                                  poll: {
                                    ...scene.poll,
                                    options: scene.poll.options.map((x) =>
                                      x.id === o.id ? { ...x, label: e.target.value } : x,
                                    ),
                                  },
                                })
                              }
                            />
                            <Button
                              aria-label={`Supprimer réponse ${i + 1}`}
                              disabled={scene.poll.options.length <= 2}
                              onClick={() =>
                                edit({
                                  ...scene,
                                  poll: {
                                    ...scene.poll,
                                    options: scene.poll.options.filter((x) => x.id !== o.id),
                                  },
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        ))}
                        <Button
                          className="secondary"
                          disabled={scene.poll.options.length >= 10}
                          onClick={() =>
                            edit({
                              ...scene,
                              poll: {
                                ...scene.poll,
                                options: [
                                  ...scene.poll.options,
                                  { id: crypto.randomUUID(), label: '' },
                                ],
                              },
                            })
                          }
                        >
                          <Plus />
                          Ajouter une réponse
                        </Button>
                        <h2>Nuage de mots</h2>
                        <label htmlFor="words-prompt">Question du nuage</label>
                        <Input
                          id="words-prompt"
                          value={scene.words.prompt}
                          maxLength={160}
                          onChange={(e) =>
                            edit({ ...scene, words: { ...scene.words, prompt: e.target.value } })
                          }
                        />
                        <label htmlFor="words-options">Mots proposés (un par ligne)</label>
                        <textarea
                          id="words-options"
                          value={scene.words.options.join('\n')}
                          maxLength={900}
                          onChange={(e) =>
                            edit({
                              ...scene,
                              words: { ...scene.words, options: e.target.value.split('\n') },
                            })
                          }
                        />
                        <label className="studio-check">
                          <input
                            type="checkbox"
                            checked={scene.words.allowCustom}
                            onChange={(e) =>
                              edit({
                                ...scene,
                                words: { ...scene.words, allowCustom: e.target.checked },
                              })
                            }
                          />
                          Autoriser les mots libres
                        </label>
                        <label htmlFor="words-max">Nombre de mots par votant</label>
                        <Input
                          id="words-max"
                          type="number"
                          min={0}
                          max={10}
                          value={scene.words.maxSelections}
                          onChange={(e) =>
                            edit({
                              ...scene,
                              words: { ...scene.words, maxSelections: Number(e.target.value) },
                            })
                          }
                        />
                        <h2>Pendant la présentation</h2>
                        <label htmlFor="vote-seconds">
                          Durée du vote en secondes (0 = fermeture manuelle)
                        </label>
                        <Input
                          id="vote-seconds"
                          type="number"
                          min={0}
                          max={3600}
                          value={scene.voteSeconds}
                          onChange={(e) => edit({ ...scene, voteSeconds: Number(e.target.value) })}
                        />
                        <p className="fine muted">
                          Le compte à rebours ferme le vote et affiche les résultats
                          automatiquement, même si cet onglet est fermé.
                        </p>
                        <label htmlFor="explanation">Notes pour expliquer la scène</label>
                        <textarea
                          id="explanation"
                          value={scene.explanation}
                          maxLength={1000}
                          onChange={(e) => edit({ ...scene, explanation: e.target.value })}
                        />
                      </fieldset>
                      <Button
                        disabled={!editable}
                        className="danger"
                        onClick={() =>
                          setConfirm({
                            message: 'Supprimer cette scène de la préparation ?',
                            run: () => {
                              setDraft({
                                ...draft,
                                scenes: draft.scenes.filter((x) => x.id !== scene.id),
                              });
                              setSelected(Math.max(0, selected - 1));
                              setDirty(true);
                            },
                          })
                        }
                      >
                        <Trash2 />
                        Supprimer la scène
                      </Button>
                    </>
                  ) : (
                    <div className="studio-empty">
                      <Clapperboard />
                      <h2>Votre première scène</h2>
                      <p>Ajoutez une scène, puis écrivez sa question et ses réponses.</p>
                    </div>
                  )}
                </Card>
              </div>
            </TabsContent>
            <TabsContent value="voters" id="panel-voters" aria-labelledby="tab-voters">
              <Card className="studio-panel">
                <span className="eyebrow">UNE LISTE. UN CODE POUR LA CLASSE.</span>
                <h2>Qui peut participer ?</h2>
                <p>
                  Ajoutez les noms et numéros ici. Chaque votant se connecte avec son numéro et le
                  code de présentation.
                </p>
                <form
                  className="voter-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void operate(async () => {
                      const d = await request<Dashboard>('', '/api/admin/voters', token, {
                        phone,
                        name,
                      });
                      setData(d);
                      setPhone('');
                      setName('');
                      setMessage('Votant enregistré.');
                    });
                  }}
                >
                  <div>
                    <label htmlFor="voter-name">Nom du votant</label>
                    <Input
                      id="voter-name"
                      value={name}
                      required
                      maxLength={160}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label htmlFor="voter-phone">Téléphone du votant</label>
                    <Input
                      id="voter-phone"
                      type="tel"
                      value={phone}
                      required
                      maxLength={40}
                      placeholder="06 12 34 56 78"
                      onChange={(e) => setPhone(e.target.value)}
                    />
                  </div>
                  <Button className="primary" disabled={busy || s?.state === 'FINISHED'}>
                    <Plus />
                    Ajouter / mettre à jour
                  </Button>
                </form>
                <div className="voter-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Nom</th>
                        <th>Téléphone</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.voters.map((v) => (
                        <tr key={v.id}>
                          <td>{v.name}</td>
                          <td>{v.phone}</td>
                          <td>
                            <Button
                              aria-label={`Retirer ${v.name}`}
                              disabled={busy}
                              onClick={() =>
                                setConfirm({
                                  message: `Retirer ${v.name} de cette présentation ? Son accès sera immédiatement bloqué.`,
                                  run: () =>
                                    void operate(async () =>
                                      setData(
                                        await request<Dashboard>(
                                          '',
                                          `/api/admin/voters/${v.id}`,
                                          token,
                                          undefined,
                                          'DELETE',
                                        ),
                                      ),
                                    ),
                                })
                              }
                            >
                              <Trash2 />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!data.voters.length && (
                    <p className="studio-empty">
                      Votre liste est vide. Ajoutez le premier votant ci-dessus.
                    </p>
                  )}
                </div>
              </Card>
            </TabsContent>
            <TabsContent value="live" id="panel-live" aria-labelledby="tab-live">
              <div className="live-layout">
                <Card className="studio-panel live-controls">
                  <span className="eyebrow">LE JOUR J</span>
                  <h2>{s?.scene?.title || 'Prêt à présenter ?'}</h2>
                  <p>
                    {s ? stateLabels[s.state] : 'Connexion…'} · {s?.responseCount || 0} réponses /{' '}
                    {data.voters.length} votants
                  </p>
                  {s?.voteEndsAt && s.state === 'VOTING_OPEN' && (
                    <strong className="vote-countdown">
                      {Math.max(0, Math.ceil((s.voteEndsAt - now) / 1000))} s
                    </strong>
                  )}
                  <label htmlFor="live-scene">Scène à présenter</label>
                  <select
                    id="live-scene"
                    value={s?.scene?.id || ''}
                    disabled={
                      busy ||
                      !live.connected ||
                      s?.state === 'VOTING_OPEN' ||
                      s?.state === 'FINISHED'
                    }
                    onChange={(e) =>
                      void operate(() =>
                        data.editable
                          ? request('', '/api/admin/preview', token, {
                              sceneId: e.target.value,
                            }).then(() => {})
                          : command('activate', e.target.value),
                      )
                    }
                  >
                    {draft.scenes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.title}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="primary full live-main"
                    disabled={
                      busy ||
                      !live.connected ||
                      !s ||
                      !['IDLE', 'WAITING', 'SCENE_ACTIVE', 'VOTING_CLOSED'].includes(s.state) ||
                      !draft.scenes.length ||
                      !data.voters.length ||
                      dirty
                    }
                    onClick={() => void operate(runVote)}
                  >
                    <Play />
                    Ouvrir le vote
                  </Button>
                  <Button
                    className="secondary full"
                    disabled={busy || !live.connected || s?.state !== 'VOTING_OPEN'}
                    onClick={() =>
                      void operate(async () => {
                        const closed = await request<{ version: number }>(
                          '',
                          '/api/admin/command',
                          token,
                          { action: 'close', expectedVersion: s!.version },
                        );
                        await request('', '/api/admin/command', token, {
                          action: 'results',
                          expectedVersion: closed.version,
                        });
                      })
                    }
                  >
                    Fermer et afficher les résultats
                  </Button>
                  <Button
                    className={s?.state === 'RESULTS' ? 'primary full live-main' : 'secondary full'}
                    disabled={
                      busy ||
                      !live.connected ||
                      !s ||
                      s.state === 'VOTING_OPEN' ||
                      s.state === 'FINISHED' ||
                      s.sceneIndex >= draft.scenes.length - 1
                    }
                    onClick={() => void operate(() => command('next'))}
                  >
                    Scène suivante
                    <ArrowRight />
                  </Button>
                  {s?.scene?.explanation && (
                    <div className="presenter-notes">
                      <strong>Vos notes</strong>
                      <p>{s.scene.explanation}</p>
                    </div>
                  )}
                  <div className="destructive">
                    <p className="fine muted">
                      Après les essais, effacez les votes avant le lancement réel.
                    </p>
                    <Button
                      disabled={busy || !live.connected || !s?.scene || s.state === 'FINISHED'}
                      onClick={() =>
                        setConfirm({
                          message:
                            'Effacer tous les votes de cette scène ? Les participants pourront répondre de nouveau. Les autres scènes sont conservées.',
                          run: () =>
                            void operate(async () => {
                              await command('reset');
                              setMessage(
                                'Votes de cette scène effacés. Vous pouvez rouvrir le vote.',
                              );
                            }),
                        })
                      }
                    >
                      Réinitialiser cette scène
                    </Button>
                    <Button
                      disabled={busy || !live.connected || !s?.scene || dirty}
                      onClick={() =>
                        setConfirm({
                          message:
                            'Effacer les votes de TOUTES les scènes et revenir au début ? Cette suppression est définitive. Vos scènes, le code et la liste des votants sont conservés.',
                          run: () =>
                            void operate(async () => {
                              const d = await request<Dashboard>(
                                '',
                                '/api/admin/reset-presentation',
                                token,
                                { expectedVersion: s!.version, confirm: true },
                              );
                              setData(d);
                              setDraft(d.config);
                              setDirty(false);
                              setSelected(0);
                              setMessage(
                                'Essais effacés. Présentation prête au lancement, depuis la première scène.',
                              );
                            }),
                        })
                      }
                    >
                      Effacer les essais et revenir au début
                    </Button>
                    <Button
                      disabled={busy || s?.state === 'FINISHED' || !s?.scene}
                      onClick={() =>
                        setConfirm({
                          message: 'Terminer la présentation et fermer tous les votes ?',
                          run: () => void operate(() => command('finish')),
                        })
                      }
                    >
                      Terminer la présentation
                    </Button>
                  </div>
                </Card>
                <Card className="studio-panel">
                  <h2>Inviter la classe</h2>
                  <p>Le QR reste le même pour toutes les scènes.</p>
                  <QR url={`${location.origin}/?session=${data.session}`} />
                  <p className="fine">
                    Code à partager : <strong>{data.code}</strong>
                  </p>
                  <a href={`/display?session=${data.session}`} target="_blank" rel="noreferrer">
                    Ouvrir l’écran de projection ↗
                  </a>
                  <p className="fine muted">
                    Dans le plugin, connectez-vous avec votre e-mail et ce code, puis choisissez
                    chaque scène à placer sur vos diapositives.
                  </p>
                  <Button
                    disabled={busy}
                    onClick={() => void operate(async () => downloadCsv('', token, data.session))}
                  >
                    Exporter les résultats
                  </Button>
                </Card>
              </div>
              {s?.results && s.scene && (
                <>
                  <Results
                    results={s.results}
                    question={s.scene.poll.question}
                    wordPrompt={s.scene.words.prompt}
                  />
                  <div className="asset-downloads">
                    {(['poll', 'words'] as const).map((kind) => (
                      <Button
                        key={kind}
                        disabled={busy}
                        onClick={() =>
                          void operate(async () =>
                            downloadPng(
                              await resultsPng(
                                s.results!,
                                kind === 'poll' ? s.scene!.poll.question : s.scene!.words.prompt,
                                kind,
                                { transparent: true, chartOnly: true },
                              ),
                              `paloalto-${kind}.png`,
                            ),
                          )
                        }
                      >
                        {kind === 'poll' ? 'Télécharger le sondage' : 'Télécharger le nuage'}
                      </Button>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
      {confirm && (
        <Confirm
          message={confirm.message}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            const run = confirm.run;
            setConfirm(null);
            run();
          }}
        />
      )}
    </div>
  );
}
