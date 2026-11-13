import type { Clue, Genre, Title } from "@/lib/content-types";
import type { Verdict } from "@/lib/arabic";

export type Stage = 1 | 2 | 3;
export type HintKind = "genre" | "year" | "type";

export interface Settings {
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
  titleIds: string[];
  round: RoundState | null;
  version: number;
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
}

export interface PublicState {
  room: string;
  hostId: string;
  phase: GameState["phase"];
  players: PublicPlayer[];
  round: PublicRound | null;
  settings: Settings;
  version: number;
}

// ---------- Realtime messages ----------

export type ToHost =
  | { type: "join"; player: { id: string; name: string; avatar: string } }
  | { type: "guess"; playerId: string; guessId: string; roundIndex: number; text: string }
  | { type: "hello"; playerId: string };

export type GuessResult = {
  to: string;
  guessId: string;
  verdict: Verdict | "locked" | "late" | "already" | "invalid";
  points: number;
  attemptsLeft: number;
};

export type ToPlayers =
  | { type: "state"; state: PublicState }
  | { type: "result"; result: GuessResult }
  | { type: "kicked"; playerId: string };
