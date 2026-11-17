export type Genre =
  | "comedy"
  | "drama"
  | "crime"
  | "action"
  | "romance"
  | "mystery"
  | "thriller"
  | "adventure"
  | "fantasy"
  | "family"
  | "biography"
  | "music"
  | "horror"
  | "history"
  | "war"
  | "sport"
  | "other";

export interface Clue {
  nameAr: string;
  nameEn: string;
  /** Path under /public, or null when no licensed photo was found (UI shows initials). */
  photo: string | null;
}

export interface Title {
  id: string; // IMDb ID
  titleAr: string;
  titleEn: string;
  /** Extra accepted Arabic spellings (the main title is always accepted). */
  aliases: string[];
  type: "movie" | "series";
  year: number;
  genres: Genre[];
  difficulty: "easy" | "medium" | "hard";
  /** Always 6 entries in clue order 1 → 6. null = empty clue (skipped in the reveal). */
  clues: (Clue | null)[];
}

/**
 * A staged puzzle for the "common link" and "catchphrase" games. Built as a Title so the original
 * game's engine runs it unchanged: link → the answer is an actor and the six clues are works;
 * quote → the answer is the title the line comes from and clues[0] is who said it.
 */
export interface Puzzle extends Title {
  mode: "link" | "quote";
  quote?: string;
}

/** One movie or series an actor appeared in (game 2). The list per actor is sorted most-famous first. */
export interface Work {
  id: string; // Wikidata Q-id, "t:<imdb id>" for Top 100 titles, "o:<title>" for hand-added ones
  ar: string;
  en?: string;
  /** Extra accepted spellings. */
  alt?: string[];
  type: "movie" | "series";
  year?: number;
}

export interface FilmActor {
  id: string; // same slug as the photo file name
  nameAr: string;
  nameEn: string;
  photo: string;
  works: Work[];
}

/** Cast lists from TMDB (src/data/casts.json, host-only). Work ids are the same as in filmography.json ("Q…", "t:tt…"). */
export interface CastGraph {
  /** TMDB person id → [Arabic name or "", English name or ""]. */
  persons: Record<string, [string, string]>;
  /** ar = TMDB Arabic title, y = year, p = poster path on image.tmdb.org, c = top-billed cast. */
  works: Record<string, { ar: string; y?: number; p?: string; c: number[] }>;
}

export const GENRE_AR: Record<Genre, string> = {
  comedy: "كوميدي",
  drama: "دراما",
  crime: "جريمة",
  action: "أكشن",
  romance: "رومانسي",
  mystery: "غموض",
  thriller: "إثارة",
  adventure: "مغامرة",
  fantasy: "فانتازيا",
  family: "عائلي",
  biography: "سيرة ذاتية",
  music: "موسيقي",
  horror: "رعب",
  history: "تاريخي",
  war: "حرب",
  sport: "رياضة",
  other: "متنوع",
};

export const GENRE_EMOJI: Record<Genre, string> = {
  comedy: "😂",
  drama: "🎭",
  crime: "🔪",
  action: "💥",
  romance: "❤️",
  mystery: "🕵️",
  thriller: "😱",
  adventure: "🧭",
  fantasy: "✨",
  family: "👨‍👩‍👧",
  biography: "📜",
  music: "🎵",
  horror: "👻",
  history: "🏛️",
  war: "⚔️",
  sport: "⚽",
  other: "🎬",
};
