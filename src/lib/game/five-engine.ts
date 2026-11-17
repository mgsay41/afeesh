import { judgeGuess, normalizeArabic } from "@/lib/arabic";
import type { FilmActor } from "@/lib/content-types";
import { toPublic, type TitleMap } from "./engine";
import type { FiveEntry, FiveRound, FiveStep, GameState, GuessResult, PublicFive, PublicState } from "./types";

/** Game 2 rules. Pure functions, like engine.ts: the host runs them and broadcasts the public view. */
export const FIVE_SECONDS = 30;
/** The host picks the length of a round (settings.timeSec); 30 is the default. */
export const FIVE_TIME_OPTIONS = [15, 20, 30, 45, 60, 90];
export const fiveSeconds = (s: GameState) => s.settings.timeSec ?? FIVE_SECONDS;
export const FIVE_TARGET = 5;
export const FIVE_POINTS = 20;
export const FIVE_BONUS = 20;
export const TIME_BONUS_MAX = 10;
/** Entries sent just before the deadline can arrive a moment late. */
export const GRACE_MS = 1000;
export const MAX_ENTRIES = 15;

export type ActorMap = Record<string, FilmActor>;

const bump = (s: GameState): GameState => ({ ...s, version: s.version + 1 });
const isCorrect = (e: FiveEntry) => e.verdict === "correct" || e.verdict === "accepted";
const norm = normalizeArabic;

/** Correct titles of one player, oldest first. */
const correctOf = (r: FiveRound, playerId: string) =>
  r.entries.filter((e) => e.playerId === playerId && isCorrect(e)).sort((a, b) => a.at - b.at);

/** 20 per title, +20 for all five, plus up to +10 for how early the 5th landed (its original send time), whatever the round length. */
export function fivePoints(r: FiveRound, playerId: string): number {
  const mine = correctOf(r, playerId).slice(0, FIVE_TARGET);
  let pts = mine.length * FIVE_POINTS;
  if (mine.length === FIVE_TARGET) {
    const total = Math.max(1, r.deadline - r.startedAt);
    pts += FIVE_BONUS + Math.min(TIME_BONUS_MAX, Math.floor((TIME_BONUS_MAX * Math.max(0, r.deadline - mine[FIVE_TARGET - 1].at)) / total));
  }
  return pts;
}

/** Swap in a changed round and move every player's score by the difference. */
function withRound(state: GameState, next: FiveRound): GameState {
  const prev = state.five!;
  const players = Object.fromEntries(
    Object.entries(state.players).map(([id, p]) => [id, { ...p, score: p.score + fivePoints(next, id) - fivePoints(prev, id) }]),
  );
  return bump({ ...state, players, five: next });
}

const newRound = (index: number, actorId: string): FiveRound => ({
  index,
  actorId,
  step: "ready",
  startedAt: 0,
  deadline: 0,
  entries: [],
});

export function pickActors(all: FilmActor[], rounds: number, recentlyUsed: string[] = [], rand = Math.random): string[] {
  const shuffle = <T>(a: T[]) => a.map((x) => [rand(), x] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const used = new Set(recentlyUsed);
  return [...shuffle(all.filter((a) => !used.has(a.id))), ...shuffle(all.filter((a) => used.has(a.id)))]
    .slice(0, rounds)
    .map((a) => a.id);
}

export function startFiveGame(state: GameState, actorIds: string[]): GameState {
  if (!actorIds.length) return state;
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0 }]));
  return bump({ ...state, phase: "round", players, titleIds: actorIds, round: null, five: newRound(0, actorIds[0]) });
}

const setStep = (state: GameState, from: FiveStep[], patch: Partial<FiveRound>): GameState => {
  const r = state.five;
  if (!r || !from.includes(r.step)) return state;
  return bump({ ...state, five: { ...r, ...patch } });
};

/** Host taps start: the actor appears and the 30 seconds begin. */
export const beginFiveRound = (state: GameState, now: number) =>
  setStep(state, ["ready"], { step: "playing", startedAt: now, deadline: now + fiveSeconds(state) * 1000 });
