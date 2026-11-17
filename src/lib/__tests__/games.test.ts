import { describe, expect, it } from "vitest";
import type { CastGraph, Title } from "@/lib/content-types";
import { decryptWith, encryptFor, makeKeyPair } from "@/lib/crypto";
import * as K from "../game/chain";
import * as C from "../game/charades";
import { createGame, joinPlayer } from "../game/engine";
import * as Q from "../game/quiz-engine";
import quotes from "@/data/quotes.json";
import { onePerTitle, stagedOf } from "../game/registry";
import { makeBeforeAfter, makeOdd } from "../game/quiz-questions";
import type { CharadesTitle, GameKind, GameState, QuizQuestion } from "../game/types";

const T0 = 1_000_000;
const host = { id: "host", name: "المضيف", avatar: "🎬" };

function room(game: GameKind, players = ["ali", "sara"], rounds = 2, keyed = true): GameState {
  let s = createGame("ABCDE", host, { game, rounds, pool: "all", difficulty: "any", autoRevealSec: 0 }, T0);
  for (const id of players) s = joinPlayer(s, { id, name: id, avatar: "🙂", key: keyed ? `key-${id}` : undefined }, T0);
  return s;
}
const score = (s: GameState, id: string) => s.players[id].score;

// ---------------------------------------------------------------- quiz

const questions: QuizQuestion[] = [
  { prompt: "أنهي الأول؟", choices: [{ label: "أ" }, { label: "ب" }], answer: 1, why: "…", seconds: 10 },
  { prompt: "مين الدخيل؟", choices: [{ label: "1" }, { label: "2" }, { label: "3" }, { label: "4" }], answer: 2, seconds: 15 },
];

describe("quiz engine", () => {
  const start = () => Q.startQuiz(room("beforeafter"), questions, T0);

  it("scores 100 + speed for the right tap and nothing for the wrong one", () => {
    let s = start();
    s = Q.submitPick(s, { playerId: "ali", roundIndex: 0, choice: 1 }, T0 + 0); // instant
    s = Q.submitPick(s, { playerId: "sara", roundIndex: 0, choice: 0 }, T0 + 1000);
    s = Q.revealQuiz(s);
    expect(score(s, "ali")).toBe(150);
    expect(score(s, "sara")).toBe(0);
    expect(s.quiz!.step).toBe("reveal");
  });

  it("speed bonus shrinks with time and is 0 at the buzzer", () => {
    expect(Q.quizPoints(questions[0], T0 + 5000, T0)).toBe(125);
    expect(Q.quizPoints(questions[0], T0 + 10_000, T0)).toBe(100);
  });

  it("counts one tap per player and ignores late, invalid or stale taps", () => {
    let s = start();
    s = Q.submitPick(s, { playerId: "ali", roundIndex: 0, choice: 0 }, T0 + 100);
    const again = Q.submitPick(s, { playerId: "ali", roundIndex: 0, choice: 1 }, T0 + 200);
    expect(again.quiz!.picks.ali.choice).toBe(0);
    expect(Q.submitPick(s, { playerId: "sara", roundIndex: 0, choice: 9 }, T0 + 200)).toBe(s);
    expect(Q.submitPick(s, { playerId: "sara", roundIndex: 5, choice: 1 }, T0 + 200)).toBe(s);
    expect(Q.submitPick(s, { playerId: "sara", roundIndex: 0, choice: 1 }, T0 + 10_000 + Q.QUIZ_GRACE_MS + 1)).toBe(s);
    expect(Q.submitPick(s, { playerId: "nobody", roundIndex: 0, choice: 1 }, T0 + 200)).toBe(s);
  });

  it("reveals early when everyone has answered", () => {
    let s = start();
    for (const id of ["host", "ali", "sara"]) s = Q.submitPick(s, { playerId: id, roundIndex: 0, choice: 1 }, T0 + 100);
    expect(s.quiz!.step).toBe("reveal");
  });

  it("keeps the answer out of the public state until the reveal", () => {
    const s = Q.submitPick(start(), { playerId: "ali", roundIndex: 0, choice: 1 }, T0 + 10);
    const pub = Q.publicOf(s, T0 + 20);
    expect(JSON.stringify(pub)).not.toContain('"answer"');
    expect(pub.quiz!.answered).toEqual(["ali"]);
    const revealed = Q.publicOf(Q.revealQuiz(s), T0 + 30);
    expect(revealed.quiz!.reveal!.answer).toBe(1);
    expect(revealed.players.find((p) => p.id === "ali")!.roundPoints).toBeGreaterThan(100);
  });

  it("walks through the questions and ends in the final phase", () => {
    let s = Q.revealQuiz(start());
    s = Q.nextQuiz(s, T0 + 20_000);
    expect(s.quiz!.index).toBe(1);
    expect(Q.nextQuiz(s, T0 + 21_000)).toBe(s); // still playing: can't skip ahead
    s = Q.nextQuiz(Q.revealQuiz(s), T0 + 40_000);
    expect(s.phase).toBe("final");
  });
});

