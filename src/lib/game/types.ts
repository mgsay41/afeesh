import type { Clue, Genre, Title } from "@/lib/content-types";
import type { Verdict } from "@/lib/arabic";

export type Stage = 1 | 2 | 3;
export type HintKind = "genre" | "year" | "type";

export type GameKind = "tetrat" | "five" | "beforeafter" | "odd" | "link" | "quote" | "charades" | "chain";

export interface Settings {
  /** Which game. Missing in games saved before game 2 existed = "tetrat". */
  game?: GameKind;
  rounds: number;
  pool: "all" | "movie" | "series";
  difficulty: "any" | "easy" | "medium" | "hard";
  /** Seconds before the next stage reveals automatically. 0 = host reveals manually. */
  autoRevealSec: number;
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  joinedAt: number;
  /** Public ECDH key (JWK string) so the host can send this player a private message (charades). */
  key?: string;
}

export interface FeedItem {
  id: string;
  playerId: string;
  text: string;
  verdict: Verdict | "accepted";
  points: number;
  stage: Stage;
  at: number;
}

export interface RoundState {
  index: number; // 0-based
  titleId: string;
  stage: Stage;
  stageAt: number;
  hints: Record<HintKind, boolean>;
  revealed: boolean;
  /** playerId → points earned this round (only players who got it). */
  correct: Record<string, number>;
  firstId: string | null;
  /** playerId → number of wrong/close attempts. */
  misses: Record<string, number>;
  feed: FeedItem[];
}

export interface GameState {
  room: string;
  hostId: string;
  settings: Settings;
  phase: "lobby" | "round" | "final";
  players: Record<string, Player>;
  /** Tetrat: title ids. Five: actor ids. */
  titleIds: string[];
  round: RoundState | null;
  /** Game 2 ("five in thirty") round, when settings.game is "five". */
  five?: FiveRound | null;
  /** Quiz games (before/after, odd one out): host-only questions + the current round. */
  questions?: QuizQuestion[];
  quiz?: QuizRound | null;
  charades?: CharadesState | null;
  chain?: ChainState | null;
  /** When the current game started: a unique id per game for the profile stats. */
  startedAt?: number;
  version: number;
}

// ---------- Game 2: name 5 titles of an actor in 30 seconds ----------

export type FiveStep = "ready" | "playing" | "review" | "results";

export interface FiveEntry {
  id: string;
  playerId: string;
  text: string;
  /** "accepted" = the host marked it correct. */
  verdict: Verdict | "accepted";
  /** The matched work (or "x:<title>" for a host-accepted one). null while rejected. */
  workId: string | null;
  /** Canonical title for correct entries, the typed text otherwise. */
  label: string;
  at: number;
}

export interface FiveRound {
  index: number;
  actorId: string;
  step: FiveStep;
  startedAt: number;
  deadline: number;
  entries: FiveEntry[];
}

export interface PublicFive {
  index: number;
  total: number;
  step: FiveStep;
  /** Hidden until the round starts. */
  actor?: { nameAr: string; nameEn: string; photo: string };
  /** ms left at the moment of sending, or null when not playing. */
  msLeft: number | null;
  totalMs: number;
  /** playerId → correct titles so far. Never the titles themselves during the round. */
  counts: Record<string, number>;
  /** Only in the results step. */
  results?: { titles: Record<string, string[]>; missed: string[] };
}

// ---------- Quiz games: everyone taps one of 2-4 choices ----------

export interface QuizChoice {
  label: string;
  sub?: string;
  /** Poster (https) or actor photo (/actors/…). */
  image?: string;
}

export interface QuizQuestion {
  prompt: string;
  choices: QuizChoice[];
  answer: number;
  /** Shown on the reveal. */
  why?: string;
  seconds: number;
}

export interface QuizRound {
  index: number;
  step: "playing" | "reveal";
  startedAt: number;
  deadline: number;
  picks: Record<string, { choice: number; at: number }>;
  /** Filled at the reveal. */
  points: Record<string, number>;
}

export interface PublicQuiz {
  index: number;
  total: number;
  step: QuizRound["step"];
  prompt: string;
  choices: QuizChoice[];
  msLeft: number | null;
  totalMs: number;
  /** Who already tapped (not what). */
  answered: string[];
  reveal?: { answer: number; why?: string; picks: Record<string, number>; points: Record<string, number> };
}

// ---------- Charades ----------

export interface CharadesTitle {
  id: string;
  ar: string;
  alt?: string[];
  type: "movie" | "series";
}

