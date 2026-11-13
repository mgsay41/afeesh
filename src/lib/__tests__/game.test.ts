import { describe, expect, it } from "vitest";
import titlesJson from "@/data/titles.json";
import { judgeGuess, normalizeArabic, similarity } from "@/lib/arabic";
import type { Title } from "@/lib/content-types";
import {
  acceptGuess,
  createGame,
  joinPlayer,
  nextStage,
  pickTitles,
  revealAnswer,
  showHint,
  startGame,
  submitGuess,
  toPublic,
  type TitleMap,
} from "@/lib/game/engine";
import type { Settings } from "@/lib/game/types";

const titles = titlesJson as Title[];
const map: TitleMap = Object.fromEntries(titles.map((t) => [t.id, t]));

describe("normalizeArabic", () => {
  it("unifies letter variants and strips the article", () => {
    expect(normalizeArabic("الفيل الأزرق")).toBe("فيل ازرق");
    expect(normalizeArabic("عمارة يعقوبيان")).toBe("عماره يعقوبيان");
    expect(normalizeArabic("آسِفٌ على الإزعاج!")).toBe("اسف علي ازعاج");
    expect(normalizeArabic("فيلم عسل إسود")).toBe("عسل اسود");
  });
});

describe("judgeGuess", () => {
  const cases: [string, string][] = [
    ["عسل اسود", "عسل إسود"],
    ["الفيل الازرق", "الفيل الأزرق"],
    ["فيل ازرق", "الفيل الأزرق"],
    ["عماره يعقوبين", "عمارة يعقوبيان"],
    ["اسف علي الازعاج", "آسف على الإزعاج"],
    ["ولاد العم", "ولاد العم"],
    ["مسلسل ولاد العم", "ولاد العم"],
  ];
  it.each(cases)("accepts %s for %s", (guess, answer) => {
    expect(judgeGuess(guess, [answer]).verdict).toBe("correct");
  });

  it("rejects unrelated titles", () => {
    expect(judgeGuess("عمارة يعقوبيان", ["الفيل الأزرق"]).verdict).toBe("wrong");
    expect(judgeGuess("اللمبي", ["عسل إسود"]).verdict).toBe("wrong");
  });

  it("flags near misses as close", () => {
    expect(judgeGuess("عسل احمر", ["عسل إسود"]).verdict).not.toBe("correct");
    expect(similarity("الفيل الاحمر", "الفيل الأزرق")).toBeGreaterThan(0.4);
  });
});

const settings: Settings = { rounds: 3, pool: "all", difficulty: "any", autoRevealSec: 0 };

function setup() {
  let s = createGame("ABCD", { id: "host", name: "مضيف", avatar: "🎬" }, settings, 0);
  s = joinPlayer(s, { id: "p1", name: "سارة", avatar: "🍿" }, 1);
  s = joinPlayer(s, { id: "p2", name: "سارة", avatar: "⭐" }, 2);
  const ids = titles.filter((t) => t.clues.slice(0, 3).every(Boolean)).slice(0, 3).map((t) => t.id);
  return startGame(s, ids, map, 10);
}

describe("engine", () => {
  it("dedupes names and starts at stage 1 without leaking the answer", () => {
    const s = setup();
    expect(s.players.p2.name).toBe("سارة 2");
    const pub = toPublic(s, map, 10);
    expect(pub.round?.stage).toBe(1);
    expect(pub.round?.clues.filter((c) => c === "hidden")).toHaveLength(3);
    expect(pub.round?.answer).toBeUndefined();
    expect(JSON.stringify(pub)).not.toContain(map[s.round!.titleId].titleAr);
  });

  it("scores by stage, hints and first bonus", () => {
    let s = setup();
    const t = map[s.round!.titleId];
    let r = submitGuess(s, map, { playerId: "p1", guessId: "g1", roundIndex: 0, text: t.titleAr }, 11);
    expect(r.result).toMatchObject({ verdict: "correct", points: 120 });
    s = showHint(nextStage(r.state, 12), "genre");
    r = submitGuess(s, map, { playerId: "p2", guessId: "g2", roundIndex: 0, text: t.titleAr }, 13);
    expect(r.result.points).toBe(60); // stage 2 (70) − 1 hint (10)
    expect(r.state.round!.revealed).toBe(false); // host hasn't guessed yet
    r = submitGuess(r.state, map, { playerId: "host", guessId: "g3", roundIndex: 0, text: t.titleAr }, 14);
    expect(r.state.round!.revealed).toBe(true); // everyone got it → auto reveal
  });

  it("locks after 3 misses, rejects non-Arabic, and lets the host accept", () => {
    let s = setup();
    const r1 = submitGuess(s, map, { playerId: "p1", guessId: "x", roundIndex: 0, text: "Bittersweet" }, 11);
    expect(r1.result.verdict).toBe("invalid");
    for (let i = 0; i < 3; i++) {
      s = submitGuess(s, map, { playerId: "p1", guessId: `w${i}`, roundIndex: 0, text: "كلام غلط خالص" }, 11).state;
    }
    const locked = submitGuess(s, map, { playerId: "p1", guessId: "w4", roundIndex: 0, text: "اي حاجة" }, 12);
    expect(locked.result.verdict).toBe("locked");
    const acc = acceptGuess(s, "w0");
    expect(acc.result?.points).toBe(120);
    expect(acc.state.players.p1.score).toBe(120);
  });

  it("ignores guesses after reveal", () => {
    const s = revealAnswer(setup());
    const t = map[s.round!.titleId];
    const r = submitGuess(s, map, { playerId: "p1", guessId: "g", roundIndex: 0, text: t.titleAr }, 20);
    expect(r.result.verdict).toBe("late");
    expect(toPublic(s, map, 20).round?.answer?.titleAr).toBe(t.titleAr);
  });

  it("picks unused titles first and respects the pool", () => {
    const series = pickTitles(titles, { ...settings, pool: "series", rounds: 5 }, [], () => 0.5);
    expect(series.every((id) => map[id].type === "series")).toBe(true);
    const used = titles.slice(0, 90).map((t) => t.id);
    const picked = pickTitles(titles, { ...settings, rounds: 5 }, used);
    expect(picked.every((id) => !used.includes(id))).toBe(true);
  });
});

describe("content", () => {
  it("every title has an Arabic name and 6 clue slots with at least the leads", () => {
    for (const t of titles) {
      expect(t.titleAr.length).toBeGreaterThan(0);
      expect(t.year).toBeGreaterThan(1990);
      expect(t.clues).toHaveLength(6);
      expect(t.clues[5]).not.toBeNull();
    }
  });
});