/** Host changes the round length (this round if it hasn't started, and the rounds after it). */
export function setFiveTime(state: GameState, sec: number): GameState {
  if (!FIVE_TIME_OPTIONS.includes(sec) || state.five?.step === "playing") return state;
  return bump({ ...state, settings: { ...state.settings, timeSec: sec } });
}
/** Time is up (or the host ends it early): the host can now fix answers. */
export const endFiveRound = (state: GameState) => setStep(state, ["playing"], { step: "review" });
export const showFiveResults = (state: GameState) => setStep(state, ["review"], { step: "results" });

export function nextFiveRound(state: GameState): GameState {
  const r = state.five;
  if (!r || r.step !== "results") return state;
  const index = r.index + 1;
  if (index >= state.titleIds.length) return bump({ ...state, phase: "final" });
  return bump({ ...state, five: newRound(index, state.titleIds[index]) });
}

/** Everyone reached five titles → no reason to keep the clock running. */
const allDone = (state: GameState, r: FiveRound) =>
  Object.keys(state.players).every((id) => correctOf(r, id).length >= FIVE_TARGET);

/**
 * Best matching work for a typed title. `remembered` are titles the host accepted before for this actor;
 * they count as extra works so a gap in our data is only ever fixed once.
 */
export function matchWork(actor: FilmActor, text: string, remembered: string[] = []) {
  let best = { score: 0, workId: null as string | null, label: text };
  const candidates = [
    ...actor.works.map((w) => ({ id: w.id, label: w.ar, answers: [w.ar, w.en ?? "", ...(w.alt ?? [])].filter(Boolean) })),
    ...remembered.map((t) => ({ id: `x:${norm(t)}`, label: t, answers: [t] })),
  ];
  for (const c of candidates) {
    const { score } = judgeGuess(text, c.answers);
    if (score > best.score) best = { score, workId: c.id, label: c.label };
  }
  return best;
}

export function submitEntry(
  state: GameState,
  actors: ActorMap,
  g: { playerId: string; guessId: string; roundIndex: number; text: string },
  now: number,
  remembered: string[] = [],
): { state: GameState; result: GuessResult } {
  const r = state.five;
  const mine = r?.entries.filter((e) => e.playerId === g.playerId) ?? [];
  const res = (verdict: GuessResult["verdict"], points = 0): GuessResult => ({
    to: g.playerId,
    guessId: g.guessId,
    verdict,
    points,
    attemptsLeft: Math.max(0, MAX_ENTRIES - mine.length),
  });
  if (
    !r ||
    state.phase !== "round" ||
    r.step !== "playing" ||
    g.roundIndex !== r.index ||
    !state.players[g.playerId] ||
    now > r.deadline + GRACE_MS
  ) {
    return { state, result: res("late") };
  }
  if (correctOf(r, g.playerId).length >= FIVE_TARGET) return { state, result: res("already") };
  if (mine.length >= MAX_ENTRIES) return { state, result: res("locked") };
  const text = g.text.trim().slice(0, 60);
  if (!text) return { state, result: res("invalid") };
  const key = norm(text);
  if (mine.some((e) => norm(e.text) === key)) return { state, result: res("duplicate") };

  const m = matchWork(actors[r.actorId], text, remembered);
  const verdict = m.score >= 0.8 ? "correct" : m.score >= 0.65 ? "close" : "wrong";
  if (verdict === "correct" && mine.some((e) => isCorrect(e) && e.workId === m.workId)) {
    return { state, result: res("duplicate") }; // same film, different spelling
  }
  const entry: FiveEntry = {
    id: g.guessId,
    playerId: g.playerId,
    text,
    verdict,
    workId: verdict === "correct" ? m.workId : null,
    label: verdict === "correct" ? m.label : text,
    at: now,
  };
  const next = { ...r, entries: [entry, ...r.entries] };
  let out = withRound(state, next);
  const gained = fivePoints(next, g.playerId) - fivePoints(r, g.playerId);
  if (verdict === "correct" && allDone(out, next)) out = { ...out, five: { ...next, step: "review" } };
  return { state: out, result: { ...res(verdict, gained), attemptsLeft: MAX_ENTRIES - mine.length - 1 } };
}

