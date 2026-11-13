import titlesJson from "@/data/titles.json";
import type { Title } from "@/lib/content-types";
import type { TitleMap } from "./engine";

// Imported only by host code — players never download the answers.
export const TITLES = titlesJson as Title[];
export const TITLE_MAP: TitleMap = Object.fromEntries(TITLES.map((t) => [t.id, t]));
