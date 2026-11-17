import { isArabicText, judgeGuess } from "@/lib/arabic";
import type { Puzzle, Title } from "@/lib/content-types";
import { DEFAULT_TEAMS } from "./teams";
import type {
  FeedItem,
  GameState,
  GuessResult,
  HintKind,
  Player,
  PublicClue,
  PublicState,
  RoundState,
  Settings,
  Stage,
} from "./types";

export const MAX_MISSES = 3;
export const STAGE_POINTS: Record<Stage, number> = { 1: 100, 2: 70, 3: 40 };
export const HINT_PENALTY = 10;
export const FIRST_BONUS = 20;
export const MIN_POINTS = 10;
export const MAX_PLAYERS = 30;

/** Clue indexes visible at each stage: 1 → clues 1–3, 2 → + clue 4, 3 → + leads 5–6. */
export const STAGE_VISIBLE: Record<Stage, number> = { 1: 3, 2: 4, 3: 6 };

export type TitleMap = Record<string, Title>;

export function pointsFor(round: RoundState, isFirst: boolean, stage: Stage = round.stage): number {
  const hints = Object.values(round.hints).filter(Boolean).length;
  const base = Math.max(MIN_POINTS, STAGE_POINTS[stage] - hints * HINT_PENALTY);
  return base + (isFirst ? FIRST_BONUS : 0);
}

export function shuffle<T>(arr: T[], rand = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Pick titles for a game, preferring ones not played recently on this device. */
export function pickTitles(
  all: Title[],
  settings: Settings,
  recentlyUsed: string[] = [],
  rand = Math.random,
): string[] {
  const pool = all.filter(
    (t) =>
      (settings.pool === "all" || t.type === settings.pool) &&
      (settings.difficulty === "any" || t.difficulty === settings.difficulty),
  );
  const used = new Set(recentlyUsed);
  const fresh = shuffle(pool.filter((t) => !used.has(t.id)), rand);
  const stale = shuffle(pool.filter((t) => used.has(t.id)), rand);
  return [...fresh, ...stale].slice(0, settings.rounds).map((t) => t.id);
}

/** First stage that shows at least one real clue (some titles have empty supporting slots). */
function firstStage(title: Title): Stage {
  for (const s of [1, 2, 3] as Stage[]) {
    if (title.clues.slice(0, STAGE_VISIBLE[s]).some(Boolean)) return s;
  }
  return 3;
}

export function createGame(room: string, host: Omit<Player, "score" | "joinedAt">, settings: Settings, now: number): GameState {
  return {
    room,
    hostId: host.id,
    settings,
    phase: "lobby",
    players: { [host.id]: { ...host, score: 0, joinedAt: now } },
    teams: settings.game === "charades" ? DEFAULT_TEAMS : undefined,
    titleIds: [],
    round: null,
    version: 1,
  };
}

const bump = (s: GameState): GameState => ({ ...s, version: s.version + 1 });

export function joinPlayer(state: GameState, p: { id: string; name: string; avatar: string; key?: string }, now: number): GameState {
  const existing = state.players[p.id];
  const name = p.name.trim().slice(0, 20) || "لاعب";
  const key = p.key && p.key.length < 400 ? p.key : undefined;
  if (existing) {
    if (existing.name === name && existing.avatar === p.avatar && existing.key === key) return state;
    return bump({ ...state, players: { ...state.players, [p.id]: { ...existing, name, avatar: p.avatar, key } } });
  }
  if (Object.keys(state.players).length >= MAX_PLAYERS) return state;
  // Same display name as someone else → add a number so the scoreboard stays readable.
  const taken = new Set(Object.values(state.players).map((x) => x.name));
  let unique = name;
  for (let n = 2; taken.has(unique); n++) unique = `${name} ${n}`;
  return bump({
    ...state,
    players: { ...state.players, [p.id]: { id: p.id, name: unique, avatar: p.avatar, score: 0, joinedAt: now, key } },
  });
}

export function removePlayer(state: GameState, playerId: string): GameState {
  if (playerId === state.hostId || !state.players[playerId]) return state;
  const players = { ...state.players };
  delete players[playerId];
  return bump({ ...state, players });
}

function newRound(index: number, title: Title, now: number): RoundState {
  return {
    index,
    titleId: title.id,
    stage: firstStage(title),
    stageAt: now,
    hints: { genre: false, year: false, type: false },
    revealed: false,
    correct: {},
    firstId: null,
    misses: {},
    feed: [],
  };
}

export function startGame(state: GameState, titleIds: string[], titles: TitleMap, now: number): GameState {
  if (!titleIds.length) return state;
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, score: 0 }]));
  return bump({ ...state, phase: "round", players, titleIds, round: newRound(0, titles[titleIds[0]], now) });
}

