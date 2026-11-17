import linkJson from "@/data/link-puzzles.json";
import quotesJson from "@/data/quotes.json";
import type { CastGraph, Puzzle, Title } from "@/lib/content-types";
import { ACTOR_MAP, ACTORS } from "./actors";
import { makeChainData } from "./chain-data";
import type { ChainData } from "./chain";
import * as C from "./charades";
import * as E from "./engine";
import * as F from "./five-engine";
import { familyOf } from "./games";
import * as Q from "./quiz-engine";
import { datedWorks, makeBeforeAfter, makeOdd, posterUrl } from "./quiz-questions";
import * as K from "./chain";
import { addUsedTitles, getUsedTitles, USED_ACTORS_KEY } from "./room";
import { TITLE_MAP, TITLES } from "./titles";
import type { CharadesTitle, GameKind, GameState, PublicState } from "./types";

/**
 * Host-only glue: owns the game data (never imported by player code) and routes each game to its engine.
 */

// ---------- Staged games (answer typed in three stages): tetrat, link, quote ----------

interface LinkRecord {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Six works, least known first. */
  works: { ar: string; en?: string; p?: string; y?: number }[];
}
interface QuoteRecord {
  line: string;
  titleAr: string;
  titleEn?: string;
  aliases?: string[];
  year: number;
  type: "movie" | "series";
  genres: Title["genres"];
  by: string;
  byEn?: string;
}

const photoOf = (nameAr: string) => ACTORS.find((a) => a.nameAr === nameAr)?.photo ?? null;

const LINKS: Puzzle[] = (linkJson as LinkRecord[]).map((r) => ({
  id: `l:${r.id}`,
  titleAr: r.nameAr,
  titleEn: r.nameEn,
  aliases: [],
  type: "movie",
  year: 0,
  genres: [],
  difficulty: "medium",
  clues: r.works.map((w) => ({ nameAr: w.ar, nameEn: w.en ?? "", photo: posterUrl(w.p) ?? null })),
  mode: "link",
}));

const QUOTES: Puzzle[] = (quotesJson as QuoteRecord[]).map((r, i) => ({
  id: `q:${i}`,
  titleAr: r.titleAr,
  titleEn: r.titleEn ?? "",
  aliases: r.aliases ?? [],
  type: r.type,
  year: r.year,
  genres: r.genres,
  difficulty: "medium",
  clues: [{ nameAr: r.by, nameEn: r.byEn ?? "", photo: photoOf(r.by) }, null, null, null, null, null],
  mode: "quote",
  quote: r.line,
}));

const byId = (list: Title[]): E.TitleMap => Object.fromEntries(list.map((t) => [t.id, t]));
const STAGED: Partial<Record<GameKind, { all: Title[]; map: E.TitleMap; key?: string }>> = {
  tetrat: { all: TITLES, map: TITLE_MAP },
  link: { all: LINKS, map: byId(LINKS), key: "afeesh:used-link" },
  quote: { all: QUOTES, map: byId(QUOTES), key: "afeesh:used-quote" },
};
export const stagedOf = (game?: GameKind) => STAGED[game ?? "tetrat"] ?? STAGED.tetrat!;

/**
 * One random puzzle per answer. Several quotes can come from the same film, and showing the film twice
 * in one game would give the answer away in the second round.
 */
export function onePerTitle(list: Title[], rand = Math.random): Title[] {
  const groups = new Map<string, Title[]>();
  for (const t of list) groups.set(t.titleAr, [...(groups.get(t.titleAr) ?? []), t]);
  return [...groups.values()].map((g) => g[Math.floor(rand() * g.length)]);
}

/** How many puzzles a staged game has (the picker greys a game out when there are none). */
export const puzzleCount = (game: GameKind) => stagedOf(game).all.length;

// ---------- Casts (TMDB): loaded on demand, only the games that need them pay for it ----------

let graphPromise: Promise<CastGraph> | null = null;
export const loadGraph = () => (graphPromise ??= import("@/data/casts.json").then((m) => m.default as unknown as CastGraph));

let chainPromise: Promise<ChainData> | null = null;
export const loadChainData = () => (chainPromise ??= loadGraph().then((g) => makeChainData(g, ACTORS, TITLES)));

// ---------- Charades titles ----------

const CHARADES_KEY = "afeesh:used-charades";

function charadesPool(): CharadesTitle[] {
  const seen = new Set<string>();
  const out: CharadesTitle[] = [];
  const add = (id: string, ar: string, type: CharadesTitle["type"], alt: string[] = []) => {
    const k = ar.trim();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push({ id, ar: k, alt: alt.filter(Boolean), type });
  };
  for (const t of TITLES) add(`t:${t.id}`, t.titleAr, t.type, t.aliases);
  for (const a of ACTORS) for (const w of a.works.slice(0, 3)) add(w.id, w.ar, w.type, w.alt);
  return out;
}

// ---------- Start + public state ----------

/** Start the game the host picked. Async because some games load the cast data first. */
export async function startAny(s: GameState): Promise<GameState> {
  const next = await startGame(s);
  return next === s ? s : { ...next, startedAt: Date.now() };
}

async function startGame(s: GameState): Promise<GameState> {
  const game = s.settings.game ?? "tetrat";
  const now = Date.now();
  switch (familyOf(game)) {
    case "five": {
      const ids = F.pickActors(ACTORS, s.settings.rounds, getUsedTitles(USED_ACTORS_KEY));
      addUsedTitles(ids, USED_ACTORS_KEY);
      return F.startFiveGame(s, ids);
    }
    case "quiz": {
      const graph = await loadGraph();
      const questions =
        game === "odd"
          ? makeOdd(TITLES, graph, s.settings.rounds, ACTORS)
          : makeBeforeAfter(datedWorks(TITLES, ACTORS, graph), s.settings.rounds, s.settings.difficulty);
      return Q.startQuiz(s, questions, now);
    }
    case "charades": {
      const turns = Math.max(1, s.settings.rounds) * C.performers(s).length;
      const deck = C.pickCharades(charadesPool(), turns + 8, getUsedTitles(CHARADES_KEY));
      addUsedTitles(deck.slice(0, turns).map((t) => t.id), CHARADES_KEY);
      return C.startCharades(s, deck, now);
    }
    case "chain":
      return K.startChain(s, await loadChainData(), now);
    default: {
      const pool = stagedOf(game);
      const settings = { ...s.settings, pool: "all" as const, difficulty: game === "tetrat" ? s.settings.difficulty : ("any" as const) };
      const ids = E.pickTitles(onePerTitle(pool.all), settings, getUsedTitles(pool.key));
      addUsedTitles(ids, pool.key);
      return E.startGame(s, ids, pool.map, now);
    }
  }
}

/** What players (and the host's own screen) see for the current state. */
export function publicOf(state: GameState, now: number): PublicState {
  switch (familyOf(state.settings.game)) {
    case "five":
      return F.publicOf(state, TITLE_MAP, ACTOR_MAP, now);
    case "quiz":
      return Q.publicOf(state, now);
    case "charades":
      return C.publicOf(state, now);
    case "chain":
      return K.publicOf(state, now);
    default:
      return E.toPublic(state, stagedOf(state.settings.game).map, now);
  }
}
