import { z } from 'zod';

const text = z.string().trim().min(1).max(160);
const option = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), label: text });
export const sceneSchema = z
  .object({
    id: option.shape.id,
    title: text,
    poll: z.object({
      question: text,
      mode: z.enum(['single', 'multiple']).default('single'),
      options: z.array(option).min(2).max(10),
    }),
    words: z.object({
      prompt: text,
      options: z.array(text.max(32)).max(24),
      maxSelections: z.number().int().min(0).max(10),
      allowCustom: z.boolean().default(false),
    }),
    explanation: z.string().max(1000).default(''),
    voteSeconds: z.number().int().min(0).max(3600).default(60),
  })
  .superRefine((s, ctx) => {
    if (new Set(s.poll.options.map((o) => o.id)).size !== s.poll.options.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate poll option IDs' });
    if (
      new Set(s.words.options.map((w) => w.toLocaleLowerCase('fr'))).size !== s.words.options.length
    )
      ctx.addIssue({ code: 'custom', message: 'Duplicate words' });
  });
export const configSchema = z
  .object({ title: text, scenes: z.array(sceneSchema).min(1).max(100) })
  .superRefine((c, ctx) => {
    if (new Set(c.scenes.map((s) => s.id)).size !== c.scenes.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate scene IDs' });
  });
export type Scene = z.infer<typeof sceneSchema>;
export type Config = z.infer<typeof configSchema>;
export const STATES = [
  'IDLE',
  'WAITING',
  'SCENE_ACTIVE',
  'VOTING_OPEN',
  'VOTING_CLOSED',
  'RESULTS',
  'EXPLANATION',
  'FINISHED',
] as const;
export type State = (typeof STATES)[number];
export const actions = [
  'activate',
  'open',
  'close',
  'results',
  'hide',
  'explain',
  'wait',
  'next',
  'reset',
  'finish',
] as const;
export type Action = (typeof actions)[number];
export const stateLabels: Record<State, string> = {
  IDLE: 'Aucune session',
  WAITING: 'En attente',
  SCENE_ACTIVE: 'Scène en cours',
  VOTING_OPEN: 'Vote ouvert',
  VOTING_CLOSED: 'Vote fermé',
  RESULTS: 'Résultats affichés',
  EXPLANATION: 'Explication',
  FINISHED: 'Session terminée',
};
export const allowed: Record<Action, State[]> = {
  activate: ['WAITING', 'SCENE_ACTIVE', 'VOTING_CLOSED', 'RESULTS', 'EXPLANATION'],
  open: ['SCENE_ACTIVE', 'VOTING_CLOSED'],
  close: ['VOTING_OPEN'],
  results: ['VOTING_CLOSED', 'EXPLANATION'],
  hide: ['RESULTS'],
  explain: ['RESULTS', 'VOTING_CLOSED'],
  wait: ['SCENE_ACTIVE', 'VOTING_CLOSED', 'RESULTS', 'EXPLANATION'],
  next: ['WAITING', 'SCENE_ACTIVE', 'VOTING_CLOSED', 'RESULTS', 'EXPLANATION'],
  reset: ['WAITING', 'SCENE_ACTIVE', 'VOTING_OPEN', 'VOTING_CLOSED', 'RESULTS', 'EXPLANATION'],
  finish: ['WAITING', 'SCENE_ACTIVE', 'VOTING_OPEN', 'VOTING_CLOSED', 'RESULTS', 'EXPLANATION'],
};
export function transition(state: State, action: Action): State {
  if (!allowed[action].includes(state)) throw new Error('Transition non autorisée.');
  return (
    {
      activate: 'SCENE_ACTIVE',
      open: 'VOTING_OPEN',
      close: 'VOTING_CLOSED',
      results: 'RESULTS',
      hide: 'VOTING_CLOSED',
      explain: 'EXPLANATION',
      wait: 'WAITING',
      next: 'SCENE_ACTIVE',
      reset: 'SCENE_ACTIVE',
      finish: 'FINISHED',
    } as const
  )[action];
}
export type Aggregate = {
  total: number;
  poll: { id: string; label: string; count: number; percentage: number }[];
  words: { word: string; count: number }[];
};
export type Snapshot = {
  session: string | null;
  title: string;
  state: State;
  version: number;
  sceneIndex: number;
  epoch: number;
  scene: Scene | null;
  scenes?: { id: string; title: string }[];
  connected: number;
  eligible: number;
  responseCount: number;
  submitted?: boolean;
  results?: Aggregate;
  joinUrl: string;
  demo: boolean;
  managed?: boolean;
  voteEndsAt?: number | null;
};
export type Vote = {
  sceneId: string;
  epoch: number;
  optionIds: string[];
  words: string[];
  requestId: string;
};
export function aggregate(
  scene: Scene,
  votes: { optionIds: string[]; words: string[] }[],
): Aggregate {
  const frequencies = new Map<string, number>();
  for (const v of votes) for (const w of v.words) frequencies.set(w, (frequencies.get(w) || 0) + 1);
  return {
    total: votes.length,
    poll: scene.poll.options.map((o) => {
      const count = votes.filter((v) => v.optionIds.includes(o.id)).length;
      return {
        ...o,
        count,
        percentage: votes.length ? Math.round((count / votes.length) * 1000) / 10 : 0,
      };
    }),
    words: [...frequencies]
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word, 'fr')),
  };
}
