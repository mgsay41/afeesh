"use client";

import { motion } from "motion/react";
import { n } from "@/lib/format";
import { TEAM_ICONS, TEAM_TINT } from "@/lib/game/teams";
import type { GuessResult, PublicCharades, PublicPlayer } from "@/lib/game/types";
import { AnswerBox, useAnswer } from "./answer-box";
import { FiveTimer, useCountdown } from "./five-view";
import { TeamScores } from "./team-lobby";

const KIND = { movie: "🎞️ فيلم", series: "📺 مسلسل" } as const;

/**
 * One turn of team charades. The acting team picks who performs; the performer sees the title (`secret`,
 * decrypted on their own phone; the host reads it from their own state). The OTHER team sees only the type and
 * the number of words and types guesses, like real charades.
 */
export function CharadesScreen({
  turn,
  players,
  teams,
  meId,
  receivedAt,
  secret,
  guess,
  lastResult,
  onClaim,
  onStart,
  onSkip,
}: {
  turn: PublicCharades;
  players: PublicPlayer[];
  teams: string[];
  meId: string;
  receivedAt: number;
  /** The title, only when it's my turn to perform. */
  secret: string | null;
  guess: (guessId: string, text: string) => GuessResult | null | void;
  lastResult: GuessResult | null;
  onClaim: () => void;
  onStart: () => void;
  onSkip: () => void;
}) {
  const left = useCountdown(turn.msLeft, receivedAt);
  const { send, result } = useAnswer(guess, lastResult);
  const me = players.find((p) => p.id === meId);
  const performer = players.find((p) => p.id === turn.performerId);
  const iPerform = turn.performerId === meId;
  const acting = turn.team;
  const onActingTeam = me?.team === acting;
  const guessing = me?.team !== undefined && !onActingTeam;
  const tint = TEAM_TINT[acting];
  const guessed = turn.guessedIds.length > 0;
  const words = turn.words === 1 ? "كلمة واحدة" : turn.words === 2 ? "كلمتين" : `${n(turn.words)} كلمات`;
  const names = (ids: string[]) => ids.map((id) => players.find((p) => p.id === id)?.name).filter(Boolean).join("، ");

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl">🎭</span>
        <span className="display text-2xl">
          الدور {n(turn.index + 1)} <span className="text-muted">من {n(turn.total)}</span>
        </span>
      </div>
      <TeamScores teams={teams} scores={turn.scores} acting={acting} />
      {turn.step === "acting" && <FiveTimer left={left} totalMs={turn.totalMs} />}

      <div className={`panel space-y-1 p-4 text-center ring-2 ${tint.ring}`}>
        <p className={`text-sm font-bold ${tint.text}`}>
          {TEAM_ICONS[acting]} {teams[acting]} بيمثّل
        </p>
        {performer ? (
          <p className="display text-3xl">
            <span className="me-2 text-4xl">{performer.avatar}</span>
            {iPerform ? "انت!" : performer.name}
          </p>
        ) : (
          <p className="display text-2xl text-muted">بيختاروا مين يمثّل…</p>
        )}
        <p className="font-bold text-gold">
          {KIND[turn.kind]} · {words}
        </p>
      </div>

      {turn.step === "pick" && onActingTeam && (
        <div className="space-y-2 text-center">
          {turn.eligible.includes(meId) ? (
            <>
              <button onClick={onClaim} className="btn btn-primary btn-lg w-full">
                🎭 أنا هأمثّل
              </button>
              <p className="text-sm text-muted">اللي بيدوس الأول بياخد الدور. {turn.eligible.length > 1 && `الدور على: ${names(turn.eligible)}`}</p>
            </>
          ) : (
            <p className="font-bold text-muted">استنى زمايلك، لسه الدور على {names(turn.eligible)} 👀</p>
          )}
        </div>
      )}
      {turn.step === "pick" && !onActingTeam && (
        <p className="text-center text-lg font-bold text-muted">{teams[acting]} بيجهّز… استعدوا تخمّنوا 👀</p>
      )}

      {iPerform && (turn.step === "ready" || turn.step === "acting") && (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-3">
          <div className="rounded-3xl border-2 border-gold/70 bg-gradient-to-br from-[#3a1a5e] via-[#5a1846] to-[#7a2f12] p-5 text-center shadow-[0_0_60px_-10px_var(--gold)]">
            <p className="text-sm font-bold text-gold">🤫 سر: ماتورّيش حد الشاشة</p>
            {secret ? (
              <p className="display neon-text my-2 text-5xl">{secret}</p>
            ) : (
              <p className="my-3 font-bold text-orange">مش قادرين نعرض العنوان على موبايلك. قول للمضيف يختار حد تاني.</p>
            )}
            <p className="text-sm text-ink/80">مثّل من غير كلام ولا أصوات!</p>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            {turn.step === "ready" ? (
              <button onClick={onStart} disabled={!secret} className="btn btn-primary btn-lg">
                🎬 ابدأ التمثيل ({n(Math.round(turn.totalMs / 1000))} ثانية)
              </button>
            ) : (
              <p className="self-center text-center font-bold text-muted">{teams[1 - acting]} بيخمّن…</p>
            )}
            {turn.canSkip && (
              <button onClick={onSkip} className="btn btn-ghost px-3 text-sm" title="غيّر العنوان (مرة واحدة)">
                ⏭️ تخطّي
              </button>
            )}
          </div>
        </motion.div>
      )}

      {!iPerform && turn.step === "ready" && performer && (
        <p className="text-center text-lg font-bold text-muted">استنى {performer.name} يبدأ… 👀</p>
      )}

      {turn.step === "acting" && guessing && (
        <AnswerBox
          onSend={send}
          result={result}
          disabled={guessed || (left ?? 0) <= 0}
          placeholder={guessed ? "فريقكم عرفها! 🎉" : "اسم الفيلم أو المسلسل…"}
        />
      )}
      {turn.step === "acting" && !iPerform && onActingTeam && (
        <p className="text-center font-bold text-muted">شجّعوا {performer?.name} — ممنوع التخمين، {teams[1 - acting]} هو اللي بيخمّن 🤐</p>
      )}
      {turn.step === "acting" && me?.team === undefined && <p className="text-center text-sm text-muted">بتتفرج على الدور ده 👀</p>}

      {turn.reveal && (
        <motion.div initial={{ clipPath: "inset(0 50% 0 50%)" }} animate={{ clipPath: "inset(0 0% 0 0%)" }} transition={{ duration: 0.6 }} className="space-y-3">
          <div className="rounded-3xl border-2 border-gold/70 bg-gradient-to-br from-[#3a1a5e] via-[#5a1846] to-[#7a2f12] p-5 text-center">
            <p className="text-sm font-bold text-gold">كان</p>
            <p className="display neon-text text-5xl">{turn.reveal.title}</p>
          </div>
          <ul className="panel space-y-1.5 p-3">
            {players
              .filter((p) => p.id === turn.performerId || p.id in turn.reveal!.points)
              .map((p) => {
                const pts = p.id === turn.performerId ? turn.reveal!.performerPoints : (turn.reveal!.points[p.id] ?? 0);
                return (
                  <li key={p.id} className="flex items-center gap-2 font-bold">
                    <span className="text-xl">{p.avatar}</span>
                    <span className="flex-1 truncate">
                      {p.name} <span className="text-xs text-muted">{p.id === turn.performerId ? "(مثّل)" : "(خمّن)"}</span>
                    </span>
                    <span className="font-black text-gold">+{n(pts)}</span>
                  </li>
                );
              })}
            {!guessed && <li className="text-center font-bold text-muted">محدش خمّن 😅 {teams[1 - acting]} ما خدش نقط</li>}
          </ul>
        </motion.div>
      )}
    </div>
  );
}
