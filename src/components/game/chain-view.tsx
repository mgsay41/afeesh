"use client";

import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { n } from "@/lib/format";
import { HEARTS } from "@/lib/game/chain";
import type { GuessResult, PublicChain, PublicPlayer } from "@/lib/game/types";
import { AnswerBox, useAnswer } from "./answer-box";
import { FiveTimer, useCountdown } from "./five-view";

function LinkChip({ link, players, last }: { link: PublicChain["links"][number]; players: PublicPlayer[]; last: boolean }) {
  const [broken, setBroken] = useState(false);
  const by = players.find((p) => p.id === link.by);
  return (
    <motion.li
      layout
      initial={{ x: 30, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${last ? "bg-magenta/20 ring-2 ring-magenta/60" : "bg-surface-2/60"}`}
    >
      {link.kind === "work" ? (
        <span className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-surface-2">
          {link.poster && !broken ? (
            <Image src={link.poster} alt="" fill sizes="40px" className="object-cover" onError={() => setBroken(true)} />
          ) : (
            <span className="flex h-full items-center justify-center text-xl">🎞️</span>
          )}
        </span>
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal/20 text-xl">🎭</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold">{link.label}</span>
        <span className="block text-xs text-muted">{link.kind === "work" ? "عمل" : "ممثل"}</span>
      </span>
      {by && <span className="text-xl" title={by.name}>{by.avatar}</span>}
    </motion.li>
  );
}

const EVENT_TEXT = {
  timeout: (name: string) => `⏰ ${name} اتأخر وخسر قلب`,
  out: (name: string) => `💔 ${name} خرج من اللعبة`,
  win: (name: string) => `🏆 ${name} كسب!`,
} as const;

/**
 * The chain game for the host and phones: whose turn it is, the links so far, and the answer box on my turn.
 * `rejected` (host only) lists this turn's refused answers so the host can accept one.
 */
export function ChainScreen({
  chain,
  players,
  meId,
  receivedAt,
  guess,
  lastResult,
  rejected,
  onAccept,
}: {
  chain: PublicChain;
  players: PublicPlayer[];
  meId: string;
  receivedAt: number;
  guess: (guessId: string, text: string) => GuessResult | null | void;
  lastResult: GuessResult | null;
  rejected?: { id: string; playerId: string; text: string }[];
  onAccept?: (id: string) => void;
}) {
  const left = useCountdown(chain.over ? null : chain.msLeft, receivedAt);
  const { send, result } = useAnswer(guess, lastResult);
  const mine = chain.turnOf === meId && !chain.over && !chain.out.includes(meId);
  const turnPlayer = players.find((p) => p.id === chain.turnOf);
  const last = chain.links[chain.links.length - 1];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? "؟";

  // Toast for timeouts / eliminations / the winner.
  const [toast, setToast] = useState<string | null>(null);
  const seen = useRef(chain.event?.n ?? 0);
  useEffect(() => {
    const e = chain.event;
    if (!e || e.n === seen.current) return;
    seen.current = e.n;
    setToast(EVENT_TEXT[e.type](nameOf(e.playerId)));
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the event matters
  }, [chain.event]);

  const winner = chain.winnerId ? players.find((p) => p.id === chain.winnerId) : null;

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap justify-center gap-2" aria-label="القلوب">
        {players.filter((p) => p.id in chain.hearts).map((p) => {
          const out = chain.out.includes(p.id);
          const turn = p.id === chain.turnOf && !chain.over;
          return (
            <li key={p.id} className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold ${turn ? "bg-magenta/25 ring-2 ring-magenta" : "bg-surface-2/70"} ${out ? "opacity-40" : ""}`}>
              <span className="text-lg">{p.avatar}</span>
              <span className="max-w-24 truncate">{p.name}</span>
              <span aria-label={`${chain.hearts[p.id]} قلوب`}>
                {Array.from({ length: HEARTS }, (_, i) => (i < chain.hearts[p.id] ? "❤️" : "🖤")).join("")}
              </span>
            </li>
          );
        })}
      </ul>

      <AnimatePresence>
        {toast && (
          <motion.p initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ opacity: 0 }} className="panel p-3 text-center text-lg font-extrabold text-orange">
            {toast}
          </motion.p>
        )}
      </AnimatePresence>

      {chain.over ? (
        <div className="panel space-y-1 p-5 text-center">
          <p className="text-5xl">{winner ? "🏆" : "🏁"}</p>
          <p className="display text-3xl">{winner ? `${winner.name} كسب!` : "اللعبة خلصت"}</p>
          <p className="text-muted">السلسلة وصلت {n(chain.count)} حلقة</p>
        </div>
      ) : (
        <>
          <FiveTimer left={left} totalMs={chain.totalMs} />
          <div className="panel p-4 text-center">
            <p className="text-sm font-bold text-muted">{mine ? "دورك!" : `دور ${turnPlayer?.name ?? ""}`}</p>
            <p className="display text-3xl">
              {chain.expect === "actor" ? "قول ممثل من" : "قول عمل تاني لـ"} <span className="neon-text">«{last.label}»</span>
            </p>
          </div>
          {mine ? (
            <AnswerBox
              onSend={send}
              result={result}
              placeholder={chain.expect === "actor" ? "اسم ممثل…" : "اسم فيلم أو مسلسل…"}
              button="أدخل"
            />
          ) : (
            <p className="text-center font-bold text-muted">استنى دورك… 👀</p>
          )}
        </>
      )}

      {onAccept && rejected && rejected.length > 0 && !chain.over && (
        <ul className="panel space-y-1.5 p-3">
          <li className="text-sm font-extrabold text-muted">🧐 إجابات مرفوضة الدور ده</li>
          {rejected.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-2.5 py-1.5 text-sm">
              <span className="font-bold">{nameOf(r.playerId)}</span>
              <span className="min-w-0 flex-1 truncate">{r.text}</span>
              <button onClick={() => onAccept(r.id)} className="rounded-lg bg-success/20 px-2 py-0.5 text-xs font-black text-success">
                صح ✔
              </button>
            </li>
          ))}
        </ul>
      )}

      <section aria-label="السلسلة">
        <h2 className="mb-2 font-extrabold text-muted">⛓️ السلسلة ({n(chain.count)})</h2>
        <ul className="space-y-1.5">
          {chain.links.map((l, i) => (
            <LinkChip key={`${chain.count - chain.links.length + i}-${l.id}`} link={l} players={players} last={i === chain.links.length - 1} />
          )).reverse()}
        </ul>
      </section>
    </div>
  );
}
