/**
 * Builds src/data/titles.json and public/actors/*.webp from content/source.xlsx.
 *
 *   npm run content            # build (reuses cached photos)
 *   TMDB_API_KEY=... npm run content   # also look up missing photos on TMDB
 *
 * Photo policy: IMDb/Amazon images are NOT used (not licensed for reuse).
 * Sources in order: content/overrides.json → TMDB/Wikimedia link from the sheet
 * → Wikidata (Wikimedia Commons image) → TMDB search (if key) → none (initials card).
 */
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import sharp from "sharp";
import type { Clue, Genre, Title } from "../src/lib/content-types";

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "content/source.xlsx");
const OVERRIDES = path.join(ROOT, "content/overrides.json");
const SOURCES_CACHE = path.join(ROOT, "content/photo-sources.json");
const OUT_JSON = path.join(ROOT, "src/data/titles.json");
const OUT_PHOTOS = path.join(ROOT, "public/actors");
const UA = { "User-Agent": "afeesh-content-script/1.0" };
const TMDB_KEY = process.env.TMDB_API_KEY;

type Row = Record<string, unknown>;
type Cell = { v?: unknown; l?: { Target?: string } };

const overrides = JSON.parse(fs.readFileSync(OVERRIDES, "utf8")) as {
  drop: { titles: string[] };
  aliases: Record<string, string[]>;
  photos: Record<string, string>;
};
const sourceCache: Record<string, string | null> = fs.existsSync(SOURCES_CACHE)
  ? JSON.parse(fs.readFileSync(SOURCES_CACHE, "utf8"))
  : {};

const wb = XLSX.readFile(SRC);
const sheetRows = (name: string) =>
  XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { defval: "" });
const str = (v: unknown) => String(v ?? "").trim();

// ---------- Actors (with hyperlink targets from the Photo column) ----------
const actorSheet = wb.Sheets["Actors"];
const actorRange = XLSX.utils.decode_range(actorSheet["!ref"]!);
const actors = new Map<string, { nameEn: string; sheetPhoto: string | null }>();
for (let r = 1; r <= actorRange.e.r; r++) {
  const cell = (c: number) => actorSheet[XLSX.utils.encode_cell({ r, c })] as Cell | undefined;
  const nameAr = str(cell(0)?.v);
  if (!nameAr) continue;
  actors.set(nameAr, { nameEn: str(cell(1)?.v), sheetPhoto: cell(2)?.l?.Target ?? null });
}

// ---------- Titles + clues ----------
const GENRE_MAP: Record<string, Genre> = {
  Comedy: "comedy", Drama: "drama", Crime: "crime", Action: "action", Romance: "romance",
  Mystery: "mystery", Thriller: "thriller", Adventure: "adventure", Fantasy: "fantasy",
  Family: "family", Biography: "biography", Music: "music", Musical: "music", Horror: "horror",
  History: "history", War: "war", Sport: "sport",
};

const clueRows = new Map(sheetRows("Clues").map((r) => [str(r["Arabic title"]), r]));
const top = sheetRows("Top 100").filter((r) => str(r["Title"]));

function difficultyFor(votes: number): Title["difficulty"] {
  if (votes >= 3000) return "easy";
  if (votes >= 800) return "medium";
  return "hard";
}

const isLicensedSource = (url: string) =>
  /image\.tmdb\.org|commons\.wikimedia\.org|upload\.wikimedia\.org/.test(url);

async function wikidataPhoto(nameEn: string): Promise<string | null> {
  if (!nameEn) return null;
  const s = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&limit=5&search=${encodeURIComponent(nameEn)}`,
    { headers: UA },
  ).then((r) => r.json());
  const hit = (s.search ?? []).find((x: { description?: string }) =>
    /egypt|actor|actress|comedian|singer/i.test(x.description ?? ""),
  );
  if (!hit) return null;
  const e = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P18&entity=${hit.id}`,
    { headers: UA },
  ).then((r) => r.json());
  const file = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value as string | undefined;
  return file
    ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=400`
    : null;
}

async function tmdbPhoto(nameEn: string): Promise<string | null> {
  if (!TMDB_KEY || !nameEn) return null;
  const j = await fetch(
    `https://api.themoviedb.org/3/search/person?api_key=${TMDB_KEY}&query=${encodeURIComponent(nameEn)}`,
  ).then((r) => r.json());
  const p = (j.results ?? []).find((x: { profile_path?: string }) => x.profile_path);
  return p ? `https://image.tmdb.org/t/p/w185${p.profile_path}` : null;
}

