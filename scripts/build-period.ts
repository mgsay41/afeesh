/**
 * Restricts the whole game to movies, series and actors of 2000–2010 and fills the gaps from TMDB.
 *
 *   npm run period      # needs TMDB_API_KEY in .env.local; reruns use content/period-cache.json
 *
 * 1. Every Egyptian movie/series first released in the period is discovered on TMDB (with its cast).
 * 2. src/data/casts.json keeps only period works: the TMDB ones plus the earlier Wikidata ones that TMDB didn't list.
 * 3. src/data/filmography.json is rebuilt from the cast lists: every actor billed in enough period works.
 * 4. src/data/titles.json keeps the curated period titles and adds ones generated from the cast lists.
 *
 * Idempotent: it reads the files it writes, and a work counts as "already there" when the same Arabic title appears
 * with a year ±1. The key is only used here, never shipped to the browser.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeArabic } from "../src/lib/arabic";
import type { CastGraph, Clue, FilmActor, Genre, Title, Work } from "../src/lib/content-types";
import { inPeriod, PERIOD_FROM, PERIOD_TO } from "../src/lib/period";

const ROOT = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  /* key may come from the shell */
}
const KEY = process.env.TMDB_API_KEY?.trim();
if (!KEY) throw new Error("Set TMDB_API_KEY in .env.local");

const DATA = path.join(ROOT, "src/data");
const CACHE = path.join(ROOT, "content/period-cache.json");
const TOP_CAST = 15;
/** An actor needs this many period works (billed in the top 15) to be in the game. */
const MIN_WORKS = 6;
/** ...and be among the first five billed in this many of them: main actors, not extras who appear everywhere. */
const MIN_LEAD = 5;
const UA = { "User-Agent": "afeesh-content-script/1.0" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);
const read = <T>(f: string) => JSON.parse(fs.readFileSync(path.join(DATA, f), "utf8")) as T;
const write = (f: string, v: unknown) => fs.writeFileSync(path.join(DATA, f), JSON.stringify(v));
const norm = normalizeArabic;
/** TMDB writes «عبدالله», we write «عبد الله». */
const spaced = (s: string) => s.replace(/(^|\s)عبد(ال)/g, "$1عبد $2");
const key = (s: string) => norm(s).replace(/\s+/g, "");
const photoUrl = (p: string) => `https://image.tmdb.org/t/p/w185${p}`;

