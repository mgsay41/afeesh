"use client";

import { motion } from "motion/react";
import { n } from "@/lib/format";
import type { GuessResult, PublicCharades, PublicPlayer } from "@/lib/game/types";
import { AnswerBox, useAnswer } from "./answer-box";
import { FiveTimer, useCountdown } from "./five-view";

const KIND = { movie: "🎞️ فيلم", series: "📺 مسلسل" } as const;

/**
 * One charades turn. The performer sees the title (`secret`, decrypted on their own phone; the host reads it
 * from their own state); everyone else sees only the type and the number of words, like real charades.
 */
export function CharadesScreen({
  turn,
  players,
  meId,
  receivedAt,
  secret,
  guess,
  lastResult,
  onStart,
  onSkip,
}: {
  turn: PublicCharades;
  players: PublicPlayer[];
  meId: string;
  receivedAt: number;
  /** The title, only when it's my turn to perform. */
  secret: string | null;
  guess: (guessId: string, text: string) => GuessResult | null | void;
  lastResult: GuessResult | null;
  onStart: () => void;
  onSkip: () => void;
}) {
  const left = useCountdown(turn.msLeft, receivedAt);
  const { send, result } = useAnswer(guess, lastResult);
  const performer = players.find((p) => p.id === turn.performerId);
  const iPerform = turn.performerId === meId;
  const iGuessed = turn.guessedIds.includes(meId);
  const guessers = players.filter((p) => p.id !== turn.performerId);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl">🎭</span>
        <span className="display text-2xl">
          الدور {n(turn.index + 1)} <span className="text-muted">من {n(turn.total)}</span>
        </span>
      </div>
      {turn.step === "acting" && <FiveTimer left={left} totalMs={turn.totalMs} />}

      <div className="panel space-y-1 p-4 text-center">
        <p className="text-sm font-bold text-muted">{iPerform ? "انت اللي بتمثّل" : "بيمثّل"}</p>
        <p className="display text-3xl">
          <span className="me-2 text-4xl">{performer?.avatar}</span>
          {performer?.name}
        </p>
        <p className="font-bold text-gold">
          {KIND[turn.kind]} · {turn.words === 1 ? "كلمة واحدة" : turn.words === 2 ? "كلمتين" : `${n(turn.words)} كلمات`}
        </p>
      </div>

      {iPerform && turn.step !== "done" && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-3">
          <div className="rounded-3xl border-2 border-gold/70 bg-gradient-to-br from-[#3a1a5e] via-[#5a1846] to-[#7a2f12] p-5 text-center shadow-[0_0_60px_-10px_var(--gold)]">
            <p className="text-sm font-bold text-gold">🤫 سر: ماتورّيش حد الشاشة</p>
            {secret ? (
              <p className="display neon-text my-2 text-5xl">{secret}</p>
            ) : (
              <p className="my-3 font-bold text-orange">مش قادرين نعرض العنوان على موبايلك. قول للمضيف يتخطى دورك.</p>
            )}
            <p className="text-sm text-ink/80">مثّل من غير كلام ولا أصوات!</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            {turn.step === "ready" ? (
              <button onClick={onStart} disabled={!secret} className="btn btn-primary btn-lg">
                🎬 ابدأ التمثيل (٦٠ ثانية)
              </button>
            ) : (
              <p className="self-center text-center font-bold text-muted">
                خمّنوا {n(turn.guessedIds.length)} من {n(guessers.length)}
              </p>
            )}
            {turn.canSkip && (
              <button onClick={onSkip} className="btn btn-ghost px-3 text-sm" title="غيّر العنوان (مرة واحدة)">
                ⏭️ تخطّي
              </button>
            )}
          </div>
        </motion.div>
      )}

      {!iPerform && turn.step === "ready" && <p className="text-center text-lg font-bold text-muted">استنى {performer?.name} يبدأ… 👀</p>}

      {!iPerform && turn.step === "acting" && (
        <AnswerBox
          onSend={send}
          result={result}
          disabled={iGuessed || (left ?? 0) <= 0}
          placeholder={iGuessed ? "برافو! استنى الباقيين" : "اسم الفيلم أو المسلسل…"}
        />
      )}

      {turn.step === "acting" && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="مين خمّن">
          {guessers.map((p) => (
            <li key={p.id} className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-sm font-bold ${turn.guessedIds.includes(p.id) ? "bg-success/20 text-success" : "bg-surface-2/70 text-muted"}`}>
              {p.avatar} {p.name} {turn.guessedIds.includes(p.id) && "✅"}
            </li>
          ))}
        </ul>
      )}

      {turn.reveal && (
        <motion.div initial={{ clipPath: "inset(0 50% 0 50%)" }} animate={{ clipPath: "inset(0 0% 0 0%)" }} transition={{ duration: 0.6 }} className="space-y-3">
          <div className="rounded-3xl border-2 border-gold/70 bg-gradient-to-br from-[#3a1a5e] via-[#5a1846] to-[#7a2f12] p-5 text-center">
            <p className="text-sm font-bold text-gold">كان</p>
            <p className="display neon-text text-5xl">{turn.reveal.title}</p>
          </div>
          <ul className="panel space-y-1.5 p-3">
            {players.map((p) => {
              const pts = p.id === turn.performerId ? turn.reveal!.performerPoints : (turn.reveal!.points[p.id] ?? 0);
              return (
                <li key={p.id} className="flex items-center gap-2 font-bold">
                  <span className="text-xl">{p.avatar}</span>
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className={pts ? "font-black text-gold" : "text-muted"}>{pts ? `+${n(pts)}` : p.id === turn.performerId ? "ما حدش خمّن 😅" : "—"}</span>
                </li>
              );
            })}
          </ul>
        </motion.div>
      )}
    </div>
  );
}