export function nextStage(state: GameState, now: number): GameState {
  const r = state.round;
  if (!r || r.revealed || r.stage === 3) return state;
  return bump({ ...state, round: { ...r, stage: (r.stage + 1) as Stage, stageAt: now } });
}

export function showHint(state: GameState, kind: HintKind): GameState {
  const r = state.round;
  if (!r || r.revealed || r.hints[kind]) return state;
  return bump({ ...state, round: { ...r, hints: { ...r.hints, [kind]: true } } });
}

export function revealAnswer(state: GameState): GameState {
  const r = state.round;
  if (!r || r.revealed) return state;
  return bump({ ...state, round: { ...r, revealed: true, stage: 3 } });
}

export function nextRound(state: GameState, titles: TitleMap, now: number): GameState {
  const r = state.round;
  if (!r) return state;
  const index = r.index + 1;
  if (index >= state.titleIds.length) return bump({ ...state, phase: "final" });
  return bump({ ...state, round: newRound(index, titles[state.titleIds[index]], now) });
}

/** Replace the current title with an unused one (host skips a title nobody could know). */
export function skipTitle(state: GameState, replacementId: string | undefined, titles: TitleMap, now: number): GameState {
  const r = state.round;
  if (!r || r.revealed || !replacementId) return state;
  const titleIds = [...state.titleIds];
  titleIds[r.index] = replacementId;
  return bump({ ...state, titleIds, round: newRound(r.index, titles[replacementId], now) });
}

function award(state: GameState, playerId: string, points: number): GameState {
  const r = state.round!;
  const correct = { ...r.correct, [playerId]: points };
  const player = state.players[playerId];
  const players = { ...state.players, [playerId]: { ...player, score: player.score + points } };
  const everyone = Object.keys(players).every((id) => id in correct);
  return {
    ...state,
    players,
    round: { ...r, correct, firstId: r.firstId ?? playerId, revealed: everyone || r.revealed },
  };
}

export function submitGuess(
  state: GameState,
  titles: TitleMap,
  g: { playerId: string; guessId: string; roundIndex: number; text: string },
  now: number,
): { state: GameState; result: GuessResult } {
  const r = state.round;
  const misses = r?.misses[g.playerId] ?? 0;
  const res = (verdict: GuessResult["verdict"], points = 0, left = MAX_MISSES - misses) => ({
    to: g.playerId,
    guessId: g.guessId,
    verdict,
    points,
    attemptsLeft: Math.max(0, left),
  });
  if (!r || state.phase !== "round" || r.revealed || g.roundIndex !== r.index || !state.players[g.playerId]) {
    return { state, result: res("late") };
  }
  if (g.playerId in r.correct) return { state, result: res("already") };
  if (misses >= MAX_MISSES) return { state, result: res("locked", 0, 0) };
  const text = g.text.trim().slice(0, 60);
  if (!text || !isArabicText(text)) return { state, result: res("invalid") };

  const title = titles[r.titleId];
  const { verdict } = judgeGuess(text, [title.titleAr, ...title.aliases]);
  const item: FeedItem = { id: g.guessId, playerId: g.playerId, text, verdict, points: 0, stage: r.stage, at: now };

  if (verdict === "correct") {
    const points = pointsFor(r, r.firstId === null);
    item.points = points;
    let next = award(state, g.playerId, points);
    next = { ...next, round: { ...next.round!, feed: [item, ...r.feed].slice(0, 50) } };
    return { state: bump(next), result: res("correct", points) };
  }
  const round: RoundState = {
    ...r,
    misses: { ...r.misses, [g.playerId]: misses + 1 },
    feed: [item, ...r.feed].slice(0, 50),
  };
  return { state: bump({ ...state, round }), result: res(verdict, 0, MAX_MISSES - misses - 1) };
}

