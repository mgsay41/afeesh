import filmographyJson from "@/data/filmography.json";
import type { FilmActor } from "@/lib/content-types";
import type { ActorMap } from "./five-engine";

// Imported only by host code — players never download the filmographies.
export const ACTORS = filmographyJson as FilmActor[];
export const ACTOR_MAP: ActorMap = Object.fromEntries(ACTORS.map((a) => [a.id, a]));
