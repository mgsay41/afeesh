"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { connect, RealtimeSetupError, type ConnectionStatus, type Mode, type Transport } from "@/lib/realtime";
import type { GuessResult, PublicState, ToHost, ToPlayers } from "./types";

interface Me {
  id: string;
  name: string;
  avatar: string;
}

/** Player side: sends join/guesses to the host and mirrors the host's public state. */
export function usePlayerGame(room: string, me: Me | null) {
  const [state, setState] = useState<PublicState | null>(null);
  const [receivedAt, setReceivedAt] = useState(0);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [mode, setMode] = useState<Mode | null>(null);
  const [kicked, setKicked] = useState(false);
  const [lastResult, setLastResult] = useState<GuessResult | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const transportRef = useRef<Transport | null>(null);
  const versionRef = useRef(0);
  const lastJoinRef = useRef(0);
  const meRef = useRef(me);
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  const toHost = useCallback((msg: ToHost) => {
    void transportRef.current?.publish("toHost", msg).catch(() => {});
  }, []);

  const id = me?.id;
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let cleanup: (() => void)[] = [];
    let helloTimer: ReturnType<typeof setInterval> | undefined;
    let hostId: string | null = null;
    connect(room, id).then((t) => {
      if (cancelled) return t.close();
      transportRef.current = t;
      setMode(t.mode);
      cleanup.push(
        t.onStatus((s) => {
          setStatus(s);
          // Re-announce after reconnecting so the host re-sends the latest state.
          if (s === "online" && meRef.current) toHost({ type: "join", player: meRef.current });
        }),
      );
      cleanup.push(
        t.subscribe((name, data, sender) => {
          if (name !== "toPlayers") return;
          const msg = data as ToPlayers;
          // Only the host may update players. The first state names the host; stick to it.
          if (msg.type === "state" && !hostId && sender === msg.state.hostId) hostId = sender;
          if (!hostId || sender !== hostId) return;
          if (msg.type === "state") {
            // Accept newer versions; a much lower version means the host restarted the game.
            if (msg.state.version >= versionRef.current || msg.state.version < versionRef.current - 1000) {
              versionRef.current = msg.state.version;
              setState(msg.state);
              setReceivedAt(Date.now());
              // Not on the host's list (host reloaded an older save, or we joined mid-flight) → join again.
              const now = Date.now();
              if (!msg.state.players.some((p) => p.id === id) && meRef.current && now - lastJoinRef.current > 3000) {
                lastJoinRef.current = now;
                toHost({ type: "join", player: meRef.current });
              }
            }
          } else if (msg.type === "result" && msg.result.to === id) {
            setLastResult(msg.result);
          } else if (msg.type === "kicked" && msg.playerId === id) {
            setKicked(true);
            t.close();
          }
        }),
      );
      if (meRef.current) toHost({ type: "join", player: meRef.current });
      // Keep asking until the host answers (host may have opened the page later).
      helloTimer = setInterval(() => {
        if (versionRef.current === 0) toHost({ type: "join", player: meRef.current! });
      }, 2500);
    }, (e: unknown) => {
      if (cancelled) return;
      setStatus("offline");
      setSetupError(e instanceof RealtimeSetupError ? e.message : String(e));
    });
    return () => {
      cancelled = true;
      clearInterval(helloTimer);
      cleanup.forEach((c) => c());
      cleanup = [];
      transportRef.current?.close();
      transportRef.current = null;
    };
  }, [room, id, toHost]);

  const guess = useCallback(
    (guessId: string, roundIndex: number, text: string) => {
      if (!id) return;
      toHost({ type: "guess", playerId: id, guessId, roundIndex, text });
    },
    [id, toHost],
  );

  return { state, receivedAt, status, mode, setupError, kicked, lastResult, guess, hostSeen: state !== null };
}
