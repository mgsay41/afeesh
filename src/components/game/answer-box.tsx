"use client";

import { AnimatePresence, motion, useAnimate } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { newGuessId } from "@/lib/format";
import type { GuessResult } from "@/lib/game/types";

const MESSAGES: Record<GuessResult["verdict"], { text: string; tone: string }> = {
  correct: { text: "صح! 🎉", tone: "text-success" },
  close: { text: "قربت! 🔥 حاول تاني", tone: "text-orange" },
  wrong: { text: "لأ ❌", tone: "text-danger" },
  locked: { text: "مش دورك تخمّن", tone: "text-muted" },
  late: { text: "الوقت خلص", tone: "text-muted" },
  already: { text: "انت عرفتها خلاص 😎", tone: "text-success" },
  invalid: { text: "اكتب حاجة", tone: "text-orange" },
  duplicate: { text: "ده اتقال قبل كده", tone: "text-orange" },
};

/**
 * Sends typed answers and tracks the verdicts that belong to them. `guess` returns the result right away
 * for the host (judged locally); for phones the result arrives later as `lastResult`.
 */
export function useAnswer(guess: (guessId: string, text: string) => GuessResult | null | void, lastResult: GuessResult | null) {
  const [ids, setIds] = useState<string[]>([]);
  const [local, setLocal] = useState<GuessResult | null>(null);
  const send = (text: string) => {
    const id = newGuessId();
    setIds((x) => [...x, id]);
    const res = guess(id, text);
    if (res) setLocal(res);
  };
  const result = lastResult && ids.includes(lastResult.guessId) ? lastResult : local;
  return { send, result };
}

export function AnswerBox({
  onSend,
  result,
  placeholder,
  disabled,
  button = "خمّن",
}: {
  onSend: (text: string) => void;
  result: GuessResult | null;
  placeholder: string;
  disabled?: boolean;
  button?: string;
}) {
  const [text, setText] = useState("");
  const [rowRef, animate] = useAnimate<HTMLFormElement>();
  const shaken = useRef<string | null>(null);

  useEffect(() => {
    if (!result || shaken.current === result.guessId) return;
    shaken.current = result.guessId;
    if (result.verdict === "wrong" || result.verdict === "close") {
      if (rowRef.current) void animate(rowRef.current, { x: [0, -9, 9, -7, 7, 0] }, { duration: 0.4 });
      navigator.vibrate?.(40);
    }
  }, [result, animate, rowRef]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || disabled) return;
    setText("");
    onSend(t);
  }

  const msg = result ? MESSAGES[result.verdict] : null;
  return (
    <div className="space-y-2">
      <form ref={rowRef} onSubmit={submit} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={disabled}
          placeholder={placeholder}
          className="field flex-1"
          maxLength={60}
          enterKeyHint="send"
          autoComplete="off"
          aria-label={placeholder}
        />
        <button type="submit" className="btn btn-primary min-w-24" disabled={disabled || !text.trim()}>
          {button}
        </button>
      </form>
      <div className="min-h-7 px-1">
        <AnimatePresence mode="wait">
          {msg && (
            <motion.p
              key={result!.guessId}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              className={`text-base font-extrabold ${msg.tone}`}
            >
              {msg.text}
              {result!.verdict === "correct" && result!.points > 0 && <span className="ms-2 text-gold">+{result!.points}</span>}
              {(result!.verdict === "wrong" || result!.verdict === "close") && result!.attemptsLeft > 0 && (
                <span className="ms-2 text-sm text-muted">({result!.attemptsLeft} محاولات)</span>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
