"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { GENRE_AR, GENRE_EMOJI } from "@/lib/content-types";
import { n } from "@/lib/format";
import type { PublicRound } from "@/lib/game/types";
import { ActorCard } from "./actor-card";

const STAGE_LABEL = { 1: "الأدوار المساعدة", 2: "دور أكبر", 3: "الأبطال" } as const;

export function RoundHeader({ round }: { round: PublicRound }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <motion.div
        key={round.index}
        initial={{ x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        className="flex items-baseline gap-2"
      >
        <span className="text-2xl">🎬</span>
        <span className="display text-2xl">
          الجولة {n(round.index + 1)} <span className="text-muted">من {n(round.total)}</span>
        </span>
      </motion.div>
      <div className="flex gap-1.5" aria-label={`المرحلة ${round.stage} من 3`}>
        {[1, 2, 3].map((s) => (
          <span
            key={s}
            className={`h-2.5 w-7 rounded-full transition-colors duration-500 ${
              s <= round.stage ? "bg-gradient-to-l from-magenta to-orange" : "bg-surface-2"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export function ClueBoard({ round }: { round: PublicRound }) {
  return (
    <div className="mx-auto w-full max-w-xl">
      <p className="mb-2 text-center text-sm font-bold text-muted">
        {round.revealed ? "طاقم العمل" : `المرحلة ${n(round.stage)}: ${STAGE_LABEL[round.stage]}`}
      </p>
      <div className="grid grid-cols-3 gap-2.5 sm:gap-3.5">
        {round.clues.map((c, i) => (
          <ActorCard key={`${round.index}-${i}`} clue={c} index={i} />
        ))}
      </div>
    </div>
  );
}

export function HintChips({ round }: { round: PublicRound }) {
  const chips: { key: string; label: string }[] = [];
  if (round.hints.type) chips.push({ key: "type", label: round.hints.type === "movie" ? "🎞️ فيلم" : "📺 مسلسل" });
  if (round.hints.year) chips.push({ key: "year", label: `📅 ${n(round.hints.year).replace(/٬/g, "")}` });
  round.hints.genres?.forEach((g) => chips.push({ key: g, label: `${GENRE_EMOJI[g]} ${GENRE_AR[g]}` }));
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <AnimatePresence>
        {chips.map((c, i) => (
          <motion.span
            key={c.key}
            initial={{ scale: 1.8, opacity: 0, rotate: -12 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 18, delay: i * 0.05 }}
            className="rounded-full border-2 border-gold/60 bg-gold/15 px-3.5 py-1.5 text-base font-extrabold text-gold"
          >
            {c.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Countdown bar to the next automatic reveal. */
export function AutoTimer({ msLeft, receivedAt, totalSec }: { msLeft: number | null; receivedAt: number; totalSec: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (msLeft === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [msLeft]);
  if (msLeft === null || !totalSec) return null;
  const left = Math.max(0, msLeft - (now - receivedAt));
  const pct = Math.min(100, (left / (totalSec * 1000)) * 100);
  return (
    <div className="flex items-center gap-2" aria-label="الوقت المتبقي للكشف التالي">
      <span className="w-8 text-center text-sm font-bold tabular-nums text-muted">{n(Math.ceil(left / 1000))}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ease-linear ${pct < 25 ? "bg-danger" : "bg-teal"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function AnswerReveal({ round }: { round: PublicRound }) {
  if (!round.answer) return null;
  const a = round.answer;
  return (
    <motion.div
      initial={{ clipPath: "inset(0 50% 0 50%)", opacity: 0 }}
      animate={{ clipPath: "inset(0 0% 0 0%)", opacity: 1 }}
      transition={{ duration: 0.7, ease: [0.2, 0.8, 0.2, 1] }}
      className="relative overflow-hidden rounded-3xl border-2 border-gold/70 bg-gradient-to-br from-[#3a1a5e] via-[#5a1846] to-[#7a2f12] p-5 text-center shadow-[0_0_60px_-10px_var(--gold)]"
    >
      <p className="text-sm font-bold text-gold">{a.type === "movie" ? "الفيلم" : "المسلسل"}</p>
      <motion.h2
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.45, type: "spring", stiffness: 200, damping: 14 }}
        className="display neon-text my-1 text-5xl sm:text-6xl"
      >
        {a.titleAr}
      </motion.h2>
      <p className="font-bold text-ink/80">
        {String(a.year)} · {a.genres.map((g) => GENRE_AR[g]).join(" · ")}
      </p>
    </motion.div>
  );
}
