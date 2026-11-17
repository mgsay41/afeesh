import { isArabicText, judgeGuess } from "@/lib/arabic";
import { basePublic, shuffle } from "./engine";
import type { CharadesState, CharadesTitle, CharadesTurn, GameState, GuessResult, PublicCharades, PublicState } from "./types";

/**
 * Team charades («أفلام»). Two teams take turns: the acting team gets a title and picks who performs it
 * (everyone gets a turn before anyone repeats); the OTHER team types guesses. Pure, like engine.ts.
 */
export const CHARADES_SECONDS = 60;
/** The host picks the length of a turn (settings.timeSec). */
export const CHARADES_TIME_OPTIONS = [45, 60, 90, 120];
export const charadesSeconds = (s: GameState) => s.settings.timeSec ?? CHARADES_SECONDS;
export const GUESS_POINTS = 50;
export const SPEED_MAX = 50;
export const PERFORMER_POINTS = 50;
export const MAX_GUESSES = 10;
export const GRACE_MS = 1000;

const bump = (s: GameState): GameState => ({ ...s, version: s.version + 1 });

// ---------- Teams ----------

export const teamMembers = (s: GameState, team: number) =>
  Object.values(s.players)
    .filter((p) => p.team === team)
    .sort((a, b) => a.joinedAt - b.joinedAt);

/** A player picks (or is moved to) a team. Only before the game starts. */
export function setTeam(state: GameState, playerId: string, team: number): GameState {
  const p = state.players[playerId];
  if (!p || state.phase !== "lobby" || (team !== 0 && team !== 1) || p.team === team) return state;
  return bump({ ...state, players: { ...state.players, [playerId]: { ...p, team } } });
}

export function renameTeam(state: GameState, team: number, name: string): GameState {
  const names = [...(state.teams ?? [])];
  const clean = name.trim().slice(0, 16);
  if (!names[team] || !clean || names[team] === clean) return state;
  names[team] = clean;
  return bump({ ...state, teams: names });
}

/** Everyone without a team joins the smaller one (random on a tie). */
export function balance(state: GameState, rand = Math.random): GameState {
  const sizes = [teamMembers(state, 0).length, teamMembers(state, 1).length];
  const players = { ...state.players };
  let changed = false;
  for (const p of shuffle(Object.values(state.players).filter((x) => x.team === undefined), rand)) {
    const team = sizes[0] === sizes[1] ? (rand() < 0.5 ? 0 : 1) : sizes[0] < sizes[1] ? 0 : 1;
    players[p.id] = { ...p, team };
    sizes[team]++;
    changed = true;
  }
  return changed ? bump({ ...state, players }) : state;
}

/** Random, even split of everyone. */
export function shuffleTeams(state: GameState, rand = Math.random): GameState {
  const ids = shuffle(Object.keys(state.players), rand);
  const players = Object.fromEntries(Object.entries(state.players).map(([id, p]) => [id, { ...p, team: ids.indexOf(id) % 2 }]));
  return bump({ ...state, players });
}

// ---------- Turns ----------

