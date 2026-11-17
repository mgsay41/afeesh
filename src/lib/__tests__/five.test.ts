import { describe, expect, it } from "vitest";
import type { FilmActor } from "@/lib/content-types";
import { createGame, joinPlayer } from "@/lib/game/engine";
import {
  acceptEntry,
  beginFiveRound,
  endFiveRound,
  fivePoints,
  nextFiveRound,
  showFiveResults,
  startFiveGame,
  submitEntry,
  toPublicFive,
  undoEntry,
  type ActorMap,
} from "@/lib/game/five-engine";
import type { GameState } from "@/lib/game/types";

const actor: FilmActor = {
  id: "adel-emam",
  nameAr: "عادل إمام",
  nameEn: "Adel Emam",
  photo: "/actors/adel-emam.webp",
  works: [
    { id: "w1", ar: "عمارة يعقوبيان", type: "movie" },
    { id: "w2", ar: "الإرهاب والكباب", type: "movie" },
    { id: "w3", ar: "اللعب مع الكبار", type: "movie" },
    { id: "w4", ar: "حسن ومرقص", type: "movie" },
    { id: "w5", ar: "زهايمر", type: "movie", alt: ["الزهايمر"] },
    { id: "w6", ar: "فول الصين العظيم", type: "movie" },
    { id: "w7", ar: "مرجان أحمد مرجان", type: "movie", en: "Morgan Ahmed Morgan" },
  ],
};
const actors: ActorMap = { [actor.id]: actor };

function setup() {
  let s = createGame("ABCDE", { id: "host", name: "مضيف", avatar: "🎬" }, { game: "five", rounds: 2, pool: "all", difficulty: "any", autoRevealSec: 0 }, 0);
  s = joinPlayer(s, { id: "p1", name: "سارة", avatar: "🦊" }, 0);
  s = startFiveGame(s, ["adel-emam", "adel-emam"]);
  return beginFiveRound(s, 1000);
}

let seq = 0;
const enter = (s: GameState, playerId: string, text: string, at: number, remembered: string[] = []) =>
  submitEntry(s, actors, { playerId, guessId: `g${++seq}`, roundIndex: 0, text }, at, remembered);

describe("five: entries", () => {
  it("accepts correct titles and 20 points each", () => {
    let s = setup();
    const a = enter(s, "p1", "عمارة يعقوبيان", 2000);
    expect(a.result).toMatchObject({ verdict: "correct", points: 20 });
    s = a.state;
    s = enter(s, "p1", "الارهاب والكباب", 3000).state;
    expect(s.players.p1.score).toBe(40);
  });

  it("matches alternate spellings, aliases and English titles", () => {
    let s = setup();
    for (const t of ["عماره يعقوبيان", "الزهايمر", "morgan ahmed morgan"]) {
      const r = enter(s, "p1", t, 2000);
      expect(r.result.verdict).toBe("correct");
      s = r.state;
    }
  });

  it("counts the same film only once", () => {
    let s = setup();
    s = enter(s, "p1", "زهايمر", 2000).state;
    const r = enter(s, "p1", "الزهايمر", 2500);
    expect(r.result.verdict).toBe("duplicate");
    expect(r.state.players.p1.score).toBe(20);
  });

  it("rejects titles that are not in the filmography and keeps them for the host", () => {
    const s = setup();
    const r = enter(s, "p1", "الفيل الأزرق", 2000);
    expect(r.result.verdict).toBe("wrong");
    expect(r.state.five!.entries).toHaveLength(1);
    expect(r.state.players.p1.score).toBe(0);
  });

  it("rejects entries after the deadline plus one second of grace", () => {
    const s = setup(); // deadline = 31000
    expect(enter(s, "p1", "زهايمر", 31900).result.verdict).toBe("correct");
    expect(enter(s, "p1", "حسن ومرقص", 32100).result.verdict).toBe("late");
  });

  it("stops at five correct and awards the 5/5 bonus with the time bonus", () => {
    let s = setup();
    for (const t of ["عمارة يعقوبيان", "الإرهاب والكباب", "اللعب مع الكبار", "حسن ومرقص"]) s = enter(s, "p1", t, 2000).state;
    const fifth = enter(s, "p1", "زهايمر", 4000); // 27 s left → +9
    expect(fifth.result.points).toBe(20 + 20 + 9);
    expect(fifth.state.players.p1.score).toBe(100 + 20 + 9);
    expect(enter(fifth.state, "p1", "فول الصين العظيم", 5000).result.verdict).toBe("already");
  });

  it("caps the time bonus at 10", () => {
    let s = setup();
    for (const t of ["عمارة يعقوبيان", "الإرهاب والكباب", "اللعب مع الكبار", "حسن ومرقص", "زهايمر"]) s = enter(s, "p1", t, 1000).state;
    expect(fivePoints(s.five!, "p1")).toBe(130);
  });

  it("ignores repeated text and entries beyond the cap", () => {
    let s = setup();
    s = enter(s, "p1", "فيلم غلط", 2000).state;
    expect(enter(s, "p1", "فيلم غلط", 2100).result.verdict).toBe("duplicate");
    for (let i = 0; i < 14; i++) s = enter(s, "p1", `خطأ ${i}`, 2200).state;
    expect(enter(s, "p1", "زهايمر", 2300).result.verdict).toBe("locked");
  });

  it("ends the round when everyone has five", () => {
    let s = setup();
    for (const id of ["host", "p1"]) {
      for (const t of ["عمارة يعقوبيان", "الإرهاب والكباب", "اللعب مع الكبار", "حسن ومرقص", "زهايمر"]) s = enter(s, id, t, 2000).state;
    }
    expect(s.five!.step).toBe("review");
  });

  it("uses titles the host accepted earlier for this actor", () => {
    const s = setup();
    const r = enter(s, "p1", "الواد محروس بتاع الوزير", 2000, ["الواد محروس بتاع الوزير"]);
    expect(r.result.verdict).toBe("correct");
  });
});

