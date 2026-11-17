"use client";

import Image from "next/image";
import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { initials, n } from "@/lib/format";
import { FIVE_TARGET, MAX_ENTRIES } from "@/lib/game/five-engine";
import type { PublicFive, PublicPlayer } from "@/lib/game/types";

/** Milliseconds left, counting down locally from the value the host sent at `receivedAt`. */
export function useCountdown(msLeft: number | null, receivedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (msLeft === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- align with the clock when a new state arrives
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [msLeft, receivedAt]);
  return msLeft === null ? null : Math.max(0, msLeft - (now - receivedAt));
}

export function FiveTimer({ left, totalMs }: { left: number | null; totalMs: number }) {
  if (left === null) return null;
  const secs = Math.ceil(left / 1000);
  const hot = secs <= 5;
  return (
    <div className="flex items-center gap-3" role="timer" aria-label={`${secs} ثانية`}>
      <motion.span
        key={secs}
        initial={{ scale: hot ? 1.5 : 1.15 }}
        animate={{ scale: 1 }}
        className={`display w-20 text-center text-6xl tabular-nums ${hot ? "text-danger" : "text-gold"}`}
      >
        {n(secs)}
      </motion.span>
      <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
        <div
          className={`h-full rounded-full ${hot ? "bg-danger" : "bg-gradient-to-l from-magenta to-orange"}`}
          style={{ width: `${(left / totalMs) * 100}%`, transition: "width 0.1s linear" }}
        />
      </div>
    </div>
  );
}

export function FiveHeader({ five }: { five: PublicFive }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-2xl">🎬</span>
      <span className="display text-2xl">
        الجولة {n(five.index + 1)} <span className="text-muted">من {n(five.total)}</span>
      </span>
    </div>
  );
}

/** Big actor photo + name. Shows a "get ready" card until the round starts. */
export function FiveActor({ five, small }: { five: PublicFive; small?: boolean }) {
  const [broken, setBroken] = useState(false);
  const a = five.actor;
  if (!a) {
    return (
      <div className="panel mx-auto flex aspect-square w-full max-w-xs flex-col items-center justify-center gap-2 text-center">
        <motion.span animate={{ scale: [1, 1.12, 1] }} transition={{ repeat: Infinity, duration: 1.4 }} className="text-7xl">
          🎞️
        </motion.span>
        <p className="display text-3xl">جاهزين؟</p>
        <p className="px-4 text-muted">هيظهر ممثل، وعندك ٣٠ ثانية تكتب ٥ أفلام أو مسلسلات ليه</p>
      </div>
    );
  }
  return (
    <motion.div
      key={a.nameAr}
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 16 }}
      className={`lead-glow relative mx-auto aspect-[4/5] w-full overflow-hidden rounded-3xl bg-surface-2 ${small ? "max-w-[9.5rem]" : "max-w-xs"}`}
    >
      {broken ? (
        <div className="display flex h-full items-start justify-center bg-gradient-to-br from-magenta to-surface-2 pt-[22%] text-7xl">
          {initials(a.nameAr)}
        </div>
      ) : (
        <Image src={a.photo} alt={a.nameAr} fill priority sizes="320px" className="object-cover" onError={() => setBroken(true)} />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-3 pt-10 text-center">
        <p className={`display ${small ? "text-xl" : "text-3xl"}`}>{a.nameAr}</p>
      </div>
    </motion.div>
  );
}

