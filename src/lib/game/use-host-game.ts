"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { encryptFor } from "@/lib/crypto";
import { connect, RealtimeSetupError, type ConnectionStatus, type Mode, type Transport } from "@/lib/realtime";
import { ACTOR_MAP } from "./actors";
import * as K from "./chain";
import * as C from "./charades";
import * as E from "./engine";
import * as F from "./five-engine";
import { familyOf } from "./games";
import * as Q from "./quiz-engine";
import { loadChainData, onePerTitle, publicOf, stagedOf, startAny } from "./registry";
import { addUsedTitles, getAccepted, getUsedTitles, loadHostGame, saveHostGame, setAccepted } from "./room";
import type { GameState, GuessResult, HintKind, ToHost, ToPlayers } from "./types";

type Guess = { playerId: string; guessId: string; roundIndex: number; text: string };

/** Which question/turn/link a guess belongs to: players send it back so late answers are ignored. */
export function roundIndexOf(s: GameState): number {
  switch (familyOf(s.settings.game)) {
    case "five":
      return s.five?.index ?? 0;
    case "charades":
      return s.charades?.turn.index ?? 0;
    case "chain":
      return s.chain?.links.length ?? 0;
    default:
      return s.round?.index ?? 0;
  }
}

/** Judge a typed answer for whichever game is running. Quiz games have no typed answers. */
function judge(s: GameState, g: Guess, now: number, chain: K.ChainData | null): { state: GameState; result: GuessResult } | null {
  const late: GuessResult = { to: g.playerId, guessId: g.guessId, verdict: "late", points: 0, attemptsLeft: 0 };
  switch (familyOf(s.settings.game)) {
    case "five":
      return F.submitEntry(s, ACTOR_MAP, g, now, getAccepted()[s.five?.actorId ?? ""]);
    case "charades":
      return C.submitCharadesGuess(s, g, now);
    case "chain":
      return chain ? K.submitLink(s, chain, g, now) : { state: s, result: late };
    case "quiz":
      return null;
    default:
      return E.submitGuess(s, stagedOf(s.settings.game).map, g, now);
  }
}

/**
 * The host device is the referee: it owns the full game state (including answers),
 * judges guesses and broadcasts a public view to every player.
 */
