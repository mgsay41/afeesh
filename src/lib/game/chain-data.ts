import type { CastGraph, FilmActor, Title } from "@/lib/content-types";
import { posterUrl } from "./quiz-questions";
import type { ChainData } from "./chain";

/**
 * Who was in what, built from the TMDB cast lists (host-only data). Work ids are those of filmography.json;
 * actors are "p<TMDB person id>".
 */
export function makeChainData(graph: CastGraph, actors: FilmActor[], titles: Title[]): ChainData {
  const extra = new Map<string, string[]>(); // our own spellings per work id
  for (const t of titles) extra.set(`t:${t.id}`, [t.titleAr, t.titleEn, ...t.aliases]);
  for (const a of actors) for (const w of a.works) if (!extra.has(w.id)) extra.set(w.id, [w.ar, w.en ?? "", ...(w.alt ?? [])]);

  const worksOf = new Map<string, string[]>();
  for (const [id, w] of Object.entries(graph.works)) {
    for (const p of w.c) (worksOf.get(`p${p}`) ?? worksOf.set(`p${p}`, []).get(`p${p}`)!).push(id);
  }
  // Titles that are among an actor's best known: good starting points for a chain.
  const famous = new Set<string>();
  for (const a of actors) for (const w of a.works.slice(0, 10)) if (graph.works[w.id]) famous.add(w.id);
  const starts = [...famous].filter((id) => graph.works[id].c.filter((p) => graph.persons[p]?.[0]).length >= 6 && extra.get(id)?.[0]);

  const personNames = (id: string) => graph.persons[id.slice(1)]?.filter(Boolean) ?? [];
  const isWork = (id: string) => id in graph.works;
  return {
    names: (id) => (isWork(id) ? [graph.works[id].ar, ...(extra.get(id) ?? [])].filter(Boolean) : personNames(id)),
    label: (id) => (isWork(id) ? (extra.get(id)?.[0] || graph.works[id].ar) : (personNames(id)[0] ?? "؟")),
    poster: (id) => (isWork(id) ? posterUrl(graph.works[id].p) : undefined),
    castOf: (workId) => (graph.works[workId]?.c ?? []).map((p) => `p${p}`),
    worksOf: (actorId) => worksOf.get(actorId) ?? [],
    starts: () => starts,
  };
}
