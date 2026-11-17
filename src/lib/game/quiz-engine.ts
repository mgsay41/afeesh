import { basePublic } from "./engine";
import type { GameState, PublicQuiz, PublicState, QuizQuestion, QuizRound } from "./types";

/** Quiz games (before/after, odd one out): everyone taps a choice, the host reveals at the deadline. Pure, like engine.ts. */
export const QUIZ_POINTS = 100;
export const QUIZ_SPEED_MAX = 50;
/** Taps sent just before the deadline can arrive a moment late. */
export const QUIZ_GRACE_MS = 1000;

const bump = (s: GameState): GameState => ({ ...s, version: s.version + 1 });

/** 100 for a right tap + up to 50 for speed (the share of the time that was still left). */
export function quizPoints(q: QuizQuestion, tapAt: number, startedAt: number): number {
  const total = q.seconds * 1000;
  const left = Math.max(0, startedAt + total - tapAt);
  return QUIZ_POINTS + Math.floor((QUIZ_SPEED_MAX * Math.min(left, total)) / total);
}

const newRound = (index: number, q: QuizQuestion, now: number): QuizRound => ({
  index,
  step: "playing",
  startedAt: now,
  deadline: now + q.seconds * 1000,
  picks: {},
  points: {},
});

export function startQuiz(state: GameState, questions: QuizQuestion[], now: number): GameState {
  if (!questions.length) return state;
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0 }]));
  return bump({
    ...state,
    phase: "round",
    players,
    round: null,
    questions,
    titleIds: questions.map((_, i) => String(i)),
    quiz: newRound(0, questions[0], now),
  });
}

/** One tap per player per question. Returns the same state when the tap doesn't count. */
export function submitPick(
  state: GameState,
  g: { playerId: string; roundIndex: number; choice: number },
  now: number,
): GameState {
  const r = state.quiz;
  const q = state.questions?.[r?.index ?? -1];
  if (!r || !q || state.phase !== "round" || r.step !== "playing" || g.roundIndex !== r.index) return state;
  if (!state.players[g.playerId] || g.playerId in r.picks) return state;
  if (!Number.isInteger(g.choice) || g.choice < 0 || g.choice >= q.choices.length) return state;
  if (now > r.deadline + QUIZ_GRACE_MS) return state;
  const next: QuizRound = { ...r, picks: { ...r.picks, [g.playerId]: { choice: g.choice, at: Math.min(now, r.deadline) } } };
  const everyone = Object.keys(state.players).every((id) => id in next.picks);
  return everyone ? revealQuiz({ ...state, quiz: next }) : bump({ ...state, quiz: next });
}

/** Time is up (or everyone answered): score the taps and show the answer. */
export function revealQuiz(state: GameState): GameState {
  const r = state.quiz;
  const q = state.questions?.[r?.index ?? -1];
  if (!r || !q || r.step !== "playing") return state;
  const points: Record<string, number> = {};
  const players = { ...state.players };
  for (const [id, pick] of Object.entries(r.picks)) {
    if (pick.choice !== q.answer || !players[id]) continue;
    points[id] = quizPoints(q, pick.at, r.startedAt);
    players[id] = { ...players[id], score: players[id].score + points[id] };
  }
  return bump({ ...state, players, quiz: { ...r, step: "reveal", points } });
}

export function nextQuiz(state: GameState, now: number): GameState {
  const r = state.quiz;
  if (!r || r.step !== "reveal") return state;
  const index = r.index + 1;
  if (index >= (state.questions?.length ?? 0)) return bump({ ...state, phase: "final" });
  return bump({ ...state, quiz: newRound(index, state.questions![index], now) });
}

export function toPublicQuiz(state: GameState, now: number): PublicQuiz | null {
  const r = state.quiz;
  const q = state.questions?.[r?.index ?? -1];
  if (!r || !q) return null;
  const out: PublicQuiz = {
    index: r.index,
    total: state.questions!.length,
    step: r.step,
    prompt: q.prompt,
    choices: q.choices,
    msLeft: r.step === "playing" ? Math.max(0, r.deadline - now) : null,
    totalMs: q.seconds * 1000,
    answered: Object.keys(r.picks),
  };
  if (r.step === "reveal") {
    out.reveal = {
      answer: q.answer,
      why: q.why,
      picks: Object.fromEntries(Object.entries(r.picks).map(([id, p]) => [id, p.choice])),
      points: r.points,
    };
  }
  return out;
}

export function publicOf(state: GameState, now: number): PublicState {
  const r = state.quiz;
  return {
    ...basePublic(state, (id) => (r?.step === "reveal" ? (r.points[id] ?? 0) : null)),
    quiz: toPublicQuiz(state, now),
  };
}