describe("quiz questions", () => {
  const pool = [
    { ar: "أ", year: 1980, type: "movie" as const },
    { ar: "ب", year: 2000, type: "movie" as const },
    { ar: "ج", year: 2003, type: "series" as const },
    { ar: "د", year: 2004, type: "movie" as const },
  ];

  it("before/after puts the earlier year at the answer index", () => {
    const qs = makeBeforeAfter(pool, 5, "any");
    expect(qs.length).toBeGreaterThan(0);
    for (const q of qs) {
      const years = q.choices.map((c) => pool.find((w) => w.ar === c.label)!.year);
      expect(years[q.answer]).toBe(Math.min(...years));
      expect(years[0]).not.toBe(years[1]);
    }
  });

  it("difficulty decides the year gap", () => {
    for (const q of makeBeforeAfter(pool, 5, "hard")) {
      const [a, b] = q.choices.map((c) => pool.find((w) => w.ar === c.label)!.year);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(4);
    }
    for (const q of makeBeforeAfter(pool, 5, "easy")) {
      const [a, b] = q.choices.map((c) => pool.find((w) => w.ar === c.label)!.year);
      expect(Math.abs(a - b)).toBeGreaterThanOrEqual(15);
    }
  });

  it("odd-one-out never uses an actor who is in the film's cast", () => {
    const names = ["أحمد زكي", "منى زكي", "كريم عبد العزيز", "ياسمين صبري", "محمد رمضان", "هند صبري", "أحمد السقا"];
    const clue = (i: number) => ({ nameAr: names[i], nameEn: `Actor ${i}`, photo: `/actors/${i}.webp` });
    const title = {
      id: "tt1", titleAr: "فيلم", titleEn: "Film", aliases: [], type: "movie", year: 2000, genres: ["drama"], difficulty: "easy",
      clues: [clue(0), clue(1), clue(2), clue(3), null, null],
    } as Title;
    const other = { ...title, id: "tt2", clues: [clue(4), clue(5), clue(6), null, null, null] } as Title;
    // The cast of tt1 also includes actor 4, so he can't be the outsider there.
    const graph: CastGraph = {
      persons: { 1: [names[0], ""], 2: [names[1], ""], 3: [names[4], ""] },
      works: { "t:tt1": { ar: "فيلم", c: [1, 2, 3] }, "t:tt2": { ar: "تاني", c: [1] } },
    };
    for (let i = 0; i < 20; i++) {
      const qs = makeOdd([title, other], graph, 2, []);
      for (const q of qs) {
        const odd = q.choices[q.answer].label;
        expect(q.choices.filter((c) => c.label === odd)).toHaveLength(1);
        if (q.why?.includes("«فيلم»")) expect([names[0], names[1], names[4]]).not.toContain(odd);
      }
    }
  });
});

// ---------------------------------------------------------------- charades

const deck: CharadesTitle[] = Array.from({ length: 12 }, (_, i) => ({ id: `t${i}`, ar: i === 0 ? "الفيل الأزرق" : `عمل رقم ${i}`, type: "movie" as const }));

