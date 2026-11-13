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