/** Host overrides a near-miss: award points as if it was correct at the stage it was typed. */
export function acceptGuess(state: GameState, feedId: string): { state: GameState; result: GuessResult | null } {
  const r = state.round;
  const item = r?.feed.find((f) => f.id === feedId);
  if (!r || !item || item.verdict === "correct" || item.verdict === "accepted" || item.playerId in r.correct) {
    return { state, result: null };
  }
  if (!state.players[item.playerId]) return { state, result: null };
  const points = pointsFor(r, r.firstId === null, item.stage);
  let next = award(state, item.playerId, points);
  next = {
    ...next,
    round: {
      ...next.round!,
      feed: next.round!.feed.map((f) => (f.id === feedId ? { ...f, verdict: "accepted" as const, points } : f)),
    },
  };
  return {
    state: bump(next),
    result: { to: item.playerId, guessId: feedId, verdict: "correct", points, attemptsLeft: 0 },
  };
}

/** The part of the public state every game shares. `roundPoints` says what a player earned this round (or null). */
export function basePublic(state: GameState, roundPoints: (playerId: string) => number | null = () => null): PublicState {
  const players = Object.values(state.players)
    .sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt)
    .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, roundPoints: roundPoints(p.id), team: p.team }));
  return { room: state.room, hostId: state.hostId, phase: state.phase, players, round: null, teams: state.teams, settings: state.settings, version: state.version };
}

export function toPublic(state: GameState, titles: TitleMap, now: number): PublicState {
  const r = state.round;
  const title = r ? titles[r.titleId] : null;
  let round: PublicState["round"] = null;
  if (r && title) {
    const mode = (title as Puzzle).mode;
    const visible = r.revealed ? 6 : STAGE_VISIBLE[r.stage];
    const clues: PublicClue[] = mode === "quote" ? [] : title.clues.map((c, i) => (i < visible ? c : "hidden"));
    const auto = state.settings.autoRevealSec;
    // Quote game: the year/genre/type come with stage 2 for free; link game has no hints.
    const free = mode === "quote" && (r.stage >= 2 || r.revealed);
    const hintOn = (k: HintKind) => mode !== "link" && (r.hints[k] || r.revealed || free);
    round = {
      index: r.index,
      total: state.titleIds.length,
      stage: r.stage,
      clues,
      hints: {
        genres: hintOn("genre") ? title.genres : undefined,
        year: hintOn("year") ? title.year : undefined,
        type: hintOn("type") ? title.type : undefined,
      },
      correctIds: Object.keys(r.correct),
      firstId: r.firstId,
      misses: r.misses,
      revealed: r.revealed,
      answer: r.revealed ? { titleAr: title.titleAr, year: title.year, type: title.type, genres: title.genres } : undefined,
      autoMsLeft: auto && !r.revealed ? Math.max(0, r.stageAt + auto * 1000 - now) : null,
      mode,
      quote: mode === "quote" ? (title as Puzzle).quote : undefined,
      by: mode === "quote" && (r.revealed || r.stage >= 3) ? (title.clues[0] ?? null) : undefined,
      initials:
        mode === "link" && (r.revealed || r.stage >= 3)
          ? title.titleAr.split(" ").map((w) => w[0]).join(" . ")
          : undefined,
    };
  }
  return { ...basePublic(state, (id) => (r && id in r.correct ? r.correct[id] : null)), round };
}