describe("charades", () => {
  const start = (keyed = true) => C.startCharades(room("charades", ["ali", "sara"], 1, keyed), deck, T0);

  it("gives every player who can receive a secret one turn per cycle", () => {
    const s = start();
    expect(s.charades!.order.sort()).toEqual(["ali", "host", "sara"]);
    // Without WebCrypto only the host can perform.
    expect(start(false).charades!.order).toEqual(["host"]);
    const two = C.startCharades(room("charades", ["ali"], 2), deck, T0);
    expect(two.charades!.order).toHaveLength(4);
  });

  it("scores guessers by speed and gives the performer 50 once", () => {
    let s = start();
    const turn = s.charades!.turn;
    s = C.beginTurn(s, T0);
    const guessers = Object.keys(s.players).filter((id) => id !== turn.performerId);
    const title = turn.title.ar;
    const first = C.submitCharadesGuess(s, { playerId: guessers[0], guessId: "g1", roundIndex: 0, text: title }, T0 + 0);
    expect(first.result.verdict).toBe("correct");
    expect(first.result.points).toBe(100);
    const second = C.submitCharadesGuess(first.state, { playerId: guessers[1], guessId: "g2", roundIndex: 0, text: title }, T0 + 30_000);
    expect(second.result.points).toBe(75);
    expect(score(second.state, turn.performerId)).toBe(50);
    expect(second.state.charades!.turn.step).toBe("done"); // everyone guessed
  });

  it("rejects the performer, late guesses, repeats and wrong answers", () => {
    let s = C.beginTurn(start(), T0);
    const t = s.charades!.turn;
    const other = Object.keys(s.players).find((id) => id !== t.performerId)!;
    const g = (playerId: string, text: string, now = T0 + 1000, roundIndex = 0) =>
      C.submitCharadesGuess(s, { playerId, guessId: text + now, roundIndex, text }, now);
    expect(g(t.performerId, t.title.ar).result.verdict).toBe("locked");
    expect(g(other, t.title.ar, T0 + 60_000 + C.GRACE_MS + 1).result.verdict).toBe("late");
    expect(g(other, t.title.ar, T0 + 1000, 7).result.verdict).toBe("late");
    expect(g(other, "حاجة تانية خالص").result.verdict).toBe("wrong");
    expect(g(other, "A latin guess").result.verdict).toBe("invalid");
    s = g(other, t.title.ar).state;
    expect(g(other, t.title.ar).result.verdict).toBe("already");
  });

  it("allows a single swap, and only before anyone guessed", () => {
    const s = start();
    const first = s.charades!.turn.title.id;
    const swapped = C.skipTitle(s);
    expect(swapped.charades!.turn.title.id).not.toBe(first);
    expect(C.skipTitle(swapped)).toBe(swapped);
  });

  it("never exposes the title before the turn is over", () => {
    const s = C.beginTurn(start(), T0);
    const title = s.charades!.turn.title.ar;
    expect(JSON.stringify(C.publicOf(s, T0 + 10))).not.toContain(title);
    expect(C.publicOf(C.endTurn(s), T0 + 10).charades!.reveal!.title).toBe(title);
  });

  it("moves on to the next performer and finishes after the last turn", () => {
    let s = start();
    const total = s.charades!.order.length;
    for (let i = 0; i < total; i++) {
      expect(s.charades!.turn.index).toBe(i);
      s = C.nextTurn(C.endTurn(C.beginTurn(s, T0)));
    }
    expect(s.phase).toBe("final");
  });
});

// ---------------------------------------------------------------- chain

/** Tiny world: works W1..W3, actors A..D with Arabic names. */
const names: Record<string, string[]> = {
  W1: ["الفيل الأزرق"], W2: ["تراب الماس"], W3: ["الجزيرة"],
  pA: ["أحمد السقا"], pB: ["منى زكي"], pC: ["كريم عبد العزيز"], pD: ["هند صبري"],
};
const cast: Record<string, string[]> = { W1: ["pA", "pB"], W2: ["pA", "pC"], W3: ["pC", "pD"] };
const data: K.ChainData = {
  names: (id) => names[id],
  label: (id) => names[id][0],
  poster: () => undefined,
  castOf: (w) => cast[w] ?? [],
  worksOf: (a) => Object.keys(cast).filter((w) => cast[w].includes(a)),
  starts: () => ["W1"],
};