async function resolvePhotoSource(nameAr: string): Promise<string | null> {
  if (overrides.photos[nameAr]) return overrides.photos[nameAr];
  if (nameAr in sourceCache && (sourceCache[nameAr] || !TMDB_KEY)) return sourceCache[nameAr];
  const a = actors.get(nameAr);
  let src: string | null = null;
  if (a?.sheetPhoto && isLicensedSource(a.sheetPhoto)) src = a.sheetPhoto;
  if (!src) src = await wikidataPhoto(a?.nameEn ?? "").catch(() => null);
  if (!src) src = await tmdbPhoto(a?.nameEn ?? "").catch(() => null);
  sourceCache[nameAr] = src;
  return src;
}

const slug = (s: string, fallback: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;

async function downloadPhoto(nameAr: string, src: string, file: string): Promise<boolean> {
  const out = path.join(OUT_PHOTOS, file);
  if (fs.existsSync(out)) return true;
  try {
    let res: Response | undefined;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(src, { headers: UA, redirect: "follow" });
      if (res.status !== 429) break;
      await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt)); // Wikimedia rate limit
    }
    if (!res!.ok) throw new Error(`HTTP ${res!.status}`);
    if (src.includes("wikimedia")) await new Promise((r) => setTimeout(r, 700));
    const buf = Buffer.from(await res!.arrayBuffer());
    await sharp(buf).resize(240, 300, { fit: "cover", position: "attention" }).webp({ quality: 78 }).toFile(out);
    return true;
  } catch (err) {
    console.warn(`  ! photo failed for ${nameAr}: ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  fs.mkdirSync(OUT_PHOTOS, { recursive: true });
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });

  const titles: Title[] = [];
  const photoFor = new Map<string, string | null>();
  let i = 0;

  for (const row of top) {
    const titleEn = str(row["Title"]);
    const titleAr = str(row["Arabic title"]);
    if (overrides.drop.titles.includes(titleEn)) continue;
    const clueRow = clueRows.get(titleAr);
    if (!clueRow) {
      console.warn(`  ! no clues for ${titleAr}`);
      continue;
    }
    const clueCols = Object.keys(clueRow).filter((k) => k.startsWith("Clue "));
    const clues: (Clue | null)[] = [];
    for (const col of clueCols) {
      const nameAr = str(clueRow[col]);
      if (!nameAr) {
        clues.push(null);
        continue;
      }
      if (!photoFor.has(nameAr)) {
        const src = await resolvePhotoSource(nameAr);
        const file = `${slug(actors.get(nameAr)?.nameEn ?? "", `actor-${++i}`)}.webp`;
        photoFor.set(nameAr, src && (await downloadPhoto(nameAr, src, file)) ? `/actors/${file}` : null);
      }
      clues.push({ nameAr, nameEn: actors.get(nameAr)?.nameEn ?? "", photo: photoFor.get(nameAr)! });
    }
    const id = str(row["IMDb link"]).match(/tt\d+/)?.[0] ?? slug(titleEn, `t${titles.length}`);
    titles.push({
      id,
      titleAr,
      titleEn,
      aliases: overrides.aliases[id] ?? [],
      type: str(row["Type"]).startsWith("TV") ? "series" : "movie",
      // Series can span years ("2010–2024"): use the first-season year.
      year: Number(str(row["Year"]).match(/\d{4}/)?.[0] ?? 0),
      genres: str(row["Genres"])
        .split(",")
        .map((g) => GENRE_MAP[g.trim()] ?? "other")
        .filter((g, idx, arr) => arr.indexOf(g) === idx),
      difficulty: difficultyFor(Number(row["Votes"]) || 0),
      clues,
    });
    process.stdout.write(".");
  }

  fs.writeFileSync(OUT_JSON, JSON.stringify(titles, null, 2) + "\n");
  fs.writeFileSync(SOURCES_CACHE, JSON.stringify(sourceCache, null, 2) + "\n");
  const withPhoto = [...photoFor.values()].filter(Boolean).length;
  console.log(
    `\n✓ ${titles.length} titles, ${photoFor.size} actors, ${withPhoto} with photos, ${photoFor.size - withPhoto} use initials`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
