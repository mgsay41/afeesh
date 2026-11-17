import type { GameState } from "./types";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

export function newRoomCode(): string {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

export const isRoomCode = (s: string) => /^[A-Z2-9]{5}$/.test(s);

const hostKey = (room: string) => `afeesh:host:${room}`;
const USED_KEY = "afeesh:used-titles";
export const USED_ACTORS_KEY = "afeesh:used-actors";
const ACCEPTED_KEY = "afeesh:five-accepted";

export function saveHostGame(state: GameState) {
  try {
    localStorage.setItem(hostKey(state.room), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadHostGame(room: string): GameState | null {
  try {
    const raw = localStorage.getItem(hostKey(room));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function getUsedTitles(key = USED_KEY): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    return [];
  }
}

export function addUsedTitles(ids: string[], key = USED_KEY) {
  try {
    const next = [...getUsedTitles(key).filter((id) => !ids.includes(id)), ...ids].slice(-80);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

/** Titles the host marked correct in game 2, per actor id: a gap in our data only has to be fixed once. */
export function getAccepted(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(ACCEPTED_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function setAccepted(actorId: string, text: string, on: boolean) {
  try {
    const all = getAccepted();
    const rest = (all[actorId] ?? []).filter((t) => t !== text);
    all[actorId] = on ? [...rest, text] : rest;
    localStorage.setItem(ACCEPTED_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
