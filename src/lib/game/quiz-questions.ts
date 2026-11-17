import { normalizeArabic, similarity } from "@/lib/arabic";
import type { CastGraph, FilmActor, Title } from "@/lib/content-types";
import { shuffle } from "./engine";
import type { QuizQuestion } from "./types";

/** Question generators for the quiz games. Pure: the host passes the data in. */

export const posterUrl = (path?: string) => (path ? `https://image.tmdb.org/t/p/w342${path}` : undefined);

// ---------- Before or after? ----------

export interface DatedWork {
  ar: string;
  year: number;
  type: "movie" | "series";
  poster?: string;
}

/** Famous works with a known year: the Top 100 plus each actor's best-known titles. */
export function datedWorks(titles: Title[], actors: FilmActor[], graph: CastGraph, perActor = 12): DatedWork[] {
  const seen = new Set<string>();
  const out: DatedWork[] = [];
  const add = (ar: string, year: number | undefined, type: DatedWork["type"], poster?: string) => {
    const key = normalizeArabic(ar);
    // A poster makes the question much easier to read, so works without one are left out.
    if (!ar || !year || !poster || seen.has(key)) return;
    seen.add(key);
    out.push({ ar, year, type, poster: posterUrl(poster) });
  };
  for (const t of titles) add(t.titleAr, t.year, t.type, graph.works[`t:${t.id}`]?.p);
  for (const a of actors) {
    for (const w of a.works.slice(0, perActor)) add(w.ar, w.year ?? graph.works[w.id]?.y, w.type, graph.works[w.id]?.p);
  }
  return out;
}

/** Year gap that makes a question easy, medium or hard. */
const GAP = { easy: [15, 99], medium: [5, 14], hard: [1, 4], any: [1, 99] } as const;

export function makeBeforeAfter(
  pool: DatedWork[],
  count: number,
  difficulty: keyof typeof GAP = "any",
  rand = Math.random,
): QuizQuestion[] {
  const [min, max] = GAP[difficulty];
  const used = new Set<DatedWork>();
  const out: QuizQuestion[] = [];
  const items = shuffle(pool, rand);
  for (const a of items) {
    if (out.length >= count) break;
    if (used.has(a)) continue;
    const b = items.find((x) => x !== a && !used.has(x) && Math.abs(x.year - a.year) >= min && Math.abs(x.year - a.year) <= max);
    if (!b) continue;
    used.add(a);
    used.add(b);
    const pair = shuffle([a, b], rand);
    out.push({
      prompt: "أنهي واحد نزل الأول؟",
      choices: pair.map((w) => ({ label: w.ar, sub: w.type === "movie" ? "فيلم" : "مسلسل", image: w.poster })),
      answer: pair[0].year < pair[1].year ? 0 : 1,
      why: pair.map((w) => `«${w.ar}» ${w.year}`).join(" · "),
      seconds: 10,
    });
  }
  return out;
}

// ---------- Odd one out ----------

const castNames = (graph: CastGraph, workId: string) =>
  (graph.works[workId]?.c ?? []).flatMap((id) => graph.persons[id] ?? []).filter(Boolean);

/**
 * `actors` (their filmographies) is a second opinion: TMDB only lists the top billed cast, so an actor
 * further down could look like an outsider; if his own filmography has the title, he is never used.
 */
export function makeOdd(titles: Title[], graph: CastGraph, count: number, actors: FilmActor[] = [], rand = Math.random): QuizQuestion[] {
  const worksOf = new Map(actors.map((a) => [a.nameAr, a.works]));
  const photo = new Map<string, { nameAr: string; nameEn: string; photo: string }>();
  for (const t of titles) for (const c of t.clues) if (c?.photo) photo.set(c.nameAr, { nameAr: c.nameAr, nameEn: c.nameEn, photo: c.photo });
  const everyone = [...photo.values()];
  const out: QuizQuestion[] = [];
  for (const t of shuffle(titles, rand)) {
    if (out.length >= count) break;
    const inside = t.clues.flatMap((c) => (c?.photo ? [{ nameAr: c.nameAr, nameEn: c.nameEn, photo: c.photo }] : []));
    const cast = castNames(graph, `t:${t.id}`);
    if (inside.length < 3 || !cast.length) continue; // without the full cast we can't promise the outsider is really out
    const clueNames = t.clues.flatMap((c) => (c ? [c.nameAr, c.nameEn] : []));
    // Far from every cast name, so a different spelling of an actor in the film can't slip through.
    const wasIn = (o: { nameAr: string }) =>
      (worksOf.get(o.nameAr) ?? []).some((w) => w.id === `t:${t.id}` || similarity(w.ar, t.titleAr) >= 0.85);
    const outsider = shuffle(everyone, rand).find(
      (o) => !wasIn(o) && ![...cast, ...clueNames].some((n) => similarity(o.nameAr, n) >= 0.7 || similarity(o.nameEn, n) >= 0.8),
    );
    if (!outsider) continue;
    const three = shuffle(inside, rand).slice(0, 3);
    const four = shuffle([...three.map((c) => ({ ...c, odd: false })), { ...outsider, odd: true }], rand);
    out.push({
      prompt: "ممثل واحد بس مش في نفس العمل. مين؟",
      choices: four.map((c) => ({ label: c.nameAr, image: c.photo })),
      answer: four.findIndex((c) => c.odd),
      why: `التلاتة التانيين كانوا في «${t.titleAr}»`,
      seconds: 15,
    });
  }
  return out;
}
