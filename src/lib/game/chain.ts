import { judgeGuess, normalizeArabic } from "@/lib/arabic";
import { basePublic } from "./engine";
import type { ChainLink, ChainState, GameState, GuessResult, PublicChain, PublicState } from "./types";

/**
 * Chain: title → actor of it → another title of that actor → … Players take turns; a timeout or five
 * refused answers costs a heart. Pure, like engine.ts: the data (who was in what) is passed in as `ChainData`.
 */
export const CHAIN_SECONDS = 15;
export const HEARTS = 3;
export const MAX_TRIES = 5;
export const LINK_POINTS = 10;
export const WIN_BONUS = 50;
export const GRACE_MS = 1000;

export interface ChainData {
  /** Names a player might type for a work / actor (Arabic, English, aliases). */
  names(id: string): string[];
  label(id: string): string;
  poster(id: string): string | undefined;
  /** Actor ids in the cast of a work, and works an actor appears in. */
  castOf(workId: string): string[];
  worksOf(actorId: string): string[];
  /** Famous works that make good starting points. */
  starts(): string[];
}

const bump = (s: GameState): GameState => ({ ...s, version: s.version + 1 });
const norm = normalizeArabic;

export const expectOf = (c: ChainState): "actor" | "work" => (c.links[c.links.length - 1].kind === "work" ? "actor" : "work");
const alive = (state: GameState, c: ChainState) =>
  Object.values(state.players)
    .filter((p) => p.id in c.hearts && !c.out.includes(p.id))
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((p) => p.id);

export function startChain(state: GameState, data: ChainData, now: number, rand = Math.random): GameState {
  const starts = data.starts();
  if (!starts.length) return state;
  const first = starts[Math.floor(rand() * starts.length)];
  const ids = Object.values(state.players).sort((a, b) => a.joinedAt - b.joinedAt).map((p) => p.id);
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0 }]));
  const chain: ChainState = {
    links: [{ kind: "work", id: first, label: data.label(first), by: null, poster: data.poster(first) }],
    turnOf: ids[Math.floor(rand() * ids.length)],
    startedAt: now,
    deadline: now + CHAIN_SECONDS * 1000,
    hearts: Object.fromEntries(ids.map((id) => [id, HEARTS])),
    out: [],
    rejected: [],
    used: [first],
    over: false,
    winnerId: null,
    event: null,
  };
  return bump({ ...state, phase: "round", players, round: null, titleIds: [], chain });
}

/** Pass the turn to the next player still in, with a fresh clock. */
function pass(state: GameState, c: ChainState, now: number, patch: Partial<ChainState> = {}): GameState {
  const next = { ...c, ...patch };
  const order = alive(state, next);
  const at = order.indexOf(c.turnOf);
  const turnOf = order.length ? order[(at + 1) % order.length] : c.turnOf;
  return bump({ ...state, chain: { ...next, turnOf, startedAt: now, deadline: now + CHAIN_SECONDS * 1000, rejected: [] } });
}

/** A turn ended badly (timeout or too many wrong tries): lose a heart, maybe the game. */
function loseHeart(state: GameState, c: ChainState, now: number): GameState {
  const id = c.turnOf;
  const hearts = { ...c.hearts, [id]: Math.max(0, (c.hearts[id] ?? 1) - 1) };
  const eliminated = hearts[id] === 0;
  const out = eliminated ? [...c.out, id] : c.out;
  const eventN = (c.event?.n ?? 0) + 1;
  const withHeart = { ...c, hearts, out, event: { type: eliminated ? ("out" as const) : ("timeout" as const), playerId: id, n: eventN } };
  const left = alive(state, withHeart);
  const solo = Object.keys(c.hearts).length === 1;
  if (left.length === 0 || (!solo && left.length <= 1)) {
    const winnerId = !solo && left.length === 1 ? left[0] : null;
    const players = winnerId ? { ...state.players, [winnerId]: { ...state.players[winnerId], score: state.players[winnerId].score + WIN_BONUS } } : state.players;
    return bump({ ...state, players, chain: { ...withHeart, over: true, winnerId, rejected: [], event: { type: "win", playerId: winnerId ?? id, n: eventN + 1 } } });
  }
  return pass(state, withHeart, now);
}

/** The clock ran out for the player whose turn it is. */
export function timeoutTurn(state: GameState, now: number): GameState {
  const c = state.chain;
  if (!c || c.over) return state;
  return loseHeart(state, c, now);
}

