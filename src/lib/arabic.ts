import { distance } from "fastest-levenshtein";

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g; // diacritics + tatweel
const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const PREFIX_WORDS = new Set(["فيلم", "مسلسل", "فلم"]);

/** Canonical form for comparing Arabic titles: unify letter variants, drop diacritics, "ال", punctuation. */
export function normalizeArabic(input: string): string {
  let s = input
    .replace(TASHKEEL, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .toLowerCase();
  const words = s.split(/\s+/).filter(Boolean);
  while (words.length > 1 && PREFIX_WORDS.has(words[0])) words.shift();
  s = words.map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w)).join(" ");
  return s.trim();
}

/** True when the text contains at least one Arabic letter and no Latin letters. */
export function isArabicText(input: string): boolean {
  return /[؀-ۿ]/.test(input) && !/[a-zA-Z]/.test(input);
}

export type Verdict = "correct" | "close" | "wrong";

export const CORRECT_AT = 0.8;
export const CLOSE_AT = 0.65;

function ratio(a: string, b: string): number {
  if (!a || !b) return 0;
  return 1 - distance(a, b) / Math.max(a.length, b.length);
}

/** Similarity 0..1 between a guess and one accepted answer (both raw). */
export function similarity(guess: string, answer: string): number {
  const g = normalizeArabic(guess);
  const a = normalizeArabic(answer);
  if (!g || !a) return 0;
  if (g === a) return 1;
  const gc = g.replace(/\s/g, "");
  const ac = a.replace(/\s/g, "");
  if (gc === ac) return 1;
  // Very short titles must match exactly — otherwise random words slip through.
  if (ac.length <= 4) return 0;
  let best = ratio(gc, ac);
  // "عسل اسود الفيلم" or "مسلسل X الجزء 2" — the full answer appears inside the guess.
  if (ac.length >= 5 && gc.includes(ac) && gc.length <= ac.length * 2) best = Math.max(best, 0.95);
  // Word-level: every answer word matched closely by some guess word (order-free).
  const aw = a.split(" ");
  const gw = g.split(" ");
  if (aw.length > 1 && gw.length === aw.length) {
    const avg = aw.reduce((sum, w) => sum + Math.max(...gw.map((x) => ratio(x, w))), 0) / aw.length;
    best = Math.max(best, avg * 0.97);
  }
  return best;
}

export function judgeGuess(guess: string, answers: string[]): { verdict: Verdict; score: number } {
  const score = Math.max(0, ...answers.map((a) => similarity(guess, a)));
  return { verdict: score >= CORRECT_AT ? "correct" : score >= CLOSE_AT ? "close" : "wrong", score };
}
