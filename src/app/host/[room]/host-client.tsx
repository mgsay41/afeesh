"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionBadge, QrShare, TopBar, useWakeLock } from "@/components/common";
import { GuessBox } from "@/components/game/guess-box";
import { AnswerReveal, AutoTimer, ClueBoard, HintChips, RoundHeader } from "@/components/game/round-view";
import { Podium, Scoreboard } from "@/components/game/scoreboard";
import { fireConfetti, n, newGuessId } from "@/lib/format";
import { toPublic } from "@/lib/game/engine";
import { TITLE_MAP } from "@/lib/game/titles";
import type { FeedItem, GameState, GuessResult } from "@/lib/game/types";
import { useHostGame, type HostGame } from "@/lib/game/use-host-game";
import { recordCorrect, recordGame, useProfile } from "@/lib/profile";

export function HostClient({ room }: { room: string }) {
  const game = useHostGame(room);
  const { state, status, mode } = game;
  useWakeLock(!!state && state.phase !== "final");

  if (state === undefined) return <div className="min-h-dvh" />;
  if (state === null) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-4 text-center">
        <p className="text-6xl">🎞️</p>
        <h1 className="display text-3xl">اللعبة دي مش على الجهاز ده</h1>
        <p className="text-muted">المضيف بس يقدر يتحكم في اللعبة. لو انت لاعب، ادخل من هنا:</p>
        <Link href={`/play/${room}`} className="btn btn-teal w-full">
          ادخل كلاعب
        </Link>
        <Link href="/" className="btn btn-ghost w-full">
          الرئيسية
        </Link>
      </main>
    );
  }

  return (
    <>
      <TopBar>
        <span className="text-sm font-bold text-muted">👥 {n(Object.keys(state.players).length)}</span>
        <ConnectionBadge status={status} mode={mode} />
      </TopBar>
      {mode === "local" && (
        <p className="mx-auto mt-3 max-w-6xl px-4 text-center text-xs text-orange">
          وضع تجريبي: مفيش مفتاح Ably، فاللعب شغال بين تابات المتصفح ده بس. ضيف ABLY_API_KEY عشان تلعب من موبايلات تانية.
        </p>
      )}
      {game.setupError && (
        <p className="mx-auto mt-3 max-w-6xl px-4 text-center text-sm font-bold text-danger">
          مش قادرين نتصل بـ Ably: مفتاح ABLY_API_KEY على السيرفر شكله غلط. اللاعبين مش هيقدروا يدخلوا.
        </p>
      )}
      {state.phase === "lobby" && <Lobby game={game} state={state} />}
      {state.phase === "round" && <HostRound game={game} state={state} />}
      {state.phase === "final" && <Final game={game} state={state} />}
    </>
  );
}

function Lobby({ game, state }: { game: HostGame; state: GameState }) {
  const pub = toPublic(state, TITLE_MAP, 0); // time only matters for the round timer
  const count = pub.players.length;
  return (
    <main className="mx-auto grid w-full max-w-5xl gap-5 px-4 py-6 md:grid-cols-[minmax(0,340px)_1fr]">
      <motion.section initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="panel p-6">
        <QrShare room={state.room} />
      </motion.section>
      <section className="panel flex flex-col gap-4 p-5 sm:p-6">
        <div className="flex items-baseline justify-between">
          <h1 className="display text-3xl">مستنيين اللاعبين…</h1>
          <span className="font-bold text-muted">{n(count)} لاعب</span>
        </div>
        <div className="flex-1">
          <Scoreboard players={pub.players} meId={state.hostId} hostId={state.hostId} onKick={game.kick} />
          {count === 1 && (
            <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-4 text-center text-muted">
              خلي صحابك يمسحوا الـ QR… 📱
            </motion.p>
          )}
        </div>
        <p className="text-sm text-muted">
          {n(state.settings.rounds)} جولات ·{" "}
          {state.settings.pool === "all" ? "أفلام ومسلسلات" : state.settings.pool === "movie" ? "أفلام" : "مسلسلات"} ·{" "}
          {state.settings.autoRevealSec ? `كشف تلقائي كل ${n(state.settings.autoRevealSec)} ث` : "كشف يدوي"}
        </p>
        <button onClick={game.start} className="btn btn-primary btn-lg w-full">
          {count > 1 ? `يلا نبدأ (${n(count)} لاعبين) 🎬` : "ابدأ (لوحدك) 🎬"}
        </button>
      </section>
    </main>
  );
}