const newTurn = (index: number, team: number, title: CharadesTitle): CharadesTurn => ({
  index,
  team,
  performerId: null,
  title,
  step: "pick",
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

/** Members of the acting team who may take the turn: those who performed the least so far. */
export function eligible(state: GameState): string[] {
  const c = state.charades;
  if (!c) return [];
  const members = teamMembers(state, c.turn.team);
  const least = Math.min(...members.map((p) => c.acted[p.id] ?? 0));
  return members.filter((p) => (c.acted[p.id] ?? 0) === least).map((p) => p.id);
}

/** Two turns per round (one per team). `deck` needs a few more titles than turns, for skips. */
export function startCharades(state: GameState, deck: CharadesTitle[], now: number, rand = Math.random): GameState {
  void now;
  const ready = balance(state, rand);
  const total = Math.max(1, state.settings.rounds) * 2;
  if (!teamMembers(ready, 0).length || !teamMembers(ready, 1).length || deck.length < total) return state;
  const players = Object.fromEntries(Object.entries(ready.players).map(([id, p]) => [id, { ...p, score: 0 }]));
  const first = rand() < 0.5 ? 0 : 1;
  const charades: CharadesState = { deck, cursor: 0, total, first, acted: {}, scores: [0, 0], turn: newTurn(0, first, deck[0]) };
  return bump({ ...ready, phase: "round", players, round: null, titleIds: [], charades });
}

/**
 * Take the turn as performer. A player takes it for themselves while it's open ("pick"); the host can
 * hand it to anyone on the acting team, even after someone took it (their phone may not show the title).
 */
export function claimPerformer(state: GameState, playerId: string, byHost = false): GameState {
  const c = state.charades;
  const t = c?.turn;
  const p = state.players[playerId];
  if (!c || !t || !p || p.team !== t.team || t.performerId === playerId) return state;
  if (byHost ? t.step !== "pick" && t.step !== "ready" : t.step !== "pick" || !eligible(state).includes(playerId)) return state;
  const acted = { ...c.acted };
  if (t.performerId) acted[t.performerId] = Math.max(0, (acted[t.performerId] ?? 1) - 1);
  acted[playerId] = (acted[playerId] ?? 0) + 1;
  return bump({ ...state, charades: { ...c, acted, turn: { ...t, performerId: playerId, step: "ready" } } });
}

/** The performer (or the host) starts the clock. */
export function beginTurn(state: GameState, now: number): GameState {
  const c = state.charades;
  if (!c || c.turn.step !== "ready") return state;
  return bump({ ...state, charades: { ...c, turn: { ...c.turn, step: "acting", startedAt: now, deadline: now + charadesSeconds(state) * 1000 } } });
}

export const canSkip = (t: CharadesTurn) =>
  !t.skipped && !!t.performerId && (t.step === "ready" || t.step === "acting") && Object.keys(t.guessed).length === 0;

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
  const index = c.turn.index + 1;
  const cursor = c.cursor + 1;
  if (index >= c.total || cursor >= c.deck.length) return bump({ ...state, phase: "final" });
  return bump({ ...state, charades: { ...c, cursor, turn: newTurn(index, (c.first + index) % 2, c.deck[cursor]) } });
}

export function submitCharadesGuess(
  state: GameState,
  g: { playerId: string; guessId: string; roundIndex: number; text: string },
  now: number,
): { state: GameState; result: GuessResult } {
  const c = state.charades;
  const t = c?.turn;
  const me = state.players[g.playerId];
  const misses = t?.misses[g.playerId] ?? 0;
  const res = (verdict: GuessResult["verdict"], points = 0): GuessResult => ({
    to: g.playerId,
    guessId: g.guessId,
    verdict,
    points,
    attemptsLeft: Math.max(0, MAX_GUESSES - misses),
  });
  if (!c || !t || !me || state.phase !== "round" || t.step !== "acting" || g.roundIndex !== t.index || now > t.deadline + GRACE_MS) {
    return { state, result: res("late") };
  }
  // Only the other team guesses; the acting team just watches.
  if (me.team === undefined || me.team === t.team) return { state, result: res("locked") };
  if (misses >= MAX_GUESSES) return { state, result: res("locked") };
  const text = g.text.trim().slice(0, 60);
  if (!text || !isArabicText(text)) return { state, result: res("invalid") };

  const { verdict } = judgeGuess(text, [t.title.ar, ...(t.title.alt ?? [])]);
  if (verdict !== "correct") {
    const turn = { ...t, misses: { ...t.misses, [g.playerId]: misses + 1 } };
    return { state: bump({ ...state, charades: { ...c, turn } }), result: { ...res(verdict), attemptsLeft: MAX_GUESSES - misses - 1 } };
  }
  const total = charadesSeconds(state) * 1000;
  const left = Math.max(0, t.deadline - now);
  const points = GUESS_POINTS + Math.floor((SPEED_MAX * Math.min(left, total)) / total);
  const performerGain = t.performerId && state.players[t.performerId] ? PERFORMER_POINTS : 0;
  const scores = [...c.scores];
  scores[me.team] += points;
  scores[t.team] += performerGain;
  const players = { ...state.players, [g.playerId]: { ...me, score: me.score + points } };
  if (performerGain && t.performerId) players[t.performerId] = { ...players[t.performerId], score: players[t.performerId].score + performerGain };
  const turn: CharadesTurn = { ...t, guessed: { ...t.guessed, [g.playerId]: points }, firstId: g.playerId, performerPoints: performerGain };
  // The team has it: the turn ends.
  return { state: endTurn(bump({ ...state, players, charades: { ...c, scores, turn } })), result: res("correct", points) };
}

export function toPublicCharades(state: GameState, now: number): PublicCharades | null {
  const c = state.charades;
  if (!c) return null;
  const t = c.turn;
  const out: PublicCharades = {
    index: t.index,
    total: c.total,
    team: t.team,
    performerId: t.performerId,
    step: t.step,
    msLeft: t.step === "acting" ? Math.max(0, t.deadline - now) : null,
    totalMs: charadesSeconds(state) * 1000,
    kind: t.title.type,
    words: t.title.ar.trim().split(/\s+/).length,
    guessedIds: Object.keys(t.guessed),
    misses: t.misses,
    canSkip: canSkip(t),
    eligible: t.step === "pick" ? eligible(state) : [],
    scores: c.scores,
  };
  if (t.step === "done") out.reveal = { title: t.title.ar, points: t.guessed, performerPoints: t.performerPoints };
  return out;
}

export function publicOf(state: GameState, now: number): PublicState {
  const t = state.charades?.turn;
  return {
    ...basePublic(state, (id) => (!t || t.step === "pick" || t.step === "ready" ? null : id === t.performerId ? t.performerPoints : (t.guessed[id] ?? 0))),
    charades: toPublicCharades(state, now),
  };
}
