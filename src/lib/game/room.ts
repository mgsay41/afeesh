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

export function getUsedTitles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(USED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addUsedTitles(ids: string[]) {
  try {
    const next = [...getUsedTitles().filter((id) => !ids.includes(id)), ...ids].slice(-80);
    localStorage.setItem(USED_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