function HostRound({ game, state }: { game: HostGame; state: GameState }) {
  const [, update] = useProfile();
  const [result, setResult] = useState<GuessResult | null>(null);
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const r = state.round!;
  const pub = useMemo(() => toPublic(state, TITLE_MAP, receivedAt), [state, receivedAt]);
  const round = pub.round!;
  const solved = r.correct[state.hostId] !== undefined;
  const isLast = r.index + 1 >= state.titleIds.length;

  // Reset the host's own guess box each round; refresh the timer base on each state change.
  const lastIndex = useRef(r.index);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from the round changing
    setReceivedAt(Date.now());
    if (lastIndex.current !== r.index) {
      lastIndex.current = r.index;
      setResult(null);
    }
  }, [state.version, r.index]);

  function guess(text: string) {
    const res = game.guess(newGuessId(), text);
    setResult(res);
    if (res?.verdict === "correct") {
      void fireConfetti();
      recordCorrect(update);
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <RoundHeader round={round} />
        <AutoTimer msLeft={round.autoMsLeft} receivedAt={receivedAt} totalSec={state.settings.autoRevealSec} />
        <ClueBoard round={round} />
        <HintChips round={round} />
        <AnimatePresence>{round.revealed && <AnswerReveal round={round} />}</AnimatePresence>
        {!round.revealed && (
          <div className="mx-auto max-w-xl">
            <GuessBox result={result} misses={r.misses[state.hostId] ?? 0} solved={solved} onGuess={guess} />
          </div>
        )}
      </section>

      <aside className="space-y-4">
        <section className="panel space-y-3 p-4">
          <h2 className="font-extrabold text-muted">🎛️ التحكم</h2>
          {!round.revealed ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={game.nextStage} disabled={r.stage !== 1} className="btn btn-teal">
                  ٤️⃣ الممثل الرابع
                </button>
                <button onClick={game.nextStage} disabled={r.stage !== 2} className="btn btn-gold">
                  ⭐ الأبطال
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => game.hint("genre")} disabled={r.hints.genre} className="btn btn-ghost px-2 text-sm">
                  🎭 النوع
                </button>
                <button onClick={() => game.hint("year")} disabled={r.hints.year} className="btn btn-ghost px-2 text-sm">
                  📅 السنة
                </button>
                <button onClick={() => game.hint("type")} disabled={r.hints.type} className="btn btn-ghost px-2 text-sm">
                  📺 فيلم/مسلسل
                </button>
              </div>
              <p className="text-center text-xs text-muted">كل تلميح بيخصم ١٠ نقط من الكل</p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <button onClick={game.reveal} className="btn btn-primary">
                  🎬 اكشف الإجابة
                </button>
                <button onClick={game.skip} className="btn btn-ghost px-3 text-sm" title="غيّر العنوان ده بعنوان تاني">
                  ⏭️ تخطي
                </button>
              </div>
            </>
          ) : (
            <motion.button
              initial={{ scale: 0.9 }}
              animate={{ scale: [1, 1.04, 1] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
              onClick={game.nextRound}
              className="btn btn-primary btn-lg w-full"
            >
              {isLast ? "🏆 النتيجة النهائية" : "الجولة التالية ⬅️"}
            </motion.button>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-extrabold text-muted">🏆 الترتيب</h2>
          <Scoreboard players={pub.players} meId={state.hostId} hostId={state.hostId} firstId={r.firstId} correctIds={round.correctIds} compact />
        </section>

        <Feed state={state} canPeek={round.revealed || solved} onAccept={game.accept} />
      </aside>
    </main>
  );
}

const VERDICT_ICON: Record<FeedItem["verdict"], string> = { correct: "✅", accepted: "☑️", close: "🔥", wrong: "❌" };

/** Live guesses. Text is hidden until the host has solved it or the answer is out — the host plays too. */
function Feed({ state, canPeek, onAccept }: { state: GameState; canPeek: boolean; onAccept: (id: string) => void }) {
  const [peek, setPeek] = useState<Record<string, boolean>>({});
  const r = state.round!;
  const items = r.feed.filter((f) => f.playerId !== state.hostId);
  if (!items.length) return null;
  return (
    <section className="panel p-4">
      <h2 className="mb-2 font-extrabold text-muted">💬 التخمينات</h2>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        <AnimatePresence initial={false}>
          {items.map((f) => {
            const p = state.players[f.playerId];
            const visible = canPeek || peek[f.id];
            const acceptable = (f.verdict === "close" || f.verdict === "wrong") && !(f.playerId in r.correct);
            return (
              <motion.li
                key={f.id}
                layout
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-2.5 py-1.5 text-sm"
              >
                <span>{VERDICT_ICON[f.verdict]}</span>
                <span className="font-bold">{p?.name ?? "؟"}</span>
                <button
                  className={`min-w-0 flex-1 truncate text-start ${visible ? "" : "select-none blur-sm"}`}
                  onClick={() => setPeek((s) => ({ ...s, [f.id]: true }))}
                  title={visible ? f.text : "اضغط عشان تشوف التخمين"}
                >
                  {f.text}
                </button>
                {f.points > 0 && <span className="font-black text-gold">+{f.points}</span>}
                {acceptable && visible && (
                  <button onClick={() => onAccept(f.id)} className="rounded-lg bg-success/20 px-2 py-0.5 text-xs font-black text-success">
                    قبول
                  </button>
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </section>
  );
}

function Final({ game, state }: { game: HostGame; state: GameState }) {
  const [, update] = useProfile();
  const pub = toPublic(state, TITLE_MAP, 0); // time only matters for the round timer
  const me = pub.players.find((p) => p.id === state.hostId);
  const won = pub.players[0]?.id === state.hostId && (me?.score ?? 0) > 0;
  const key = `${state.room}:${state.titleIds[0] ?? ""}`;
  useEffect(() => {
    void fireConfetti(true);
    if (me) recordGame(update, key, me.score, won);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per finished game
  }, [key]);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 text-center">
      <motion.h1 initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="display neon-text text-6xl">
        النتيجة النهائية
      </motion.h1>
      <Podium players={pub.players} meId={state.hostId} />
      <div className="grid grid-cols-2 gap-3">
        <button onClick={game.playAgain} className="btn btn-primary btn-lg">
          🔁 العب تاني
        </button>
        <Link href="/" className="btn btn-ghost btn-lg">
          الرئيسية
        </Link>
      </div>
    </main>
  );
}