/** Add a link and give the turn to the next player (+10 points for the one who made it). */
function addLink(state: GameState, c: ChainState, playerId: string, link: ChainLink, key: string, now: number): GameState {
  const p = state.players[playerId];
  const players = p ? { ...state.players, [playerId]: { ...p, score: p.score + LINK_POINTS } } : state.players;
  return pass({ ...state, players }, c, now, { links: [...c.links, link], used: [...c.used, key] });
}

export function submitLink(
  state: GameState,
  data: ChainData,
  g: { playerId: string; guessId: string; roundIndex: number; text: string },
  now: number,
): { state: GameState; result: GuessResult } {
  const c = state.chain;
  const res = (verdict: GuessResult["verdict"], points = 0): GuessResult => ({
    to: g.playerId,
    guessId: g.guessId,
    verdict,
    points,
    attemptsLeft: c ? Math.max(0, MAX_TRIES - c.rejected.length) : 0,
  });
  if (!c || c.over || state.phase !== "round" || g.playerId !== c.turnOf || g.roundIndex !== c.links.length || now > c.deadline + GRACE_MS) {
    return { state, result: res("late") };
  }
  const text = g.text.trim().slice(0, 60);
  if (!text) return { state, result: res("invalid") };

  const last = c.links[c.links.length - 1];
  const kind = expectOf(c);
  // Candidates: cast of the current title, or the other titles of the current actor (nothing known for host-accepted ones).
  const ids = last.kind === "work" ? data.castOf(last.id) : last.id.startsWith("x:") ? [] : data.worksOf(last.id);
  let best = { score: 0, id: "" };
  for (const id of ids) {
    const { score } = judgeGuess(text, data.names(id));
    if (score > best.score) best = { score, id };
  }
  if (best.score >= 0.8 && (c.used.includes(best.id) || c.used.includes(`x:${norm(data.label(best.id))}`))) {
    return { state, result: res("duplicate") }; // already in the chain: no penalty
  }
  if (best.score >= 0.8) {
    const link: ChainLink = { kind: kind === "actor" ? "actor" : "work", id: best.id, label: data.label(best.id), by: g.playerId, poster: data.poster(best.id) };
    return { state: addLink(state, c, g.playerId, link, best.id, now), result: res("correct", LINK_POINTS) };
  }
  const rejected = [...c.rejected, { id: g.guessId, playerId: g.playerId, text }];
  const verdict = best.score >= 0.65 ? "close" : "wrong";
  if (rejected.length >= MAX_TRIES) {
    return { state: loseHeart(state, { ...c, rejected }, now), result: { ...res(verdict), attemptsLeft: 0 } };
  }
  return { state: bump({ ...state, chain: { ...c, rejected } }), result: { ...res(verdict), attemptsLeft: MAX_TRIES - rejected.length } };
}

/** Host override: the refused answer was right (our data has gaps). */
export function acceptLink(state: GameState, entryId: string, now: number): { state: GameState; result: GuessResult | null } {
  const c = state.chain;
  const r = c?.rejected.find((x) => x.id === entryId);
  if (!c || !r || c.over) return { state, result: null };
  const key = `x:${norm(r.text)}`;
  if (c.used.includes(key)) return { state, result: null };
  const link: ChainLink = { kind: expectOf(c), id: key, label: r.text, by: r.playerId };
  return {
    state: addLink(state, c, r.playerId, link, key, now),
    result: { to: r.playerId, guessId: r.id, verdict: "correct", points: LINK_POINTS, attemptsLeft: 0 },
  };
}

export function endChain(state: GameState): GameState {
  return state.chain ? bump({ ...state, phase: "final" }) : state;
}

export function toPublicChain(state: GameState, now: number): PublicChain | null {
  const c = state.chain;
  if (!c) return null;
  return {
    links: c.links.slice(-12),
    count: c.links.length,
    turnOf: c.turnOf,
    expect: expectOf(c),
    msLeft: c.over ? null : Math.max(0, c.deadline - now),
    totalMs: CHAIN_SECONDS * 1000,
    hearts: c.hearts,
    out: c.out,
    triesLeft: MAX_TRIES - c.rejected.length,
    over: c.over,
    winnerId: c.winnerId,
    event: c.event,
  };
}

export function publicOf(state: GameState, now: number): PublicState {
  return { ...basePublic(state), chain: toPublicChain(state, now) };
}