async function tmdb<T>(url: string): Promise<T | null> {
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await fetch(`https://api.themoviedb.org/3${url}${url.includes("?") ? "&" : "?"}api_key=${KEY}`);
      if (res.status === 404) return null;
      if (res.ok) return (await res.json()) as T;
      if (res.status !== 429 && res.status < 500) throw new Error(`TMDB HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 5) throw e;
    }
    await sleep(1000 * attempt);
  }
  return null;
}

async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

// ---------- 1) discover ----------

interface Item {
  key: string; // "m:<id>" | "s:<id>"
  ar: string;
  orig?: string;
  y: number;
  p?: string;
  vc: number;
  g: number[];
  /** [person id, name, original name, profile path] in billing order. */
  c: [number, string, string, string?][];
}
type Cache = Record<string, Item | null>;
const cache: Cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

type Found = { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string; poster_path?: string | null; vote_count: number; genre_ids: number[] };
async function discover(kind: "movie" | "tv"): Promise<Found[]> {
  const date = kind === "movie" ? "primary_release_date" : "first_air_date";
  const out: Found[] = [];
  for (let page = 1; ; page++) {
    const r = await tmdb<{ results: Found[]; total_pages: number }>(
      `/discover/${kind}?language=ar&with_origin_country=EG&${date}.gte=${PERIOD_FROM}-01-01&${date}.lte=${PERIOD_TO}-12-31&sort_by=vote_count.desc&page=${page}`,
    );
    if (!r) break;
    out.push(...r.results);
    if (page >= r.total_pages || page >= 40) break;
  }
  return out;
}

async function fetchPeriod() {
  const found: { kind: "movie" | "tv"; f: Found }[] = [];
  for (const kind of ["movie", "tv"] as const) for (const f of await discover(kind)) found.push({ kind, f });
  console.log(`discovered ${found.length} (${found.filter((x) => x.kind === "movie").length} movies)`);
  const todo = found.filter(({ kind, f }) => !(`${kind === "movie" ? "m" : "s"}:${f.id}` in cache));
  console.log(`fetching credits for ${todo.length}`);
  let done = 0;
  await pool(todo, 8, async ({ kind, f }) => {
    const key = `${kind === "movie" ? "m" : "s"}:${f.id}`;
    type Credits = { cast: { id: number; name: string; original_name: string; order?: number; profile_path?: string | null }[] };
    const cr = await tmdb<Credits>(`/${kind}/${f.id}/${kind === "movie" ? "credits" : "aggregate_credits"}?language=ar`);
    const y = Number((f.release_date ?? f.first_air_date ?? "").slice(0, 4));
    cache[key] = cr?.cast.length
      ? {
          key,
          ar: f.title ?? f.name ?? "",
          orig: f.original_title ?? f.original_name,
          y,
          p: f.poster_path ?? undefined,
          vc: f.vote_count,
          g: f.genre_ids,
          c: cr.cast
            .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
            .slice(0, TOP_CAST)
            .map((c): [number, string, string, string?] => [c.id, c.name, c.original_name, c.profile_path ?? undefined]),
        }
      : null;
    if (++done % 100 === 0) process.stdout.write(`\r${done}/${todo.length}`);
  });
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  console.log();
}

// ---------- 2) names ----------

type Row = Record<string, { value: string }>;
async function sparql(query: string): Promise<Row[]> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://query.wikidata.org/sparql?format=json", {
        method: "POST",
        headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "query=" + encodeURIComponent(query),
      });
      if (res.ok) return ((await res.json()) as { results: { bindings: Row[] } }).results.bindings;
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 4) throw e;
    }
    await sleep(2000 * attempt);
  }
  return [];
}

const GENRES: Record<number, Genre> = {
  28: "action", 12: "adventure", 16: "family", 35: "comedy", 80: "crime", 99: "other", 18: "drama", 10751: "family",
  14: "fantasy", 36: "history", 27: "horror", 10402: "music", 9648: "mystery", 10749: "romance", 878: "fantasy",
  53: "thriller", 10752: "war", 37: "other", 10759: "action", 10765: "fantasy", 10768: "war", 10766: "romance", 10762: "family",
};

async function main() {
  await fetchPeriod();

  const oldGraph = read<CastGraph>("casts.json");
  const oldActors = read<FilmActor[]>("filmography.json");
  const oldTitles = read<Title[]>("titles.json");
  const typeOf = new Map<string, Work["type"]>();
  const oldWork = new Map<string, Work>();
  for (const a of oldActors) for (const w of a.works) {
    oldWork.set(w.id, w);
    typeOf.set(w.id, w.type);
  }
  for (const t of oldTitles) typeOf.set(`t:${t.id}`, t.type);

  // ----- merged period graph -----
  const works: CastGraph["works"] = {};
  const meta = new Map<string, { type: Work["type"]; en?: string; alt: string[]; vc: number; g: number[] }>();
  const seen = new Map<string, number[]>(); // normalized title → years
  const has = (ar: string, y: number) => (seen.get(norm(ar)) ?? []).some((x) => Math.abs(x - y) <= 1);
  const remember = (ar: string, y: number) => seen.set(norm(ar), [...(seen.get(norm(ar)) ?? []), y]);

  const persons: Record<number, [string, string]> = {};
  const profile = new Map<number, string>();
  const setName = (id: number, name: string, orig: string) => {
    const ar = spaced(hasArabic(name) ? name : hasArabic(orig) ? orig : "");
    const en = hasArabic(name) ? (hasArabic(orig) ? "" : orig) : name;
    const prev = persons[id];
    persons[id] = [prev?.[0] || ar, prev?.[1] || en];
  };
  for (const [id, v] of Object.entries(oldGraph.persons)) persons[Number(id)] = [spaced(v[0]), v[1]];

  for (const it of Object.values(cache)) {
    if (!it || !inPeriod(it.y) || !it.ar || !hasArabic(it.ar) || it.c.length < 3) continue;
    works[it.key] = { ar: it.ar, y: it.y, p: it.p, c: it.c.map((x) => x[0]) };
    meta.set(it.key, {
      type: it.key.startsWith("s:") ? "series" : "movie",
      en: it.orig && !hasArabic(it.orig) ? it.orig : undefined,
      alt: it.orig && hasArabic(it.orig) && norm(it.orig) !== norm(it.ar) ? [it.orig] : [],
      vc: it.vc,
      g: it.g,
    });
    remember(it.ar, it.y);
    for (const [id, name, orig, pr] of it.c) {
      setName(id, name, orig);
      if (pr && !profile.has(id)) profile.set(id, pr);
    }
  }
  const nTmdb = Object.keys(works).length;

  // Earlier (Wikidata / Top-100) works that TMDB's discover list didn't have.
  let kept = 0;
  for (const [id, w] of Object.entries(oldGraph.works)) {
    if (!inPeriod(w.y) || !w.ar || has(w.ar, w.y)) continue;
    works[id] = w;
    const ow = oldWork.get(id);
    meta.set(id, { type: typeOf.get(id) ?? "movie", en: ow?.en, alt: ow?.alt ?? [], vc: 0, g: [] });
    remember(w.ar, w.y);
    kept++;
  }
  console.log(`period works: ${nTmdb} from TMDB + ${kept} earlier = ${Object.keys(works).length}`);

  // Arabic names for new people (Wikidata knows the TMDB person id).
  const missing = Object.entries(persons).filter(([id, v]) => !v[0] && Object.values(works).some((w) => w.c.includes(Number(id)))).map(([id]) => Number(id));
  for (let i = 0; i < missing.length; i += 150) {
    const batch = missing.slice(i, i + 150);
    const rows = await sparql(`SELECT ?id ?l WHERE { VALUES ?id { ${batch.map((x) => `"${x}"`).join(" ")} } ?p wdt:P4985 ?id . ?p rdfs:label ?l . FILTER(lang(?l) = "ar") }`);
    for (const r of rows) {
      const id = Number(r.id.value);
      persons[id] = [r.l.value, persons[id]?.[1] ?? ""];
    }
    await sleep(500);
  }

  // ----- actors -----
  // Existing actor → TMDB person: the person whose name matches in most of their old works.
  const personOf = new Map<string, number>();
  for (const a of oldActors) {
    const votes = new Map<number, number>();
    for (const w of a.works) {
      for (const p of oldGraph.works[w.id]?.c ?? []) {
        const [ar] = oldGraph.persons[p] ?? [""];
        if (ar && key(ar) === key(a.nameAr)) votes.set(p, (votes.get(p) ?? 0) + 1);
      }
    }
    const best = [...votes].sort((x, y) => y[1] - x[1])[0];
    if (best) personOf.set(a.id, best[0]);
  }
  const byPerson = new Map<number, FilmActor>();
  for (const a of oldActors) if (personOf.has(a.id)) byPerson.set(personOf.get(a.id)!, a);

  const appearances = new Map<number, string[]>();
  for (const [id, w] of Object.entries(works)) for (const p of w.c) appearances.set(p, [...(appearances.get(p) ?? []), id]);

  const lead = new Map<number, number>();
  for (const w of Object.values(works)) for (const p of w.c.slice(0, 5)) lead.set(p, (lead.get(p) ?? 0) + 1);
  const fame = (id: string) => (meta.get(id)?.vc ?? 0) * 1000 + (works[id]?.c.length ?? 0);
  const actors: FilmActor[] = [];
  const used = new Set<string>();
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  for (const [pid, ids] of appearances) {
    const old = byPerson.get(pid);
    const [ar, en] = persons[pid] ?? ["", ""];
    const nameAr = old?.nameAr ?? ar;
    if (!nameAr || !hasArabic(nameAr)) continue;
    const photo = old?.photo ?? (profile.get(pid) ? photoUrl(profile.get(pid)!) : null);
    if (!photo) continue;
    // Works from the cast lists, plus the person's earlier ones that had no cast list.
    const list: { id: string; w: Work }[] = ids.map((id) => ({
      id,
      w: { id, ar: works[id].ar, en: meta.get(id)!.en, alt: meta.get(id)!.alt, type: meta.get(id)!.type, year: works[id].y },
    }));
    for (const w of old?.works ?? []) {
      const y = w.year ?? oldGraph.works[w.id]?.y;
      if (!inPeriod(y) || list.some((x) => x.id === w.id || (norm(x.w.ar) === norm(w.ar) && Math.abs((x.w.year ?? 0) - y) <= 1))) continue;
      if (has(w.ar, y) && !oldGraph.works[w.id]) continue; // already listed under another id
      list.push({ id: w.id, w: { ...w, year: y } });
    }
    const unique = new Map(list.map((x) => [norm(x.w.ar), x]));
    if (unique.size < MIN_WORKS || (lead.get(pid) ?? 0) < MIN_LEAD) continue;
    const sorted = [...unique.values()].sort((a, b) => fame(b.id) - fame(a.id));
    const id = old?.id ?? (slug(en) || `p${pid}`);
    if (used.has(id)) continue;
    used.add(id);
    actors.push({
      id,
      nameAr,
      nameEn: old?.nameEn ?? en,
      photo,
      works: sorted.map((x) => ({ ...x.w, alt: x.w.alt?.length ? x.w.alt : undefined })),
    });
  }
  actors.sort((a, b) => b.works.length - a.works.length);
  console.log(`actors: ${actors.length} (${actors.filter((a) => byPerson.has([...byPerson].find(([, o]) => o.id === a.id)?.[0] ?? -1)).length} kept from before), ≥${MIN_WORKS} works`);

  // Keep only people someone in the game can need.
  const needed = new Set<number>();
  for (const w of Object.values(works)) for (const p of w.c) needed.add(p);
  const prunedPersons: Record<number, [string, string]> = {};
  for (const p of needed) prunedPersons[p] = persons[p] ?? ["", ""];
  write("casts.json", { persons: prunedPersons, works });

  // ----- titles -----
  const titles = oldTitles.filter((t) => inPeriod(t.year));
  const have = new Set(titles.map((t) => norm(t.titleAr)));
  const clueOf = (pid: number): Clue | null => {
    const a = actors.find((x) => personOf.get(x.id) === pid) ?? [...byPerson].find(([p]) => p === pid)?.[1];
    const [ar, en] = persons[pid] ?? ["", ""];
    const photo = a?.photo ?? (profile.get(pid) ? photoUrl(profile.get(pid)!) : null);
    return ar && photo ? { nameAr: a?.nameAr ?? ar, nameEn: a?.nameEn ?? en, photo } : null;
  };
  let added = 0;
  for (const [id, w] of Object.entries(works)) {
    const m = meta.get(id)!;
    if (!id.match(/^[ms]:/) || m.vc < 3 || have.has(norm(w.ar))) continue;
    const six = w.c.map(clueOf).filter((c): c is Clue => !!c).slice(0, 6);
    if (six.length < 4) continue;
    // Supporting actors first, the stars last: that's the order the game reveals them.
    const clues: (Clue | null)[] = [...six].reverse();
    while (clues.length < 6) clues.unshift(null);
    titles.push({
      id,
      titleAr: w.ar,
      titleEn: m.en ?? "",
      aliases: m.alt,
      type: m.type,
      year: w.y!,
      genres: [...new Set(m.g.map((g) => GENRES[g]).filter(Boolean))].slice(0, 3).length ? [...new Set(m.g.map((g) => GENRES[g]).filter(Boolean))].slice(0, 3) : ["other"],
      difficulty: m.vc >= 40 ? "easy" : m.vc >= 12 ? "medium" : "hard",
      clues,
    });
    have.add(norm(w.ar));
    added++;
  }
  write("titles.json", titles);
  console.log(`titles: ${titles.length - added} curated + ${added} generated`);
  write("filmography.json", actors);
  for (const f of ["casts.json", "filmography.json", "titles.json"]) console.log(f, Math.round(fs.statSync(path.join(DATA, f)).size / 1024), "KB");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