describe("chain", () => {
  const start = (players = ["ali", "sara"]) => {
    const s = K.startChain(room("chain", players, 0), data, T0, () => 0);
    return { ...s, chain: { ...s.chain!, turnOf: "ali" } } as GameState;
  };
  const say = (s: GameState, playerId: string, text: string, now = T0 + 1000) =>
    K.submitLink(s, data, { playerId, guessId: `${playerId}-${text}-${now}`, roundIndex: s.chain!.links.length, text }, now);

  it("builds title → actor → title and passes the turn", () => {
    let s = start();
    let r = say(s, "ali", "احمد السقا"); // different spelling is fine
    expect(r.result.verdict).toBe("correct");
    s = r.state;
    expect(s.chain!.links.map((l) => l.id)).toEqual(["W1", "pA"]);
    expect(s.chain!.turnOf).not.toBe("ali");
    expect(score(s, "ali")).toBe(10);
    r = say(s, s.chain!.turnOf, "تراب الماس");
    expect(r.state.chain!.links.map((l) => l.id)).toEqual(["W1", "pA", "W2"]);
  });

  it("refuses actors who weren't in the title and doesn't lose a heart for a wrong try", () => {
    const s = start();
    const r = say(s, "ali", "هند صبري");
    expect(r.result.verdict).toBe("wrong");
    expect(r.state.chain!.rejected).toHaveLength(1);
    expect(r.state.chain!.hearts.ali).toBe(K.HEARTS);
    expect(r.state.chain!.turnOf).toBe("ali"); // can try again
  });

  it("ignores answers from the wrong player, the wrong link or after the clock", () => {
    const s = start();
    expect(say(s, "sara", "احمد السقا").result.verdict).toBe("late");
    expect(K.submitLink(s, data, { playerId: "ali", guessId: "x", roundIndex: 9, text: "احمد السقا" }, T0 + 10).result.verdict).toBe("late");
    expect(say(s, "ali", "احمد السقا", T0 + 15_000 + K.GRACE_MS + 1).result.verdict).toBe("late");
  });

  it("doesn't allow repeating something already in the chain", () => {
    let s = start();
    s = say(s, "ali", "احمد السقا").state;
    s = say(s, s.chain!.turnOf, "تراب الماس").state;
    s = say(s, s.chain!.turnOf, "احمد السقا").state; // actor of W2 — already used
    expect(s.chain!.links).toHaveLength(3);
  });

  it("costs a heart on timeout and after five refused answers", () => {
    let s = K.timeoutTurn(start(), T0 + 20_000);
    expect(s.chain!.hearts.ali).toBe(K.HEARTS - 1);
    expect(s.chain!.turnOf).toBe("sara");
    expect(s.chain!.event!.type).toBe("timeout");

    s = start();
    for (let i = 0; i < K.MAX_TRIES; i++) s = say(s, "ali", `غلط ${i}`).state;
    expect(s.chain!.hearts.ali).toBe(K.HEARTS - 1);
    expect(s.chain!.turnOf).toBe("sara");
  });

  it("ends with the last player standing, who gets 50", () => {
    let s = start(["ali"]);
    s = { ...s, players: Object.fromEntries(Object.entries(s.players).filter(([id]) => id !== "host")) };
    s = { ...s, chain: { ...s.chain!, hearts: { ali: 1, sara: K.HEARTS }, turnOf: "ali" } } as GameState;
    s = joinPlayer(s, { id: "sara", name: "sara", avatar: "🙂" }, T0);
    s = K.timeoutTurn(s, T0 + 20_000);
    expect(s.chain!.over).toBe(true);
    expect(s.chain!.winnerId).toBe("sara");
    expect(score(s, "sara")).toBe(K.WIN_BONUS);
  });

  it("lets the host accept a refused answer (our data has gaps)", () => {
    let s = start();
    s = say(s, "ali", "ممثل مش عندنا").state;
    const entry = s.chain!.rejected[0];
    const r = K.acceptLink(s, entry.id, T0 + 2000);
    expect(r.result!.verdict).toBe("correct");
    expect(r.state.chain!.links[1].label).toBe("ممثل مش عندنا");
    expect(score(r.state, "ali")).toBe(10);
    expect(r.state.chain!.rejected).toHaveLength(0);
  });

  it("only sends the last links publicly and counts them", () => {
    const pub = K.publicOf(start(), T0 + 100).chain!;
    expect(pub.count).toBe(1);
    expect(pub.expect).toBe("actor");
  });
});

// ---------------------------------------------------------------- private messages

describe("private messages", () => {
  it("only the owner of the key can read the title", async () => {
    const [a, b] = await Promise.all([makeKeyPair(), makeKeyPair()]);
    expect(a && b).toBeTruthy();
    const msg = await encryptFor(a!.publicJwk, "الفيل الأزرق");
    expect(msg.ct).not.toContain("الفيل");
    expect(await decryptWith(a!.privateKey, msg)).toBe("الفيل الأزرق");
    await expect(decryptWith(b!.privateKey, msg)).rejects.toBeTruthy();
  });
});

// ---------------------------------------------------------------- quote content

describe("quotes", () => {
  it("every line is complete and none is listed twice", () => {
    const lines = new Set<string>();
    for (const q of quotes as { line: string; titleAr: string; year: number; type: string; genres: string[]; by: string }[]) {
      expect(q.line.trim().length).toBeGreaterThan(3);
      expect(q.titleAr.trim()).not.toBe("");
      expect(q.by.trim()).not.toBe("");
      expect(q.year).toBeGreaterThan(1930);
      expect(q.year).toBeLessThanOrEqual(2026);
      expect(["movie", "series"]).toContain(q.type);
      expect(q.genres.length).toBeGreaterThan(0);
      expect(lines.has(q.line)).toBe(false);
      lines.add(q.line);
    }
  });

  it("a game never shows the same film twice", () => {
    const pool = stagedOf("quote").all;
    const picked = onePerTitle(pool);
    expect(new Set(picked.map((t) => t.titleAr)).size).toBe(picked.length);
    expect(picked.length).toBeLessThan(pool.length); // some films have several lines
  });
});