describe("five: host override", () => {
  it("accepts a rejected title, adds points, and accepts the same title from others", () => {
    let s = setup();
    const a = enter(s, "p1", "كراكون في الشارع", 2000);
    const b = enter(a.state, "host", "كراكون في الشارع", 2500);
    s = b.state;
    const id = s.five!.entries.find((e) => e.playerId === "p1")!.id;
    const acc = acceptEntry(s, id);
    expect(acc.results.map((r) => r.to).sort()).toEqual(["host", "p1"]);
    expect(acc.state.players.p1.score).toBe(20);
    expect(acc.state.players.host.score).toBe(20);
  });

  it("gives the 5/5 bonus using the original send time", () => {
    let s = setup();
    for (const t of ["عمارة يعقوبيان", "الإرهاب والكباب", "اللعب مع الكبار", "حسن ومرقص"]) s = enter(s, "p1", t, 2000).state;
    s = enter(s, "p1", "فيلم ناقص", 4000).state; // 27 s left when sent
    s = endFiveRound(s);
    const id = s.five!.entries.find((e) => e.verdict === "wrong")!.id;
    const acc = acceptEntry(s, id);
    expect(acc.state.players.p1.score).toBe(100 + 20 + 9);
  });

  it("undo removes exactly the points it added", () => {
    let s = setup();
    s = enter(s, "p1", "كراكون في الشارع", 2000).state;
    const id = s.five!.entries[0].id;
    const acc = acceptEntry(s, id);
    const undone = undoEntry(acc.state, id);
    expect(undone.state.players.p1.score).toBe(0);
    expect(undone.result?.verdict).toBe("wrong");
  });

  it("does nothing for entries that are already correct", () => {
    let s = setup();
    s = enter(s, "p1", "زهايمر", 2000).state;
    expect(acceptEntry(s, s.five!.entries[0].id).accepted).toHaveLength(0);
  });
});

describe("five: flow and public state", () => {
  it("hides the actor until the round starts and never leaks titles while playing", () => {
    let s = createGame("ABCDE", { id: "host", name: "مضيف", avatar: "🎬" }, { game: "five", rounds: 1, pool: "all", difficulty: "any", autoRevealSec: 0 }, 0);
    s = startFiveGame(s, ["adel-emam"]);
    expect(toPublicFive(s, actors, 0)!.actor).toBeUndefined();
    s = beginFiveRound(s, 1000);
    s = enter(s, "host", "زهايمر", 2000).state;
    const pub = toPublicFive(s, actors, 5000)!;
    expect(pub.actor?.nameAr).toBe("عادل إمام");
    expect(pub.msLeft).toBe(26000);
    expect(pub.counts.host).toBe(1);
    expect(JSON.stringify(pub)).not.toContain("زهايمر");
  });

  it("results show each player's titles and well-known titles nobody said", () => {
    let s = setup();
    s = enter(s, "p1", "زهايمر", 2000).state;
    s = showFiveResults(endFiveRound(s));
    const pub = toPublicFive(s, actors, 9000)!;
    expect(pub.results!.titles.p1).toEqual(["زهايمر"]);
    expect(pub.results!.missed).toHaveLength(5);
    expect(pub.results!.missed).not.toContain("زهايمر");
  });

  it("moves round → review → results → next round → final", () => {
    let s = setup();
    expect(showFiveResults(s).five!.step).toBe("playing"); // can't skip the review
    s = showFiveResults(endFiveRound(s));
    expect(s.five!.step).toBe("results");
    s = nextFiveRound(s);
    expect(s.five).toMatchObject({ index: 1, step: "ready" });
    s = nextFiveRound(showFiveResults(endFiveRound(beginFiveRound(s, 0))));
    expect(s.phase).toBe("final");
  });
});
