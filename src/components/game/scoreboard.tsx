"use client";

import { AnimatePresence, motion } from "motion/react";
import { n } from "@/lib/format";
import type { PublicPlayer } from "@/lib/game/types";

interface Props {
  players: PublicPlayer[];
  meId?: string;
  hostId?: string;
  firstId?: string | null;
  correctIds?: string[];
  compact?: boolean;
  onKick?: (id: string) => void;
}

export function Scoreboard({ players, meId, hostId, firstId, correctIds = [], compact, onKick }: Props) {
  return (
    <ol className="space-y-1.5">
      <AnimatePresence initial={false}>
        {players.map((p, i) => {
          const got = correctIds.includes(p.id);
          return (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, x: -30 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className={`flex items-center gap-2.5 rounded-2xl px-3 ${compact ? "py-1.5" : "py-2.5"} ${
                p.id === meId ? "bg-magenta/20 ring-2 ring-magenta/60" : "bg-surface-2/70"
              }`}
            >
              <span className="w-6 text-center font-black text-muted">{i === 0 && p.score > 0 ? "👑" : n(i + 1)}</span>
              <span className="text-2xl leading-none">{p.avatar}</span>
              <span className="min-w-0 flex-1 truncate font-bold">
                {p.name}
                {p.id === hostId && <span className="ms-1.5 text-xs text-muted">(المضيف)</span>}
              </span>
              {got && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="rounded-full bg-success/20 px-2 py-0.5 text-xs font-black text-success"
                >
                  {p.id === firstId ? "⚡ " : "✓ "}+{p.roundPoints}
                </motion.span>
              )}
              <motion.span key={p.score} initial={{ scale: 1.5, color: "#ffd166" }} animate={{ scale: 1, color: "#fff7ec" }} className="w-12 text-end font-black tabular-nums">
                {n(p.score)}
              </motion.span>
              {onKick && p.id !== hostId && (
                <button
                  onClick={() => onKick(p.id)}
                  className="rounded-lg px-1.5 text-muted hover:text-danger"
                  aria-label={`إخراج ${p.name}`}
                  title="إخراج"
                >
                  ✕
                </button>
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}

export function Podium({ players, meId }: { players: PublicPlayer[]; meId?: string }) {
  const top = players.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const height = (p: PublicPlayer) => (p === top[0] ? "h-36" : p === top[1] ? "h-24" : "h-16");
  const medal = (p: PublicPlayer) => (p === top[0] ? "🥇" : p === top[1] ? "🥈" : "🥉");
  return (
    <div className="space-y-5">
      <div className="flex items-end justify-center gap-3">
        {order.map((p, i) => (
          <div key={p.id} className="flex w-24 flex-col items-center gap-1 sm:w-28">
            <motion.span
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.6 + i * 0.2 }}
              className="text-4xl"
            >
              {p.avatar}
            </motion.span>
            <span className={`max-w-full truncate text-sm font-extrabold ${p.id === meId ? "text-magenta" : ""}`}>{p.name}</span>
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: 0.2 + i * 0.15, type: "spring", stiffness: 120, damping: 14 }}
              style={{ originY: 1 }}
              className={`${height(p)} flex w-full flex-col items-center justify-start gap-1 rounded-t-2xl pt-2 ${
                p === top[0] ? "bg-gradient-to-b from-gold to-orange text-black" : "bg-surface-2"
              }`}
            >
              <span className="text-2xl">{medal(p)}</span>
              <span className="font-black tabular-nums">{n(p.score)}</span>
            </motion.div>
          </div>
        ))}
      </div>
      {players.length > 3 && <Scoreboard players={players.slice(3)} meId={meId} compact />}
    </div>
  );
}
