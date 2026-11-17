/**
 * Builds src/data/casts.json (cast lists, posters, years) from TMDB.
 *
 *   npm run casts        # needs TMDB_API_KEY in .env.local; reruns use content/tmdb-cache.json
 *
 * Works come from src/data/filmography.json (Wikidata ids "Q…" and Top-100 ids "t:tt…").
 * We never fuzzy-search by name: Top-100 titles resolve through their IMDb id, the rest through the
 * TMDB ids stored on Wikidata (P4947 movie, P4983 TV) or their IMDb id (P345).
 * Actors without an Arabic name on TMDB get their Arabic label from Wikidata (P4985 = TMDB person id).
 * The key is only used here, never shipped to the browser.
 */
import fs from "node:fs";
import path from "node:path";
import { similarity } from "../src/lib/arabic";
import type { FilmActor, Title } from "../src/lib/content-types";

const ROOT = path.resolve(__dirname, "..");
try {
  process.loadEnvFile(path.join(ROOT, ".env.local"));
} catch {
  /* key may come from the shell */
}
const KEY = process.env.TMDB_API_KEY?.trim();
if (!KEY) throw new Error("Set TMDB_API_KEY in .env.local");

const OUT = path.join(ROOT, "src/data/casts.json");
const CACHE = path.join(ROOT, "content/tmdb-cache.json");
const TOP_CAST = 15;
const UA = { "User-Agent": "afeesh-content-script/1.0" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const hasArabic = (s: string) => /[؀-ۿ]/.test(s);

const actors = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/filmography.json"), "utf8")) as FilmActor[];
const titles = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/titles.json"), "utf8")) as Title[];

interface Work {
  id: string;
  type: "movie" | "series";
  ar: string;
  en?: string;
  year?: number;
}
const works = new Map<string, Work>();
for (const a of actors) for (const w of a.works) works.set(w.id, { id: w.id, type: w.type, ar: w.ar, en: w.en, year: w.year });
for (const t of titles) works.set(`t:${t.id}`, { id: `t:${t.id}`, type: t.type, ar: t.titleAr, en: t.titleEn, year: t.year });

/** [personId, name, originalName] per cast member, in billing order. */
interface Cached {
  ar?: string;
  y?: number;
  p?: string;
  c: [number, string, string][];
}
type Cache = Record<string, Cached | null>; // key "m:<tmdb id>" or "s:<tmdb id>"; null = looked up, nothing found
const cache: Cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const save = () => fs.writeFileSync(CACHE, JSON.stringify(cache));

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

async function pool<T>(items: T[], size: number, fn: (x: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }),
  );
}

async function findByImdb(imdb: string, type: Work["type"]): Promise<string | null> {
  const r = await tmdb<{ movie_results: { id: number }[]; tv_results: { id: number }[] }>(`/find/${imdb}?external_source=imdb_id`);
  if (!r) return null;
  const movie = r.movie_results[0];
  const tv = r.tv_results[0];
  const pick = type === "series" ? (tv ? `s:${tv.id}` : movie ? `m:${movie.id}` : null) : movie ? `m:${movie.id}` : tv ? `s:${tv.id}` : null;
  return pick;
}

