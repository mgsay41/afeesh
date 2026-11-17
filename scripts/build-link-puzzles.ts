/**
 * Builds src/data/link-puzzles.json for «الرابط المشترك»: six works one actor was in.
 *
 *   npm run link-puzzles     (after `npm run filmography` and `npm run casts`)
 *
 * A puzzle is kept only if the first three works (what players see first) share exactly ONE
 * billed actor in the TMDB cast lists, so "who is in all three?" has a single answer.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeArabic, similarity } from "../src/lib/arabic";
import type { CastGraph, FilmActor } from "../src/lib/content-types";

const ROOT = path.resolve(__dirname, "..");
const actors = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/filmography.json"), "utf8")) as FilmActor[];
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/casts.json"), "utf8")) as CastGraph;
const PER_ACTOR = 2;
const POOL = 14;

/** Deterministic shuffle so reruns give the same puzzles. */
let seed = 20260717;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const shuffle = <T>(a: T[]) => a.map((x) => [rand(), x] as const).sort((x, y) => x[0] - y[0]).map((x) => x[1]);

/** Which TMDB person is this actor? The one whose name best matches in most of their works. */
function personOf(a: FilmActor): number | null {
  const votes = new Map<number, number>();
  for (const w of a.works.slice(0, 40)) {
    for (const p of graph.works[w.id]?.c ?? []) {
      const [ar, en] = graph.persons[p] ?? ["", ""];
      if ((ar && similarity(a.nameAr, ar) >= 0.85) || (en && a.nameEn && similarity(a.nameEn, en) >= 0.9)) votes.set(p, (votes.get(p) ?? 0) + 1);
    }
  }
  const best = [...votes].sort((x, y) => y[1] - x[1])[0];
  return best && best[1] >= 2 ? best[0] : null;
}

const out: { id: string; nameAr: string; nameEn: string; works: { ar: string; en?: string; p?: string; y?: number }[] }[] = [];
let skipped = 0;
for (const a of actors) {
  const pid = personOf(a);
  if (!pid) {
    skipped++;
    continue;
  }
  const pool = a.works
    .map((w, fame) => ({ w, fame, c: graph.works[w.id] }))
    .filter((x) => x.c && x.c.c.includes(pid) && x.c.p && x.w.ar)
    .slice(0, POOL);
  if (pool.length < 6) {
    skipped++;
    continue;
  }
  const made: string[] = [];
  for (let n = 0; n < PER_ACTOR; n++) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const six = shuffle(pool).slice(0, 6);
      // No sequels of one franchise in the same puzzle.
      const titles = six.map((x) => normalizeArabic(x.w.ar));
      if (titles.some((t, i) => titles.some((u, j) => i < j && similarity(t, u) >= 0.7))) continue;
      const ordered = six.sort((x, y) => y.fame - x.fame); // least famous first
      const key = ordered.map((x) => x.w.id).sort().join();
      if (made.includes(key)) continue;
      const shared = ordered.slice(0, 3).map((x) => new Set(x.c.c));
      const common = [...shared[0]].filter((p) => shared.every((s) => s.has(p)));
      if (common.length !== 1) continue;
      made.push(key);
      out.push({
        id: `${a.id}-${n + 1}`,
        nameAr: a.nameAr,
        nameEn: a.nameEn,
        works: ordered.map((x) => ({ ar: x.w.ar, en: x.w.en, p: x.c.p, y: x.w.year ?? x.c.y })),
      });
      break;
    }
  }
}
fs.writeFileSync(path.join(ROOT, "src/data/link-puzzles.json"), JSON.stringify(out));
console.log(`${out.length} puzzles from ${new Set(out.map((p) => p.nameAr)).size} actors (${skipped} actors skipped)`);
