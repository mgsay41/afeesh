"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connect, type ConnectionStatus, type Mode, type Transport } from "@/lib/realtime";
import * as E from "./engine";
import { addUsedTitles, getUsedTitles, loadHostGame, saveHostGame } from "./room";
import { TITLE_MAP, TITLES } from "./titles";
import type { GameState, GuessResult, HintKind, ToHost, ToPlayers } from "./types";

/**
 * The host device is the referee: it owns the full game state (including answers),
 * judges guesses and broadcasts a public view to every player.
 */
export function useHostGame(room: string) {
  const [state, setState] = useState<GameState | null | undefined>(undefined);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [mode, setMode] = useState<Mode | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const transportRef = useRef<Transport | null>(null);

  const send = useCallback((msg: ToPlayers) => {
    void transportRef.current?.publish("toPlayers", msg).catch(() => {});
  }, []);

  const broadcast = useCallback(() => {
    const s = stateRef.current;
    if (s) send({ type: "state", state: E.toPublic(s, TITLE_MAP, Date.now()) });
  }, [send]);

  const commit = useCallback((next: GameState) => {
    if (next === stateRef.current) return;
    stateRef.current = next;
    saveHostGame(next);
    setState(next);
  }, []);

  // Load saved game (survives refresh / closing the tab).
  useEffect(() => {
    const saved = loadHostGame(room);
    stateRef.current = saved;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setState(saved);
  }, [room]);

  const hostId = state?.hostId;

  // Realtime connection + incoming player messages.
  useEffect(() => {
    if (!hostId) return;
    let cancelled = false;
    let cleanup: (() => void)[] = [];
    void connect(room, hostId).then((t) => {
      if (cancelled) return t.close();
      transportRef.current = t;
      setMode(t.mode);
      cleanup.push(t.onStatus(setStatus));
      cleanup.push(
        t.subscribe((name, data) => {
          if (name !== "toHost") return;
          const msg = data as ToHost;
          const s = stateRef.current;
          if (!s) return;
          const now = Date.now();
          if (msg.type === "join") {
            commit(E.joinPlayer(s, msg.player, now));
            broadcast();
          } else if (msg.type === "hello") {
            broadcast();
          } else if (msg.type === "guess" && msg.playerId !== s.hostId) {
            const { state: next, result } = E.submitGuess(s, TITLE_MAP, msg, now);
            commit(next);
            send({ type: "result", result });
          }
        }),
      );
      broadcast();
    });
    return () => {
      cancelled = true;
      cleanup.forEach((c) => c());
      cleanup = [];
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [room, hostId, commit, broadcast, send]);

  // Broadcast every state change.
  const version = state?.version;
  useEffect(() => {
    if (version) broadcast();
  }, [version, broadcast]);

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

  const act = useCallback(
    (fn: (s: GameState) => GameState) => {
      if (stateRef.current) commit(fn(stateRef.current));
    },
    [commit],
  );

  return {
    state,
    status,
    mode,
    start: () =>
      act((s) => {
        const ids = E.pickTitles(TITLES, s.settings, getUsedTitles());
        addUsedTitles(ids);
        return E.startGame(s, ids, TITLE_MAP, Date.now());
      }),
    nextStage: () => act((s) => E.nextStage(s, Date.now())),
    hint: (k: HintKind) => act((s) => E.showHint(s, k)),
    reveal: () => act(E.revealAnswer),
    nextRound: () => act((s) => E.nextRound(s, TITLE_MAP, Date.now())),
    skip: () =>
      act((s) => {
        const replacement = E.pickTitles(
          TITLES.filter((t) => !s.titleIds.includes(t.id)),
          { ...s.settings, rounds: 1 },
          getUsedTitles(),
        )[0];
        if (replacement) addUsedTitles([replacement]);
        return E.skipTitle(s, replacement, TITLE_MAP, Date.now());
      }),
    playAgain: () =>
      act((s) => {
        const ids = E.pickTitles(TITLES, s.settings, getUsedTitles());
        addUsedTitles(ids);
        return E.startGame(s, ids, TITLE_MAP, Date.now());
      }),
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
    /** The host plays too: their guesses are judged locally. */
    guess: (guessId: string, text: string): GuessResult | null => {
      const s = stateRef.current;
      if (!s?.round) return null;
      const { state: next, result } = E.submitGuess(
        s,
        TITLE_MAP,
        { playerId: s.hostId, guessId, roundIndex: s.round.index, text },
        Date.now(),
      );
      commit(next);
      return result;
    },
  };
}

export type HostGame = ReturnType<typeof useHostGame>;
