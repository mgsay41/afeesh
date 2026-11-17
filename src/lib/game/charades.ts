import { isArabicText, judgeGuess } from "@/lib/arabic";
import { basePublic, shuffle } from "./engine";
import type { CharadesState, CharadesTitle, CharadesTurn, GameState, GuessResult, PublicCharades, PublicState } from "./types";

/** Charades: one performer per turn acts out a title, everyone else types guesses. Pure, like engine.ts. */
export const CHARADES_SECONDS = 60;
export const GUESS_POINTS = 50;
export const SPEED_MAX = 50;
export const PERFORMER_POINTS = 50;
export const MAX_GUESSES = 10;
export const GRACE_MS = 1000;

const bump = (s: GameState): GameState => ({ ...s, version: s.version + 1 });

/** Players who can perform: the host, and anyone whose phone can receive a private message. */
export const performers = (state: GameState) =>
  Object.values(state.players)
    .filter((p) => p.id === state.hostId || p.key)
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => p.id);

const newTurn = (index: number, performerId: string, title: CharadesTitle): CharadesTurn => ({
  index,
  performerId,
  title,
  step: "ready",
  startedAt: 0,
  deadline: 0,
  guessed: {},
  firstId: null,
  misses: {},
  skipped: false,
  performerPoints: 0,
});

export function pickCharades(all: CharadesTitle[], count: number, recentlyUsed: string[] = [], rand = Math.random): CharadesTitle[] {
  const used = new Set(recentlyUsed);
  return [...shuffle(all.filter((t) => !used.has(t.id)), rand), ...shuffle(all.filter((t) => used.has(t.id)), rand)].slice(0, count);
}

/** `deck` needs a few more titles than turns, for skips. */
export function startCharades(state: GameState, deck: CharadesTitle[], now: number): GameState {
  void now;
  const who = performers(state);
  const order = Array.from({ length: Math.max(1, state.settings.rounds) }, () => who).flat();
  if (!order.length || deck.length < order.length) return state;
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0 }]));
  const charades: CharadesState = { order, deck, cursor: 0, turn: newTurn(0, order[0], deck[0]) };
  return bump({ ...state, phase: "round", players, round: null, titleIds: order, charades });
}

/** The performer (or the host) starts the 60 seconds. */
export function beginTurn(state: GameState, now: number): GameState {
  const c = state.charades;
  if (!c || c.turn.step !== "ready") return state;
  return bump({ ...state, charades: { ...c, turn: { ...c.turn, step: "acting", startedAt: now, deadline: now + CHARADES_SECONDS * 1000 } } });
}

export const canSkip = (t: CharadesTurn) => !t.skipped && t.step !== "done" && Object.keys(t.guessed).length === 0;

/** One swap per turn, before anyone has guessed it. */
export function skipTitle(state: GameState): GameState {
  const c = state.charades;
  if (!c || !canSkip(c.turn) || c.cursor + 1 >= c.deck.length) return state;
  const cursor = c.cursor + 1;
  return bump({ ...state, charades: { ...c, cursor, turn: { ...c.turn, title: c.deck[cursor], skipped: true } } });
}

export function endTurn(state: GameState): GameState {
  const c = state.charades;
  if (!c || c.turn.step === "done") return state;
  return bump({ ...state, charades: { ...c, turn: { ...c.turn, step: "done" } } });
}

export function nextTurn(state: GameState): GameState {
  const c = state.charades;
  if (!c || c.turn.step !== "done") return state;
  // Skip performers who left.
  let index = c.turn.index + 1;
  while (index < c.order.length && !state.players[c.order[index]]) index++;
  if (index >= c.order.length) return bump({ ...state, phase: "final" });
  const cursor = c.cursor + 1;
  if (cursor >= c.deck.length) return bump({ ...state, phase: "final" });
  return bump({ ...state, charades: { ...c, cursor, turn: newTurn(index, c.order[index], c.deck[cursor]) } });
}

export function submitCharadesGuess(
  state: GameState,
  g: { playerId: string; guessId: string; roundIndex: number; text: string },
  now: number,
): { state: GameState; result: GuessResult } {
  const c = state.charades;
  const t = c?.turn;
  const misses = t?.misses[g.playerId] ?? 0;
  const res = (verdict: GuessResult["verdict"], points = 0): GuessResult => ({
    to: g.playerId,
    guessId: g.guessId,
    verdict,
    points,
    attemptsLeft: Math.max(0, MAX_GUESSES - misses),
  });
  if (!c || !t || state.phase !== "round" || t.step !== "acting" || g.roundIndex !== t.index || !state.players[g.playerId] || now > t.deadline + GRACE_MS) {
    return { state, result: res("late") };
  }
  if (g.playerId === t.performerId) return { state, result: res("locked") }; // the performer never guesses
  if (g.playerId in t.guessed) return { state, result: res("already") };
  if (misses >= MAX_GUESSES) return { state, result: res("locked") };
  const text = g.text.trim().slice(0, 60);
  if (!text || !isArabicText(text)) return { state, result: res("invalid") };

  const { verdict } = judgeGuess(text, [t.title.ar, ...(t.title.alt ?? [])]);
  if (verdict !== "correct") {
    const turn = { ...t, misses: { ...t.misses, [g.playerId]: misses + 1 } };
    return { state: bump({ ...state, charades: { ...c, turn } }), result: { ...res(verdict), attemptsLeft: MAX_GUESSES - misses - 1 } };
  }
  const left = Math.max(0, t.deadline - now);
  const points = GUESS_POINTS + Math.floor((SPEED_MAX * Math.min(left, CHARADES_SECONDS * 1000)) / (CHARADES_SECONDS * 1000));
  const performerGain = t.firstId === null ? PERFORMER_POINTS : 0;
  const turn: CharadesTurn = {
    ...t,
    guessed: { ...t.guessed, [g.playerId]: points },
    firstId: t.firstId ?? g.playerId,
    performerPoints: t.performerPoints + performerGain,
  };
  const players = { ...state.players, [g.playerId]: { ...state.players[g.playerId], score: state.players[g.playerId].score + points } };
  if (performerGain && players[t.performerId]) players[t.performerId] = { ...players[t.performerId], score: players[t.performerId].score + performerGain };
  let next = bump({ ...state, players, charades: { ...c, turn } });
  const guessers = Object.keys(players).filter((id) => id !== t.performerId);
  if (guessers.every((id) => id in turn.guessed)) next = endTurn(next);
  return { state: next, result: res("correct", points) };
}

export function toPublicCharades(state: GameState, now: number): PublicCharades | null {
  const c = state.charades;
  if (!c) return null;
  const t = c.turn;
  const out: PublicCharades = {
    index: t.index,
    total: c.order.length,
    performerId: t.performerId,
    step: t.step,
    msLeft: t.step === "acting" ? Math.max(0, t.deadline - now) : null,
    totalMs: CHARADES_SECONDS * 1000,
    kind: t.title.type,
    words: t.title.ar.trim().split(/\s+/).length,
    guessedIds: Object.keys(t.guessed),
    misses: t.misses,
    canSkip: canSkip(t),
  };
  if (t.step === "done") out.reveal = { title: t.title.ar, points: t.guessed, performerPoints: t.performerPoints };
  return out;
}

export function publicOf(state: GameState, now: number): PublicState {
  const t = state.charades?.turn;
  return {
    ...basePublic(state, (id) => (!t || t.step === "ready" ? null : id === t.performerId ? t.performerPoints : (t.guessed[id] ?? 0))),
    charades: toPublicCharades(state, now),
  };
}
