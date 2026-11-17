/**
 * Builds src/data/filmography.json (game 2: "name 5 titles of this actor").
 *
 *   npm run filmography
 *
 * Source: Wikidata (no API key). Actors come from the game-1 data (src/data/titles.json);
 * works come from the "cast member" property, plus every Top 100 title the actor is a clue in.
 * Wikidata is patchy for newer TV, so hand fixes go in content/filmography-overrides.json
 * and the host can also accept a title live during the game.
 */
import fs from "node:fs";
import path from "node:path";
import { normalizeArabic } from "../src/lib/arabic";
import type { FilmActor, Title, Work } from "../src/lib/content-types";

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src/data/filmography.json");
const MIN_WORKS = 10; // fewer than this and "name 5" is unfair
const MAX_WORKS = 120;
const BATCH = 12;
const UA = { "User-Agent": "afeesh-content-script/1.0" };
const CLASS_SERIES = new Set(["Q5398426", "Q1259759"]); // TV series, miniseries (Q11424 = film)

const titles = JSON.parse(fs.readFileSync(path.join(ROOT, "src/data/titles.json"), "utf8")) as Title[];
const overrides = JSON.parse(fs.readFileSync(path.join(ROOT, "content/filmography-overrides.json"), "utf8")) as {
  people: Record<string, { qid?: string; add?: Omit<Work, "id">[]; remove?: string[] }>;
};

interface Base {
  nameAr: string;
  nameEn: string;
  photo: string;
  id: string;
}
const actors = new Map<string, Base>();
for (const t of titles) {
  for (const c of t.clues) {
    if (c?.photo && !actors.has(c.nameAr)) {
      actors.set(c.nameAr, { nameAr: c.nameAr, nameEn: c.nameEn, photo: c.photo, id: path.basename(c.photo, ".webp") });
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Row = Record<string, { value: string }>;

async function sparql(query: string): Promise<Row[]> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch("https://query.wikidata.org/sparql?format=json&query=" + encodeURIComponent(query), { headers: UA });
      if (res.ok) return ((await res.json()) as { results: { bindings: Row[] } }).results.bindings;
      if (res.status !== 429 && res.status < 500) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (attempt === 4) throw e;
    }
    await sleep(2000 * attempt);
  }
  return [];
}

interface Raw {
  sl: number;
  work: Work;
}
/** person Q-id → works */
type Found = Map<string, { name: string; works: Map<string, Raw> }>;

const WORK_PATTERN = `
    ?w wdt:P161 ?p ; wdt:P31 ?cls ; wikibase:sitelinks ?sl .
    VALUES ?cls { wd:Q11424 wd:Q5398426 wd:Q1259759 }
    ?w rdfs:label ?wAr FILTER(LANG(?wAr)="ar")
    OPTIONAL { ?w rdfs:label ?wEn FILTER(LANG(?wEn)="en") }
    OPTIONAL { ?w wdt:P577 ?d . BIND(YEAR(?d) AS ?year) }`;

async function fetchBatch(labels: string[], lang: "ar" | "en", found: Found) {
  const values = labels.map((n) => `${JSON.stringify(n)}@${lang}`).join(" ");
  addRows(
    await sparql(`SELECT ?n ?p ?w ?wAr ?wEn ?cls ?year ?sl WHERE {
    VALUES ?n { ${values} }
    ?p rdfs:label ?n ; wdt:P31 wd:Q5 .${WORK_PATTERN}
  }`),
    found,
  );
}

async function fetchByQid(qid: string, found: Found) {
  const rows = await sparql(`SELECT ?p ?w ?wAr ?wEn ?cls ?year ?sl WHERE {
    BIND(wd:${qid} AS ?p)${WORK_PATTERN}
  }`);
  addRows(rows.map((r) => ({ ...r, n: { value: qid } })), found);
}

