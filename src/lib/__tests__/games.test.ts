import { describe, expect, it } from "vitest";
import type { CastGraph, Title } from "@/lib/content-types";
import { decryptWith, encryptFor, makeKeyPair } from "@/lib/crypto";
import * as K from "../game/chain";
import * as C from "../game/charades";
import { createGame, joinPlayer } from "../game/engine";
import * as Q from "../game/quiz-engine";
import quotes from "@/data/quotes.json";
import casts from "@/data/casts.json";
import filmography from "@/data/filmography.json";
import linkPuzzles from "@/data/link-puzzles.json";
import titlesJson from "@/data/titles.json";
import { inPeriod } from "@/lib/period";
import { onePerTitle, publicOf, stagedOf, startAny } from "../game/registry";
import { GAMES } from "../game/games";
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

describe("team charades", () => {
  const first0 = () => 0.1; // team 0 acts first
  /** host + ali on team 0, sara + omar on team 1; one round = 2 turns. */
  const lobby = (rounds = 1, keyed = true) => {
    let s = room("charades", ["ali", "sara", "omar"], rounds, keyed);
    for (const [id, team] of [["host", 0], ["ali", 0], ["sara", 1], ["omar", 1]] as const) s = C.setTeam(s, id, team);
    return s;
  };
  const start = (rounds = 1) => C.startCharades(lobby(rounds), deck, T0, first0);
  /** Team 0 acts: ali performs, then the clock starts. */
  const acting = () => C.beginTurn(C.claimPerformer(start(), "ali"), T0);

  it("splits players who didn't choose and needs a player on each team", () => {
    let s = room("charades", ["ali", "sara", "omar"], 1);
    const started = C.startCharades(s, deck, T0);
    expect(C.teamMembers(started, 0).length).toBe(2);
    expect(C.teamMembers(started, 1).length).toBe(2);
    expect(started.charades!.total).toBe(2);
    // Everyone on one team: nothing to play against.
    for (const id of Object.keys(s.players)) s = C.setTeam(s, id, 0);
    expect(C.startCharades(s, deck, T0)).toBe(s);
    // Only the host.
    const alone = room("charades", [], 1);
    expect(C.startCharades(alone, deck, T0)).toBe(alone);
  });

  it("only moves players in the lobby and renames teams", () => {
    const s = lobby();
    expect(C.setTeam(s, "ali", 5)).toBe(s);
    expect(C.renameTeam(s, 1, "  الصقور  ").teams![1]).toBe("الصقور");
    expect(C.renameTeam(s, 1, "   ")).toBe(s);
    expect(C.setTeam(start(), "ali", 1).players.ali.team).toBe(0);
  });

  it("lets the acting team pick one performer, rotating so nobody repeats early", () => {
    let s = start();
    expect(s.charades!.turn.team).toBe(0);
    expect(s.charades!.turn.step).toBe("pick");
    expect(C.claimPerformer(s, "sara")).toBe(s); // wrong team
    s = C.claimPerformer(s, "ali");
    expect(s.charades!.turn.performerId).toBe("ali");
    expect(s.charades!.turn.step).toBe("ready");
    // Team 1's turn: both can go; sara takes it.
    s = C.nextTurn(C.endTurn(s));
    expect(s.charades!.turn.team).toBe(1);
    expect(C.eligible(s).sort()).toEqual(["omar", "sara"]);
    s = C.claimPerformer(s, "sara");
    // Round 2 for team 0: ali already acted, so only the host is eligible.
    const more = C.startCharades(lobby(2), deck, T0, first0);
    let m = C.claimPerformer(more, "ali");
    m = C.nextTurn(C.endTurn(m)); // team 1
    m = C.nextTurn(C.endTurn(C.claimPerformer(m, "omar"))); // back to team 0
    expect(C.eligible(m)).toEqual(["host"]);
    expect(C.claimPerformer(m, "ali")).toBe(m);
    // The host can override.
    expect(C.claimPerformer(m, "ali", true).charades!.turn.performerId).toBe("ali");
  });

  it("scores the guessing team by speed and gives the performer 50", () => {
    const s = acting();
    const title = s.charades!.turn.title.ar;
    const g = C.submitCharadesGuess(s, { playerId: "sara", guessId: "g1", roundIndex: 0, text: title }, T0);
    expect(g.result).toMatchObject({ verdict: "correct", points: 100 });
    expect(score(g.state, "sara")).toBe(100);
    expect(score(g.state, "ali")).toBe(50);
    expect(g.state.charades!.scores).toEqual([50, 100]);
    expect(g.state.charades!.turn.step).toBe("done"); // the team has it
    const late = C.submitCharadesGuess(s, { playerId: "omar", guessId: "g2", roundIndex: 0, text: title }, T0 + 30_000);
    expect(late.result.points).toBe(75);
  });

  it("keeps the acting team out of the guessing and rejects late or bad guesses", () => {
    const s = acting();
    const t = s.charades!.turn;
    const g = (playerId: string, text: string, now = T0 + 1000, roundIndex = 0) =>
      C.submitCharadesGuess(s, { playerId, guessId: text + now, roundIndex, text }, now);
    expect(g("ali", t.title.ar).result.verdict).toBe("locked"); // performer
    expect(g("host", t.title.ar).result.verdict).toBe("locked"); // same team
    expect(g("sara", t.title.ar, T0 + 60_000 + C.GRACE_MS + 1).result.verdict).toBe("late");
    expect(g("sara", t.title.ar, T0 + 1000, 7).result.verdict).toBe("late");
    expect(g("sara", "حاجة تانية خالص").result.verdict).toBe("wrong");
    expect(g("sara", "A latin guess").result.verdict).toBe("invalid");
    expect(C.submitCharadesGuess(start(), { playerId: "sara", guessId: "x", roundIndex: 0, text: t.title.ar }, T0).result.verdict).toBe("late"); // not acting yet
  });

  it("uses the time the host chose", () => {
    let s = lobby();
    s = { ...s, settings: { ...s.settings, timeSec: 90 } };
    s = C.beginTurn(C.claimPerformer(C.startCharades(s, deck, T0, first0), "ali"), T0);
    expect(s.charades!.turn.deadline).toBe(T0 + 90_000);
    expect(C.publicOf(s, T0).charades!.totalMs).toBe(90_000);
  });

  it("allows a single swap, and only before anyone guessed", () => {
    const s = C.claimPerformer(start(), "ali");
    const first = s.charades!.turn.title.id;
    const swapped = C.skipTitle(s);
    expect(swapped.charades!.turn.title.id).not.toBe(first);
    expect(C.skipTitle(swapped)).toBe(swapped);
  });

  it("never exposes the title before the turn is over", () => {
    const s = acting();
    const title = s.charades!.turn.title.ar;
    expect(JSON.stringify(C.publicOf(s, T0 + 10))).not.toContain(title);
    expect(C.publicOf(C.endTurn(s), T0 + 10).charades!.reveal!.title).toBe(title);
  });

  it("alternates teams and finishes after the last turn", () => {
    let s = start(2);
    for (let i = 0; i < 4; i++) {
      expect(s.charades!.turn.index).toBe(i);
      expect(s.charades!.turn.team).toBe(i % 2);
      s = C.nextTurn(C.endTurn(s));
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

// ---------------------------------------------------------------- period

describe("content period", () => {
  it("only has works, titles, puzzles and quotes from 2000 to 2010", () => {
    expect(titlesJson.length).toBeGreaterThan(100);
    expect(titlesJson.every((t) => inPeriod(t.year))).toBe(true);
    expect(Object.values(casts.works).every((w) => inPeriod((w as { y?: number }).y))).toBe(true);
    expect((filmography as { works: { year?: number }[] }[]).every((a) => a.works.every((w) => inPeriod(w.year)))).toBe(true);
    expect((linkPuzzles as { works: { y?: number }[] }[]).every((p) => p.works.every((w) => inPeriod(w.y)))).toBe(true);
    expect((quotes as { year: number }[]).every((q) => inPeriod(q.year))).toBe(true);
  });

  it("has enough actors with enough works for the five-titles game", () => {
    const actors = filmography as { works: unknown[] }[];
    expect(actors.length).toBeGreaterThan(100);
    expect(actors.every((a) => a.works.length >= 6)).toBe(true);
  });
});

describe("every game starts with the 2000–2010 data", () => {
  it.each(GAMES.map((g) => g.id))("%s", async (game) => {
    const s = await startAny(room(game, ["ali", "sara"], 2));
    expect(s.phase).toBe("round");
    const pub = publicOf(s, T0);
    expect(pub.players).toHaveLength(3);
  });

  it("makes before/after questions at every difficulty within the period", async () => {
    const { datedWorks } = await import("../game/quiz-questions");
    const { ACTORS } = await import("../game/actors");
    const { TITLES } = await import("../game/titles");
    const pool = datedWorks(TITLES, ACTORS, casts as unknown as CastGraph);
    expect(pool.length).toBeGreaterThan(100);
    for (const d of ["any", "easy", "medium", "hard"] as const) {
      expect(makeBeforeAfter(pool, 5, d)).toHaveLength(5);
    }
  });
});