/** Per-player progress: five pips each. Counts only; titles stay hidden until the results. */
export function FiveProgress({ players, counts, meId }: { players: PublicPlayer[]; counts: Record<string, number>; meId?: string }) {
  return (
    <ul className="space-y-1.5">
      {players.map((p) => (
        <li key={p.id} className={`flex items-center gap-2.5 rounded-2xl px-3 py-1.5 ${p.id === meId ? "bg-magenta/20 ring-2 ring-magenta/60" : "bg-surface-2/70"}`}>
          <span className="text-2xl leading-none">{p.avatar}</span>
          <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
          <span className="flex gap-1" aria-label={`${counts[p.id] ?? 0} من ${FIVE_TARGET}`}>
            {Array.from({ length: FIVE_TARGET }, (_, i) => (
              <motion.span
                key={i}
                animate={{ scale: i < (counts[p.id] ?? 0) ? [1.5, 1] : 1 }}
                className={`size-3.5 rounded-full ${i < (counts[p.id] ?? 0) ? "bg-success" : "bg-line"}`}
              />
            ))}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface OwnEntry {
  id: string;
  text: string;
  status: "pending" | "correct" | "close" | "wrong";
}

const STATUS_ICON = { pending: "⏳", correct: "✅", close: "🔥", wrong: "❌" } as const;

/** The player's own 5 slots and the title input. Used by the host (judged locally) and by phones. */
export function FiveInput({
  entries,
  count,
  active,
  notice,
  onEnter,
}: {
  entries: OwnEntry[];
  /** Authoritative number of correct titles (from the public state). */
  count: number;
  active: boolean;
  notice?: string | null;
  onEnter: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [rowRef, animate] = useAnimate<HTMLFormElement>();
  const correct = entries.filter((e) => e.status === "correct");
  const attempts = entries.filter((e) => e.status !== "correct");
  const done = count >= FIVE_TARGET;

  // Shake when the newest entry was rejected.
  const last = entries[0];
  const shaken = useRef<string | null>(null);
  useEffect(() => {
    if (last && (last.status === "wrong" || last.status === "close") && shaken.current !== last.id) {
      shaken.current = last.id;
      if (rowRef.current) void animate(rowRef.current, { x: [0, -9, 9, -7, 7, 0] }, { duration: 0.4 });
      navigator.vibrate?.(40);
    }
  }, [last, animate, rowRef]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !active || done) return;
    setText("");
    onEnter(t);
  }

  return (
    <div className="space-y-3">
      <ol className="grid gap-1.5">
        {Array.from({ length: FIVE_TARGET }, (_, i) => (
          <li
            key={i}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 py-2 font-bold ${i < count ? "bg-success/20 text-success" : "bg-surface-2/60 text-muted"}`}
          >
            <span className="w-5 text-center">{i < count ? "✅" : n(i + 1)}</span>
            <span className="truncate">{correct[i]?.text ?? (i < count ? "…" : "")}</span>
          </li>
        ))}
      </ol>

      <form ref={rowRef} onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!active || done}
          placeholder={done ? "برافو! خلصتهم 🎉" : active ? "اسم فيلم أو مسلسل…" : "استنى الجولة تبدأ"}
          className="field flex-1"
          maxLength={60}
          enterKeyHint="send"
          autoComplete="off"
          aria-label="اسم فيلم أو مسلسل"
        />
        <button type="submit" className="btn btn-primary min-w-20" disabled={!active || done || !text.trim()}>
          أدخل
        </button>
      </form>

      <div className="flex min-h-8 flex-wrap items-center gap-1.5">
        <AnimatePresence initial={false}>
          {attempts.slice(0, 4).map((e) => (
            <motion.span
              key={e.id}
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`max-w-[9rem] truncate rounded-full px-2.5 py-0.5 text-sm font-bold ${
                e.status === "close" ? "bg-orange/20 text-orange" : e.status === "wrong" ? "bg-danger/15 text-danger" : "bg-surface-2 text-muted"
              }`}
            >
              {STATUS_ICON[e.status]} {e.text}
            </motion.span>
          ))}
        </AnimatePresence>
        {notice && <span className="ms-auto text-sm font-extrabold text-orange">{notice}</span>}
        {entries.length >= MAX_ENTRIES && <span className="ms-auto text-sm font-extrabold text-muted">خلصت محاولاتك</span>}
      </div>
    </div>
  );
}

/** Round results: everyone's titles, then well-known titles nobody said. */
export function FiveResults({ five, players, meId }: { five: PublicFive; players: PublicPlayer[]; meId?: string }) {
  const r = five.results;
  if (!r) return null;
  return (
    <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="space-y-3">
      <div className="panel space-y-2 p-4">
        <h2 className="font-extrabold text-muted">🎞️ اللي اتقال</h2>
        <ul className="space-y-2">
          {players.map((p) => (
            <li key={p.id} className={`rounded-xl px-3 py-2 ${p.id === meId ? "bg-magenta/15" : "bg-surface-2/50"}`}>
              <div className="flex items-center gap-2 font-bold">
                <span className="text-xl">{p.avatar}</span>
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-black text-gold">+{n(p.roundPoints ?? 0)}</span>
              </div>
              <p className="text-sm text-muted">{r.titles[p.id]?.join(" · ") || "ولا حاجة 😅"}</p>
            </li>
          ))}
        </ul>
      </div>
      {r.missed.length > 0 && (
        <div className="panel p-4">
          <h2 className="mb-1 font-extrabold text-muted">💡 كان ممكن تقول</h2>
          <p className="font-bold">{r.missed.join(" · ")}</p>
        </div>
      )}
    </motion.section>
  );
}