/**
 * Host override: the title is right even though our data says no. Also accepts the same title typed by
 * other players this round. Returns a result per affected player so their phones update.
 */
export function acceptEntry(state: GameState, entryId: string): { state: GameState; accepted: FiveEntry[]; results: GuessResult[] } {
  const r = state.five;
  const target = r?.entries.find((e) => e.id === entryId);
  const none = { state, accepted: [], results: [] };
  if (!r || !target || isCorrect(target)) return none;

  const accepted: FiveEntry[] = [];
  const entries = r.entries.map((e) => {
    const same = e.id === target.id || (!isCorrect(e) && judgeGuess(e.text, [target.text]).verdict === "correct");
    if (!same || isCorrect(e)) return e;
    const workId = `x:${norm(target.text)}`;
    const mine = [...r.entries, ...accepted].filter((x) => x.playerId === e.playerId);
    const full = mine.filter(isCorrect).length >= FIVE_TARGET;
    if (full || mine.some((x) => isCorrect(x) && x.workId === workId)) return e;
    const a: FiveEntry = { ...e, verdict: "accepted", workId, label: target.text };
    accepted.push(a);
    return a;
  });
  if (!accepted.length) return none;
  const next = { ...r, entries };
  const results = accepted.map((a): GuessResult => ({
    to: a.playerId,
    guessId: a.id,
    verdict: "correct",
    points: fivePoints(next, a.playerId) - fivePoints(r, a.playerId),
    attemptsLeft: 0,
  }));
  return { state: withRound(state, next), accepted, results };
}

/** Undo a host acceptance (mis-tap). Only the entry that was accepted; its points are removed with it. */
export function undoEntry(state: GameState, entryId: string): { state: GameState; result: GuessResult | null } {
  const r = state.five;
  const e = r?.entries.find((x) => x.id === entryId);
  if (!r || !e || e.verdict !== "accepted") return { state, result: null };
  const next = { ...r, entries: r.entries.map((x) => (x.id === entryId ? { ...x, verdict: "wrong" as const, workId: null, label: x.text } : x)) };
  return {
    state: withRound(state, next),
    result: { to: e.playerId, guessId: e.id, verdict: "wrong", points: 0, attemptsLeft: 0 },
  };
}

export function toPublicFive(state: GameState, actors: ActorMap, now: number): PublicFive | null {
  const r = state.five;
  if (!r) return null;
  const actor = actors[r.actorId];
  const counts = Object.fromEntries(Object.keys(state.players).map((id) => [id, Math.min(FIVE_TARGET, correctOf(r, id).length)]));
  const out: PublicFive = {
    index: r.index,
    total: state.titleIds.length,
    step: r.step,
    msLeft: r.step === "playing" ? Math.max(0, r.deadline - now) : null,
    totalMs: fiveSeconds(state) * 1000,
    counts,
  };
  if (r.step !== "ready") out.actor = { nameAr: actor.nameAr, nameEn: actor.nameEn, photo: actor.photo };
  if (r.step === "results") {
    const titles: Record<string, string[]> = {};
    const said = new Set<string>();
    for (const e of r.entries.filter(isCorrect).sort((a, b) => a.at - b.at)) {
      (titles[e.playerId] ??= []).push(e.label);
      said.add(norm(e.label));
    }
    out.results = {
      titles,
      missed: actor.works.filter((w) => !said.has(norm(w.ar))).slice(0, 5).map((w) => w.ar),
    };
  }
  return out;
}

/** The public state for either game. */
export function publicOf(state: GameState, titles: TitleMap, actors: ActorMap, now: number): PublicState {
  if (state.settings.game !== "five") return toPublic(state, titles, now);
  const base = toPublic(state, titles, now);
  const r = state.five;
  return {
    ...base,
    five: toPublicFive(state, actors, now),
    players: base.players.map((p) => ({ ...p, roundPoints: r && r.step !== "ready" ? fivePoints(r, p.id) : null })),
  };
}