export interface CharadesTurn {
  index: number;
  performerId: string;
  title: CharadesTitle;
  step: "ready" | "acting" | "done";
  startedAt: number;
  deadline: number;
  /** playerId → points for guessing it. */
  guessed: Record<string, number>;
  firstId: string | null;
  misses: Record<string, number>;
  skipped: boolean;
  performerPoints: number;
}

export interface CharadesState {
  /** Performer for each turn, in order. */
  order: string[];
  /** Shuffled titles; the turn uses deck[cursor]. */
  deck: CharadesTitle[];
  cursor: number;
  turn: CharadesTurn;
}

export interface PublicCharades {
  index: number;
  total: number;
  performerId: string;
  step: CharadesTurn["step"];
  msLeft: number | null;
  totalMs: number;
  kind: CharadesTitle["type"];
  /** Word count, like real charades. */
  words: number;
  guessedIds: string[];
  misses: Record<string, number>;
  canSkip: boolean;
  /** Only when the turn is over. */
  reveal?: { title: string; points: Record<string, number>; performerPoints: number };
}

/** A private message for one player (charades title), encrypted for their key. */
export interface SecretMessage {
  to: string;
  turn: number;
  epk: string;
  iv: string;
  ct: string;
}

// ---------- Chain ----------

export interface ChainLink {
  kind: "work" | "actor";
  id: string;
  label: string;
  /** Who added it (null for the starting title). */
  by: string | null;
  poster?: string;
}

export interface ChainState {
  /** links[0] is the starting title; kinds alternate work → actor → work … */
  links: ChainLink[];
  turnOf: string;
  startedAt: number;
  deadline: number;
  hearts: Record<string, number>;
  out: string[];
  /** Refused entries this turn (the host can accept one). */
  rejected: { id: string; playerId: string; text: string }[];
  /** Normalized names/ids already in the chain. */
  used: string[];
  over: boolean;
  winnerId: string | null;
  /** Last notable thing, for a toast. `n` changes so repeated events re-trigger. */
  event: { type: "timeout" | "out" | "win"; playerId: string; n: number } | null;
}

export interface PublicChain {
  /** The last few links; `count` is the total (players send it as the round index). */
  links: ChainLink[];
  count: number;
  turnOf: string;
  expect: "actor" | "work";
  msLeft: number | null;
  totalMs: number;
  hearts: Record<string, number>;
  out: string[];
  triesLeft: number;
  over: boolean;
  winnerId: string | null;
  event: ChainState["event"];
}

// ---------- What everyone (players) receives. Never contains the answer before reveal. ----------

export type PublicClue = Clue | null | "hidden";

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: string;
  score: number;
  roundPoints: number | null;
}

export interface PublicRound {
  index: number;
  total: number;
  stage: Stage;
  clues: PublicClue[];
  hints: { genres?: Genre[]; year?: number; type?: Title["type"] };
  correctIds: string[];
  firstId: string | null;
  misses: Record<string, number>;
  revealed: boolean;
  answer?: { titleAr: string; year: number; type: Title["type"]; genres: Genre[] };
  /** ms left until auto-reveal of the next stage at the moment of sending, or null. */
  autoMsLeft: number | null;
  /** Staged games other than the original: "link" shows titles instead of actors, "quote" shows a line. */
  mode?: "link" | "quote";
  quote?: string;
  /** Quote game, stage 3: who said it. */
  by?: Clue | null;
  /** Link game, stage 3: the initials of the actor. */
  initials?: string;
}

export interface PublicState {
  room: string;
  hostId: string;
  phase: GameState["phase"];
  players: PublicPlayer[];
  round: PublicRound | null;
  five?: PublicFive | null;
  quiz?: PublicQuiz | null;
  charades?: PublicCharades | null;
  chain?: PublicChain | null;
  settings: Settings;
  version: number;
}

// ---------- Realtime messages ----------

export type ToHost =
  | { type: "join"; player: { id: string; name: string; avatar: string; key?: string } }
  | { type: "guess"; playerId: string; guessId: string; roundIndex: number; text: string }
  | { type: "pick"; playerId: string; roundIndex: number; choice: number }
  | { type: "act"; playerId: string; roundIndex: number; action: "start" | "skip" }
  | { type: "hello"; playerId: string };

export type GuessResult = {
  to: string;
  guessId: string;
  verdict: Verdict | "locked" | "late" | "already" | "invalid" | "duplicate";
  points: number;
  attemptsLeft: number;
};

export type ToPlayers =
  | { type: "state"; state: PublicState }
  | { type: "result"; result: GuessResult }
  | { type: "secret"; secret: SecretMessage }
  | { type: "kicked"; playerId: string };
