"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useState } from "react";
import { initials, n } from "@/lib/format";
import type { PublicPlayer, PublicQuiz, QuizChoice } from "@/lib/game/types";
import { FiveTimer, useCountdown } from "./five-view";

function Picture({ choice, tall }: { choice: QuizChoice; tall: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`relative w-full overflow-hidden bg-surface-2 ${tall ? "aspect-[2/3]" : "aspect-[4/5]"}`}>
      {choice.image && !broken ? (
        <Image src={choice.image} alt={choice.label} fill sizes="(max-width: 640px) 45vw, 240px" className="object-cover" onError={() => setBroken(true)} />
      ) : (
        <div className="display flex h-full items-center justify-center bg-gradient-to-br from-magenta/60 to-surface-2 px-2 text-center text-3xl">
          {choice.sub ? "🎞️" : initials(choice.label)}
        </div>
      )}
    </div>
  );
}

/**
 * One quiz question for the host and for phones: tap a choice, then see the answer.
 * `onPick` is called once; the choice then stays locked.
 */
export function QuizScreen({
  quiz,
  players,
  meId,
  receivedAt,
  onPick,
}: {
  quiz: PublicQuiz;
  players: PublicPlayer[];
  meId: string;
  receivedAt: number;
  onPick: (choice: number) => void;
}) {
  // Keyed by question in the parent, so this resets every question.
  const [mine, setMine] = useState<number | null>(null);
  const left = useCountdown(quiz.msLeft, receivedAt);
  const reveal = quiz.reveal;
  const chosen = reveal ? (reveal.picks[meId] ?? mine) : mine;
  const answered = mine !== null || quiz.answered.includes(meId);
  const posters = quiz.choices.some((c) => c.image?.startsWith("http"));
  const counts = quiz.choices.map((_, i) => (reveal ? Object.values(reveal.picks).filter((c) => c === i).length : 0));
  const myPoints = reveal?.points[meId];

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl">❓</span>
        <span className="display text-2xl">
          السؤال {n(quiz.index + 1)} <span className="text-muted">من {n(quiz.total)}</span>
        </span>
      </div>
      {quiz.step === "playing" && <FiveTimer left={left} totalMs={quiz.totalMs} />}
      <h2 className="display text-center text-3xl sm:text-4xl">{quiz.prompt}</h2>

      <div className={`mx-auto grid grid-cols-2 gap-3 ${quiz.choices.length > 2 ? "max-w-sm" : "max-w-xl"}`}>
        {quiz.choices.map((c, i) => {
          const isAnswer = reveal?.answer === i;
          const isMine = chosen === i;
          const state = reveal ? (isAnswer ? "right" : isMine ? "wrong" : "dim") : isMine ? "mine" : "idle";
          return (
            <motion.button
              key={i}
              type="button"
              disabled={answered || quiz.step !== "playing" || (left ?? 0) <= 0}
              onClick={() => {
                setMine(i);
                navigator.vibrate?.(30);
                onPick(i);
              }}
              whileTap={{ scale: 0.97 }}
              animate={{ opacity: state === "dim" ? 0.45 : 1, scale: state === "right" ? [1, 1.05, 1] : 1 }}
              className={`overflow-hidden rounded-2xl text-start ring-2 transition ${
                state === "right"
                  ? "bg-success/20 ring-success"
                  : state === "wrong"
                    ? "bg-danger/20 ring-danger"
                    : state === "mine"
                      ? "bg-magenta/25 ring-magenta"
                      : "bg-surface-2/70 ring-line enabled:hover:ring-magenta/70"
              }`}
            >
              <Picture choice={c} tall={posters} />
              <div className="px-2.5 py-2 text-center">
                <p className="font-extrabold leading-tight">{c.label}</p>
                {c.sub && <p className="text-xs text-muted">{c.sub}</p>}
                {reveal && (
                  <p className="mt-0.5 text-xs font-bold text-muted">
                    {isAnswer ? "✅ " : ""}
                    {n(counts[i])} اختاروه
                  </p>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>

      {quiz.step === "playing" && (
        <p className="text-center text-sm font-bold text-muted">
          {answered ? "✔️ اتسجلت إجابتك… " : ""}
          جاوب {n(quiz.answered.length)} من {n(players.length)}
        </p>
      )}
      {reveal && (
        <motion.div initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="panel space-y-1 p-4 text-center">
          <p className="display text-2xl">
            {chosen === null ? "فاتتك المرة دي ⏰" : myPoints ? <span className="text-success">صح! +{n(myPoints)}</span> : <span className="text-danger">غلط ❌</span>}
          </p>
          {reveal.why && <p className="font-bold text-muted">{reveal.why}</p>}
        </motion.div>
      )}
    </div>
  );
}
