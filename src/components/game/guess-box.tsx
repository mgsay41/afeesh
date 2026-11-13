"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { isArabicText } from "@/lib/arabic";
import { MAX_MISSES } from "@/lib/game/engine";
import type { GuessResult } from "@/lib/game/types";

const MESSAGES: Record<GuessResult["verdict"], { text: string; tone: string }> = {
  correct: { text: "صح! 🎉", tone: "text-success" },
  close: { text: "قربت! 🔥 حاول تاني", tone: "text-orange" },
  wrong: { text: "لأ ❌", tone: "text-danger" },
  locked: { text: "خلصت محاولاتك للجولة دي", tone: "text-muted" },
  late: { text: "الجولة خلصت", tone: "text-muted" },
  already: { text: "انت عرفتها خلاص 😎", tone: "text-success" },
  invalid: { text: "اكتب الاسم بالعربي", tone: "text-orange" },
};

interface Props {
  result: GuessResult | null;
  /** Misses so far this round (from public state). */
  misses: number;
  solved: boolean;
  disabled?: boolean;
  onGuess: (text: string) => void;
}

export function GuessBox({ result, misses, solved, disabled, onGuess }: Props) {
  const [text, setText] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [rowRef, animate] = useAnimate<HTMLDivElement>();

  // Shake without re-mounting the input (re-mounting would close the phone keyboard).
  useEffect(() => {
    if (shakeKey && rowRef.current) {
      void animate(rowRef.current, { x: [0, -9, 9, -7, 7, -3, 0] }, { duration: 0.45 });
      navigator.vibrate?.(40);
    }
  }, [shakeKey, animate, rowRef]);

  // A new verdict arrived → stop waiting, shake on a miss.
  useEffect(() => {
    if (!result) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to a network result
    setPending(false);
    if (result.verdict === "wrong" || result.verdict === "close") setShakeKey((k) => k + 1);
    if (result.verdict === "correct") setText("");
  }, [result]);

  const left = Math.max(0, MAX_MISSES - misses);
  const locked = !solved && left === 0;
  const inactive = disabled || solved || locked;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || inactive || pending) return;
    if (!isArabicText(t)) {
      setLocalError("اكتب الاسم بالعربي");
      setShakeKey((k) => k + 1);
      return;
    }
    setLocalError(null);
    setPending(true);
    onGuess(t);
    setTimeout(() => setPending(false), 4000); // never stay stuck if a reply is lost
  }

  const msg = localError
    ? { text: localError, tone: "text-orange" }
    : solved
      ? MESSAGES.already
      : locked
        ? MESSAGES.locked
        : result
          ? MESSAGES[result.verdict]
          : null;

  return (
    <form onSubmit={submit} className="space-y-2">
      <div ref={rowRef} className="flex gap-2">
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setLocalError(null);
          }}
          disabled={inactive}
          placeholder={solved ? "برافو! استنى الباقيين" : "اسم الفيلم أو المسلسل…"}
          className="field flex-1"
          maxLength={60}
          enterKeyHint="send"
          autoComplete="off"
          aria-label="تخمينك"
        />
        <button type="submit" className="btn btn-primary min-w-24" disabled={inactive || pending || !text.trim()}>
          {pending ? "…" : "خمّن"}
        </button>
      </div>
      <div className="flex min-h-7 items-center justify-between gap-2 px-1">
        <AnimatePresence mode="wait">
          {msg && (
            <motion.p
              key={msg.text + (result?.guessId ?? "")}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className={`text-base font-extrabold ${msg.tone}`}
            >
              {msg.text}
              {result?.verdict === "correct" && !localError && (
                <span className="ms-2 text-gold">+{result.points}</span>
              )}
            </motion.p>
          )}
        </AnimatePresence>
        {!solved && (
          <span className="ms-auto flex gap-1" aria-label={`المحاولات المتبقية ${left}`}>
            {Array.from({ length: MAX_MISSES }, (_, i) => (
              <span key={i} className={`text-sm ${i < left ? "" : "opacity-20 grayscale"}`}>
                🎟️
              </span>
            ))}
          </span>
        )}
      </div>
    </form>
  );
}
