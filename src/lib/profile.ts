"use client";

import { useCallback, useEffect, useState } from "react";

export const AVATARS = ["🎬", "🍿", "⭐", "🎭", "🦁", "🐱", "🦊", "🐸", "👑", "🔥", "🌙", "🎤", "😎", "🤠", "👻", "🦄"];

export interface Stats {
  games: number;
  wins: number;
  best: number;
  correct: number;
  /** Room codes already counted, so a refresh doesn't double-count a game. */
  counted: string[];
}

export interface Profile {
  id: string;
  name: string;
  avatar: string;
  stats: Stats;
}

/** `?slot=2` gives a tab its own profile — lets you test host + players in one browser. */
const profileKey = () => {
  const slot = typeof location !== "undefined" ? new URLSearchParams(location.search).get("slot") : null;
  return slot && /^\w{1,8}$/.test(slot) ? `afeesh:profile:${slot}` : "afeesh:profile";
};
const emptyStats: Stats = { games: 0, wins: 0, best: 0, correct: 0, counted: [] };

function newId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function readProfile(): Profile {
  try {
    const raw = localStorage.getItem(profileKey());
    if (raw) {
      const p = JSON.parse(raw) as Profile;
      if (p.id) return { ...p, stats: { ...emptyStats, ...p.stats } };
    }
  } catch {
    /* private mode or corrupt data → fresh profile */
  }
  const p: Profile = { id: newId(), name: "", avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)], stats: emptyStats };
  writeProfile(p);
  return p;
}

export function writeProfile(p: Profile) {
  try {
    localStorage.setItem(profileKey(), JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

/** Profile from localStorage. `null` until loaded on the client (avoids hydration mismatch). */
export function useProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount
    setProfile(readProfile());
  }, []);
  const update = useCallback((fn: (p: Profile) => Profile) => {
    setProfile((prev) => {
      const next = fn(prev ?? readProfile());
      writeProfile(next);
      return next;
    });
  }, []);
  return [profile, update] as const;
}

export function recordCorrect(update: ReturnType<typeof useProfile>[1]) {
  update((p) => ({ ...p, stats: { ...p.stats, correct: p.stats.correct + 1 } }));
}

export function recordGame(update: ReturnType<typeof useProfile>[1], room: string, score: number, won: boolean) {
  update((p) => {
    if (p.stats.counted.includes(room)) return p;
    return {
      ...p,
      stats: {
        ...p.stats,
        games: p.stats.games + 1,
        wins: p.stats.wins + (won ? 1 : 0),
        best: Math.max(p.stats.best, score),
        counted: [...p.stats.counted, room].slice(-30),
      },
    };
  });
}