export function useHostGame(room: string) {
  const [state, setState] = useState<GameState | null | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [mode, setMode] = useState<Mode | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const chainRef = useRef<K.ChainData | null>(null);

  const send = useCallback((msg: ToPlayers) => {
    void transportRef.current?.publish("toPlayers", msg).catch(() => {});
  }, []);

  const broadcast = useCallback(() => {
    const s = stateRef.current;
    if (s) send({ type: "state", state: publicOf(s, Date.now()) });
  }, [send]);

  const commit = useCallback((next: GameState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    saveHostGame(next);
    setState(next);
  }, []);

  /** Charades: hand the performer the title, encrypted so only their phone can read it. */
  const sendSecret = useCallback(async () => {
    const s = stateRef.current;
    const t = s?.charades?.turn;
    if (!s || !t || t.step === "done" || !t.performerId || t.performerId === s.hostId) return;
    const key = s.players[t.performerId]?.key;
    if (!key) return;
    try {
      send({ type: "secret", secret: { to: t.performerId, turn: t.index, ...(await encryptFor(key, t.title.ar)) } });
    } catch {
      /* the performer's phone can't decrypt: the host can skip the turn */
    }
  }, [send]);

  // Load saved game (survives refresh / closing the tab).
  useEffect(() => {
    const saved = loadHostGame(room);
    stateRef.current = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setState(saved);
  }, [room]);

  const hostId = state?.hostId;
  const game = state?.settings.game;

  // The chain game needs the cast data to judge links.
  useEffect(() => {
    if (game !== "chain") return;
    void loadChainData().then((d) => (chainRef.current = d));
  }, [game]);

  // Realtime connection + incoming player messages.
  useEffect(() => {
    if (!hostId) return;
    let cancelled = false;
    let cleanup: (() => void)[] = [];
    connect(room, hostId).then((t) => {
      if (cancelled) return t.close();
      transportRef.current = t;
      setMode(t.mode);
      cleanup.push(t.onStatus(setStatus));
      cleanup.push(
        t.subscribe((name, data, sender) => {
          if (name !== "toHost") return;
          const msg = data as ToHost;
          const s = stateRef.current;
          // The host's own guesses are judged locally; nobody else may act as the host.
          if (!s || sender === s.hostId) return;
          const now = Date.now();
          if (msg.type === "join") {
            // A player may only join as themselves.
            if (msg.player.id !== sender) return;
            let joined = E.joinPlayer(s, msg.player, now);
            // Joining a team game that already started: the smaller team gets you.
            if (familyOf(s.settings.game) === "charades" && joined.phase !== "lobby") joined = C.balance(joined);
            commit(joined);
            broadcast();
            if (s.charades?.turn.performerId === sender) void sendSecret();
          } else if (msg.type === "hello") {
            broadcast();
          } else if (msg.type === "guess" && msg.playerId === sender) {
            const out = judge(s, msg, now, chainRef.current);
            if (!out) return;
            commit(out.state);
            send({ type: "result", result: out.result });
          } else if (msg.type === "pick" && msg.playerId === sender && familyOf(s.settings.game) === "quiz") {
            commit(Q.submitPick(s, msg, now));
          } else if (msg.type === "act" && msg.playerId === sender && s.charades && msg.roundIndex === s.charades.turn.index) {
            if (msg.action === "claim") commit(C.claimPerformer(s, sender));
            else if (s.charades.turn.performerId === sender) commit(msg.action === "start" ? C.beginTurn(s, now) : C.skipTitle(s));
          } else if (msg.type === "team" && msg.playerId === sender && familyOf(s.settings.game) === "charades") {
            commit(C.setTeam(s, sender, msg.team));
          }
        }),
      );
      broadcast();
    }, (e: unknown) => {
      if (cancelled) return;
      setStatus("offline");
      setSetupError(e instanceof RealtimeSetupError ? e.message : String(e));
    });
    return () => {
      cancelled = true;
      cleanup.forEach((c) => c());
      cleanup = [];
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [room, hostId, commit, broadcast, send, sendSecret]);

  // Broadcast every state change.
  const version = state?.version;
  useEffect(() => {
    if (version) broadcast();
  }, [version, broadcast]);

  // Charades: a new turn or a swapped title → send the performer their secret.
  const turn = state?.charades?.turn;
  const secretKey = turn ? `${turn.index}:${turn.title.id}:${turn.performerId ?? ""}` : null;
  useEffect(() => {
    if (secretKey) void sendSecret();
  }, [secretKey, sendSecret]);

  // Auto-reveal timer.
  const r = state?.round;
  const autoSec = state?.settings.autoRevealSec ?? 0;
  useEffect(() => {
    if (!r || r.revealed || !autoSec || state?.phase !== "round") return;
    const ms = Math.max(0, r.stageAt + autoSec * 1000 - Date.now());
    const t = setTimeout(() => {
      const s = stateRef.current!;
      commit(s.round!.stage < 3 ? E.nextStage(s, Date.now()) : E.revealAnswer(s));
    }, ms);
    return () => clearTimeout(t);
  }, [r, autoSec, state?.phase, commit]);

  // The host is the clock for every timed game: it ends the round shortly after the deadline (+ grace for slow networks).
  const five = state?.five;
  const clock = (deadline: number, grace: number, fn: (s: GameState) => GameState) => {
    if (!deadline) return;
    const t = setTimeout(() => stateRef.current && commit(fn(stateRef.current)), Math.max(0, deadline + grace + 200 - Date.now()));
    return () => clearTimeout(t);
  };
  useEffect(() => clock(five?.step === "playing" ? five.deadline : 0, F.GRACE_MS, F.endFiveRound), [five?.step, five?.deadline]); // eslint-disable-line react-hooks/exhaustive-deps
  const quiz = state?.quiz;
  useEffect(() => clock(quiz?.step === "playing" ? quiz.deadline : 0, Q.QUIZ_GRACE_MS, Q.revealQuiz), [quiz?.step, quiz?.deadline]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => clock(turn?.step === "acting" ? turn.deadline : 0, C.GRACE_MS, C.endTurn), [turn?.step, turn?.deadline]); // eslint-disable-line react-hooks/exhaustive-deps
  const chain = state?.chain;
  useEffect(() => clock(chain && !chain.over ? chain.deadline : 0, K.GRACE_MS, (s) => K.timeoutTurn(s, Date.now())), [chain?.over, chain?.deadline]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    (fn: (s: GameState) => GameState) => {
      if (stateRef.current) commit(fn(stateRef.current));
    },
    [commit],
  );

  const start = useCallback(async (): Promise<boolean> => {
    const s = stateRef.current;
    if (!s) return false;
    try {
      const next = await startAny(s);
      commit(next);
      return next !== s;
    } catch {
      return false;
    }
  }, [commit]);

  return {
    state,
    status,
    mode,
    setupError,
    /** Resolves to false when the game couldn't start (no data for it). */
    start,
    playAgain: start,
    nextStage: () => act((s) => E.nextStage(s, Date.now())),
    hint: (k: HintKind) => act((s) => E.showHint(s, k)),
    reveal: () => act(E.revealAnswer),
    nextRound: () => act((s) => E.nextRound(s, stagedOf(s.settings.game).map, Date.now())),
    skip: () =>
      act((s) => {
        const pool = stagedOf(s.settings.game);
        const settings = { ...s.settings, rounds: 1, pool: "all" as const, difficulty: s.settings.game === "tetrat" || !s.settings.game ? s.settings.difficulty : ("any" as const) };
        const inGame = new Set(s.titleIds.map((id) => pool.map[id]?.titleAr));
        const replacement = E.pickTitles(
          onePerTitle(pool.all.filter((t) => !inGame.has(t.titleAr))),
          settings,
          getUsedTitles(pool.key),
        )[0];
        if (replacement) addUsedTitles([replacement], pool.key);
        return E.skipTitle(s, replacement, pool.map, Date.now());
      }),
    five: {
      begin: () => act((s) => F.beginFiveRound(s, Date.now())),
      setTime: (sec: number) => act((s) => F.setFiveTime(s, sec)),
      end: () => act(F.endFiveRound),
      results: () => act(F.showFiveResults),
      next: () => act(F.nextFiveRound),
      /** Host marks a rejected title correct (for everyone who typed it) and we remember it for this actor. */
      accept: (entryId: string) => {
        const s = stateRef.current;
        if (!s?.five) return;
        const { state: next, accepted, results } = F.acceptEntry(s, entryId);
        commit(next);
        if (accepted[0]) setAccepted(s.five.actorId, accepted[0].label, true);
        for (const result of results) if (result.to !== s.hostId) send({ type: "result", result });
      },
      undo: (entryId: string) => {
        const s = stateRef.current;
        const e = s?.five?.entries.find((x) => x.id === entryId);
        if (!s?.five || !e) return;
        const { state: next, result } = F.undoEntry(s, entryId);
        commit(next);
        // Forget the title only when nobody else's copy of it is still accepted this round.
        if (e.verdict === "accepted" && !next.five?.entries.some((x) => x.verdict === "accepted" && x.label === e.label)) {
          setAccepted(s.five.actorId, e.label, false);
        }
        if (result && result.to !== s.hostId) send({ type: "result", result });
      },
    },
    quiz: {
      /** The host plays too. */
      pick: (choice: number) =>
        act((s) => Q.submitPick(s, { playerId: s.hostId, roundIndex: s.quiz?.index ?? -1, choice }, Date.now())),
      reveal: () => act(Q.revealQuiz),
      next: () => act((s) => Q.nextQuiz(s, Date.now())),
    },
    charades: {
      /** Lobby: put a player (the host included) on a team, rename a team, or split everyone randomly. */
      setTeam: (playerId: string, team: number) => act((s) => C.setTeam(s, playerId, team)),
      rename: (team: number, name: string) => act((s) => C.renameTeam(s, team, name)),
      shuffleTeams: () => act((s) => C.shuffleTeams(s)),
      /** In the game: take the turn for yourself (the host plays too), or give it to someone on the acting team. */
      claim: () => act((s) => C.claimPerformer(s, s.hostId)),
      assign: (playerId: string) => act((s) => C.claimPerformer(s, playerId, true)),
      begin: () => act((s) => C.beginTurn(s, Date.now())),
      skip: () => act(C.skipTitle),
      end: () => act(C.endTurn),
      next: () => act(C.nextTurn),
    },
    chain: {
      /** Host marks a refused answer as right (our data has gaps). */
      accept: (entryId: string) => {
        const s = stateRef.current;
        if (!s) return;
        const { state: next, result } = K.acceptLink(s, entryId, Date.now());
        commit(next);
        if (result && result.to !== s.hostId) send({ type: "result", result });
      },
      end: () => act(K.endChain),
    },
    kick: (playerId: string) => {
      act((s) => E.removePlayer(s, playerId));
      send({ type: "kicked", playerId });
    },
    accept: (feedId: string): GuessResult | null => {
      const s = stateRef.current;
      if (!s) return null;
      const { state: next, result } = E.acceptGuess(s, feedId);
      commit(next);
      if (result && result.to !== s.hostId) send({ type: "result", result });
      return result;
    },
    /** The host plays too: their typed answers are judged locally, whatever the game. */
    guess: (guessId: string, text: string): GuessResult | null => {
      const s = stateRef.current;
      if (!s) return null;
      const out = judge(s, { playerId: s.hostId, guessId, roundIndex: roundIndexOf(s), text }, Date.now(), chainRef.current);
      if (!out) return null;
      commit(out.state);
      return out.result;
    },
  };
}

export type HostGame = ReturnType<typeof useHostGame>;