async function main() {
  // 1) work id → TMDB key
  const ref = new Map<string, string>();
  const qids = [...works.keys()].filter((id) => /^Q\d+$/.test(id));
  console.log(`${works.size} works (${qids.length} from Wikidata)`);

  const tops = [...works.values()].filter((w) => w.id.startsWith("t:"));
  await pool(tops, 6, async (w) => {
    const k = await findByImdb(w.id.slice(2), w.type);
    if (k) ref.set(w.id, k);
  });
  console.log(`Top-100 resolved: ${ref.size}/${tops.length}`);

  const needImdb: { id: string; imdb: string }[] = [];
  for (let i = 0; i < qids.length; i += 100) {
    const batch = qids.slice(i, i + 100);
    const rows = await sparql(
      `SELECT ?q ?m ?tv ?imdb WHERE { VALUES ?q { ${batch.map((q) => `wd:${q}`).join(" ")} }
         OPTIONAL { ?q wdt:P4947 ?m } OPTIONAL { ?q wdt:P4983 ?tv } OPTIONAL { ?q wdt:P345 ?imdb } }`,
    );
    const by = new Map<string, { m?: string; tv?: string; imdb?: string }>();
    for (const r of rows) {
      const q = r.q.value.split("/").pop()!;
      by.set(q, { ...by.get(q), m: r.m?.value ?? by.get(q)?.m, tv: r.tv?.value ?? by.get(q)?.tv, imdb: r.imdb?.value ?? by.get(q)?.imdb });
    }
    for (const q of batch) {
      const x = by.get(q);
      const type = works.get(q)!.type;
      if (x?.tv && (type === "series" || !x.m)) ref.set(q, `s:${x.tv}`);
      else if (x?.m) ref.set(q, `m:${x.m}`);
      else if (x?.imdb) needImdb.push({ id: q, imdb: x.imdb });
    }
    process.stdout.write(`\rWikidata ids ${Math.min(i + 100, qids.length)}/${qids.length}`);
    await sleep(500);
  }
  console.log();
  await pool(needImdb, 6, async ({ id, imdb }) => {
    const k = await findByImdb(imdb, works.get(id)!.type);
    if (k) ref.set(id, k);
  });
  console.log(`Resolved to TMDB (ids): ${ref.size}/${works.size}`);

  // Fallback for works Wikidata has no TMDB id for: search by title, accept only a close title AND a year within ±1.
  const rest = [...works.values()].filter((w) => !ref.has(w.id) && w.year);
  let found = 0;
  await pool(rest, 6, async (w) => {
    const kind = w.type === "series" ? "tv" : "movie";
    for (const q of [w.ar, w.en].filter((x): x is string => !!x)) {
      const r = await tmdb<{ results: { id: number; title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string }[] }>(
        `/search/${kind}?language=ar&query=${encodeURIComponent(q)}`,
      );
      const hit = r?.results.find((x) => {
        const y = Number((x.release_date ?? x.first_air_date ?? "").slice(0, 4));
        const names = [x.title, x.name, x.original_title, x.original_name].filter((n): n is string => !!n);
        return Math.abs(y - w.year!) <= 1 && names.some((n) => similarity(n, w.ar) >= 0.9 || (w.en ? similarity(n, w.en) >= 0.9 : false));
      });
      if (hit) {
        ref.set(w.id, `${kind === "tv" ? "s" : "m"}:${hit.id}`);
        found++;
        return;
      }
    }
  });
  console.log(`Search fallback found ${found}/${rest.length}; resolved ${ref.size}/${works.size}`);

  // 2) details + credits per TMDB item (cached)
  const keys = [...new Set(ref.values())].filter((k) => !(k in cache));
  console.log(`Fetching ${keys.length} items from TMDB (${Object.keys(cache).length} cached)…`);
  let done = 0;
  await pool(keys, 8, async (k) => {
    const [kind, id] = k.split(":");
    type D = {
      title?: string;
      name?: string;
      release_date?: string;
      first_air_date?: string;
      poster_path?: string | null;
      credits?: { cast: { id: number; name: string; original_name: string; order: number }[] };
    };
    const d = await tmdb<D>(`/${kind === "m" ? "movie" : "tv"}/${id}?language=ar&append_to_response=credits`);
    cache[k] = d
      ? {
          ar: d.title ?? d.name,
          y: Number((d.release_date ?? d.first_air_date ?? "").slice(0, 4)) || undefined,
          p: d.poster_path ?? undefined,
          c: (d.credits?.cast ?? [])
            .sort((a, b) => a.order - b.order)
            .slice(0, TOP_CAST)
            .map((c): [number, string, string] => [c.id, c.name, c.original_name]),
        }
      : null;
    if (++done % 100 === 0) {
      save();
      process.stdout.write(`\r${done}/${keys.length}`);
    }
  });
  save();
  console.log();

  // 3) Arabic labels for cast without an Arabic name (Wikidata knows the TMDB person id)
  const names = new Map<number, [string, string]>(); // id → [ar, en]
  for (const k of new Set(ref.values())) {
    for (const [id, name, orig] of cache[k]?.c ?? []) {
      const ar = hasArabic(name) ? name : hasArabic(orig) ? orig : "";
      const en = hasArabic(name) ? (hasArabic(orig) ? "" : orig) : name;
      const prev = names.get(id);
      names.set(id, [prev?.[0] || ar, prev?.[1] || en]);
    }
  }
  const missing = [...names].filter(([, v]) => !v[0]).map(([id]) => id);
  console.log(`${names.size} cast members, ${missing.length} without an Arabic name → Wikidata`);
  for (let i = 0; i < missing.length; i += 150) {
    const batch = missing.slice(i, i + 150);
    const rows = await sparql(
      `SELECT ?id ?l WHERE { VALUES ?id { ${batch.map((x) => `"${x}"`).join(" ")} } ?p wdt:P4985 ?id . ?p rdfs:label ?l . FILTER(lang(?l) = "ar") }`,
    );
    for (const r of rows) {
      const id = Number(r.id.value);
      const prev = names.get(id);
      if (prev) names.set(id, [r.l.value, prev[1]]);
    }
    process.stdout.write(`\rlabels ${Math.min(i + 150, missing.length)}/${missing.length}`);
    await sleep(500);
  }
  console.log();

  // 4) write
  const out: {
    persons: Record<number, [string, string]>;
    works: Record<string, { ar: string; y?: number; p?: string; c: number[] }>;
  } = { persons: {}, works: {} };
  for (const [id, k] of ref) {
    const c = cache[k];
    if (!c || !c.c.length) continue;
    out.works[id] = { ar: c.ar ?? "", y: c.y, p: c.p, c: c.c.map((x) => x[0]) };
    for (const [pid] of c.c) out.persons[pid] = names.get(pid) ?? ["", ""];
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  const nWorks = Object.keys(out.works).length;
  const withAr = Object.values(out.persons).filter((p) => p[0]).length;
  const nPersons = Object.keys(out.persons).length;
  console.log(
    `casts.json: ${nWorks}/${works.size} works with a cast, ${nPersons} people (${Math.round((100 * withAr) / nPersons)}% with an Arabic name), ${Math.round(fs.statSync(OUT).size / 1024)} KB`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