function addRows(rows: Row[], found: Found) {
  for (const r of rows) {
    const pid = r.p.value.split("/").pop()!;
    const wid = r.w.value.split("/").pop()!;
    const person = found.get(pid) ?? { name: r.n.value, works: new Map<string, Raw>() };
    found.set(pid, person);
    const year = r.year ? Number(r.year.value) : undefined;
    const prev = person.works.get(wid);
    person.works.set(wid, {
      sl: Number(r.sl.value),
      work: {
        id: wid,
        ar: r.wAr.value,
        en: r.wEn?.value,
        type: CLASS_SERIES.has(r.cls.value.split("/").pop()!) ? "series" : "movie",
        year: prev?.work.year && year ? Math.min(prev.work.year, year) : (year ?? prev?.work.year),
      },
    });
  }
}

/** Person for a label = the one with the most works (handles two people with the same name). */
const best = (found: Found, name: string) =>
  [...found.values()].filter((p) => p.name === name).sort((a, b) => b.works.size - a.works.size)[0];

async function main() {
  const all = [...actors.values()];
  const pinned = all.filter((a) => overrides.people[a.nameAr]?.qid);
  const unpinned = all.filter((a) => !overrides.people[a.nameAr]?.qid);

  const foundAr: Found = new Map();
  for (let i = 0; i < unpinned.length; i += BATCH) {
    await fetchBatch(unpinned.slice(i, i + BATCH).map((a) => a.nameAr), "ar", foundAr);
    process.stdout.write(`\rArabic labels ${Math.min(i + BATCH, unpinned.length)}/${unpinned.length}`);
    await sleep(1200);
  }
  console.log();

  // Second chance: English label for anyone not found by Arabic name.
  const missing = unpinned.filter((a) => !best(foundAr, a.nameAr));
  const foundEn: Found = new Map();
  for (let i = 0; i < missing.length; i += BATCH) {
    await fetchBatch(missing.slice(i, i + BATCH).map((a) => a.nameEn), "en", foundEn);
    await sleep(1200);
  }

  const foundPinned = new Map<string, Found>();
  for (const a of pinned) {
    const f: Found = new Map();
    await fetchByQid(overrides.people[a.nameAr].qid!, f);
    foundPinned.set(a.nameAr, f);
    await sleep(1200);
  }

  const out: FilmActor[] = [];
  const report: string[] = [];
  for (const a of all) {
    const person = foundPinned.has(a.nameAr)
      ? [...foundPinned.get(a.nameAr)!.values()][0]
      : (best(foundAr, a.nameAr) ?? best(foundEn, a.nameEn));
    const works = new Map<string, Raw>(person?.works ?? []);
    const seen = new Set([...works.values()].map((w) => normalizeArabic(w.work.ar)));

    // Top 100 titles this actor is a clue in are always correct answers.
    for (const t of titles) {
      if (!t.clues.some((c) => c?.nameAr === a.nameAr) || seen.has(normalizeArabic(t.titleAr))) continue;
      seen.add(normalizeArabic(t.titleAr));
      works.set(`t:${t.id}`, {
        sl: 500,
        work: { id: `t:${t.id}`, ar: t.titleAr, en: t.titleEn, alt: t.aliases, type: t.type, year: t.year },
      });
    }
    const o = overrides.people[a.nameAr];
    for (const w of o?.add ?? []) works.set(`o:${w.ar}`, { sl: 400, work: { ...w, id: `o:${w.ar}` } });
    for (const id of o?.remove ?? []) works.delete(id);

    const list = [...works.values()].sort((x, y) => y.sl - x.sl).slice(0, MAX_WORKS).map((w) => w.work);
    if (list.length < MIN_WORKS) {
      report.push(`skip ${a.nameAr} (${list.length} works${person ? "" : ", not found on Wikidata"})`);
      continue;
    }
    out.push({ id: a.id, nameAr: a.nameAr, nameEn: a.nameEn, photo: a.photo, works: list });
  }
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(report.join("\n"));
  console.log(`\n${out.length} actors written to src/data/filmography.json (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB), ${all.length - out.length} skipped`);
}

void main();
