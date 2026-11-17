"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionBadge, QrShare, TopBar, useWakeLock } from "@/components/common";
import { FiveActor, FiveHeader, FiveInput, FiveProgress, FiveResults, FiveTimer, useCountdown, type OwnEntry } from "@/components/game/five-view";
import { GuessBox } from "@/components/game/guess-box";
import { AnswerReveal, AutoTimer, ClueBoard, HintChips, RoundHeader } from "@/components/game/round-view";
import { Podium, Scoreboard } from "@/components/game/scoreboard";
import { TeamBoard, TeamScores } from "@/components/game/team-lobby";
import { fireConfetti, n, newGuessId } from "@/lib/format";
import { ACTOR_MAP } from "@/lib/game/actors";
import { FIVE_TIME_OPTIONS } from "@/lib/game/five-engine";
import { familyOf, gameMeta } from "@/lib/game/games";
import { publicOf } from "@/lib/game/registry";
import { getAccepted } from "@/lib/game/room";
import type { FeedItem, FiveEntry, GameState, GuessResult } from "@/lib/game/types";
import { useHostGame, type HostGame } from "@/lib/game/use-host-game";
import { recordCorrect, recordGame, useProfile } from "@/lib/profile";
import { HostChain, HostCharades, HostQuiz } from "./host-games";

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
      {state.phase === "round" && <HostGameView game={game} state={state} />}
      {state.phase === "final" && <Final game={game} state={state} />}
    </>
  );
}

/** Picks the screen for the running game. */
function HostGameView({ game, state }: { game: HostGame; state: GameState }) {
  switch (familyOf(state.settings.game)) {
    case "five":
      return <HostFive game={game} state={state} />;
    case "quiz":
      return <HostQuiz game={game} state={state} />;
    case "charades":
      return <HostCharades game={game} state={state} />;
    case "chain":
      return <HostChain game={game} state={state} />;
    default:
      return <HostRound game={game} state={state} />;
  }
}

function Lobby({ game, state }: { game: HostGame; state: GameState }) {
  const [failed, setFailed] = useState(false);
  const pub = publicOf(state, 0); // time only matters for timers
  const count = pub.players.length;
  const meta = gameMeta(state.settings.game);
  const rounds = state.settings.rounds;
  const teamGame = meta.id === "charades" && !!pub.teams;
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
          {teamGame ? (
            <TeamBoard
              players={pub.players}
              teams={pub.teams!}
              meId={state.hostId}
              hostId={state.hostId}
              onMove={game.charades.setTeam}
              onRename={game.charades.rename}
              onShuffle={game.charades.shuffleTeams}
              onKick={game.kick}
            />
          ) : (
            <Scoreboard players={pub.players} meId={state.hostId} hostId={state.hostId} onKick={game.kick} />
          )}
          {count === 1 && (
            <motion.p animate={{ opacity: [0.5, 1, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="mt-4 text-center text-muted">
              خلي صحابك يمسحوا الـ QR… 📱
            </motion.p>
          )}
        </div>
        <p className="text-sm text-muted">
          {meta.icon} {meta.title}
          {meta.roundOptions.length > 0 && <> · {n(rounds)} {meta.family === "quiz" ? "أسئلة" : rounds === 1 ? "جولة" : "جولات"}</>}
          {meta.id === "tetrat" && (
            <>
              {" "}
              · {state.settings.pool === "all" ? "أفلام ومسلسلات" : state.settings.pool === "movie" ? "أفلام" : "مسلسلات"}
            </>
          )}
          {meta.time && <> · {n(state.settings.timeSec ?? meta.time.default)} ثانية</>}
          {meta.uses.autoReveal && <> · {state.settings.autoRevealSec ? `كشف تلقائي كل ${n(state.settings.autoRevealSec)} ث` : "كشف يدوي"}</>}
        </p>
        {failed && (
          <p className="text-sm font-bold text-danger">
            {teamGame ? "كل فريق لازم يبقى فيه لاعب واحد على الأقل." : "مقدرناش نجهز اللعبة دي (البيانات ناقصة). جرّب لعبة تانية."}
          </p>
        )}
        <button
          onClick={() => void game.start().then((ok) => setFailed(!ok))}
          disabled={teamGame && count < 2}
          className="btn btn-primary btn-lg w-full"
        >
          {teamGame && count < 2 ? "محتاجين لاعبين تانيين" : count > 1 ? `يلا نبدأ (${n(count)} لاعبين) 🎬` : "ابدأ (لوحدك) 🎬"}
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
  const pub = useMemo(() => publicOf(state, receivedAt), [state, receivedAt]);
  const round = pub.round!;
  // Labels of the two "reveal more" buttons, and whether the manual hint buttons exist, depend on the game.
  const stageLabels =
    round.mode === "link"
      ? ["٤️⃣ عمل رابع", "⭐ الأشهر"]
      : round.mode === "quote"
        ? ["📅 السنة والنوع", "🎭 اللي قالها"]
        : ["٤️⃣ الممثل الرابع", "⭐ الأبطال"];
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
            <GuessBox
              result={result}
              misses={r.misses[state.hostId] ?? 0}
              solved={solved}
              onGuess={guess}
              placeholder={round.mode === "link" ? "اسم الممثل…" : undefined}
            />
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
                  {stageLabels[0]}
                </button>
                <button onClick={game.nextStage} disabled={r.stage !== 2} className="btn btn-gold">
                  {stageLabels[1]}
                </button>
              </div>
              {!round.mode && (
                <>
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
                </>
              )}
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

const FIVE_NOTICE: Record<string, string> = {
  duplicate: "ده اتقال قبل كده",
  late: "الوقت خلص",
  locked: "خلصت محاولاتك",
  already: "خلصت الـ ٥ 😎",
  invalid: "اكتب حاجة",
};

function HostFive({ game, state }: { game: HostGame; state: GameState }) {
  const [, update] = useProfile();
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  const [notice, setNotice] = useState<string | null>(null);
  const r = state.five!;
  const pub = useMemo(() => publicOf(state, receivedAt), [state, receivedAt]);
  const five = pub.five!;
  const left = useCountdown(five.msLeft, receivedAt);
  const isLast = r.index + 1 >= state.titleIds.length;
  const count = five.counts[state.hostId] ?? 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh the timer base on each state change
    setReceivedAt(Date.now());
  }, [state.version]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- new round → clear the last message
    setNotice(null);
  }, [r.index]);

  const celebrated = useRef(-1);
  useEffect(() => {
    if (count >= 5 && celebrated.current !== r.index) {
      celebrated.current = r.index;
      void fireConfetti();
      recordCorrect(update);
    }
  }, [count, r.index, update]);

  const own: OwnEntry[] = r.entries
    .filter((e) => e.playerId === state.hostId)
    .map((e) => ({ id: e.id, text: e.text, status: e.verdict === "accepted" ? "correct" : e.verdict }));

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <FiveHeader five={five} />
        {five.step === "playing" && <FiveTimer left={left} totalMs={five.totalMs} />}
        <FiveActor five={five} />
        {five.step === "playing" && (
          <div className="mx-auto max-w-xl">
            <FiveInput
              entries={own}
              count={count}
              active={(left ?? 0) > 0}
              notice={notice}
              onEnter={(text) => {
                const res = game.guess(newGuessId(), text);
                setNotice(res ? (FIVE_NOTICE[res.verdict] ?? null) : null);
              }}
            />
          </div>
        )}
        {five.step === "results" && <FiveResults five={five} players={pub.players} meId={state.hostId} />}
        {(five.step === "playing" || five.step === "review") && (
          <section className="panel p-3">
            <FiveProgress players={pub.players} counts={five.counts} meId={state.hostId} />
          </section>
        )}
      </section>

      <aside className="space-y-4">
        <section className="panel space-y-3 p-4">
          <h2 className="font-extrabold text-muted">🎛️ التحكم</h2>
          {five.step === "ready" && (
            <>
              <p className="text-sm font-bold text-muted">⏱️ وقت الجولة</p>
              <div className="flex flex-wrap gap-1.5">
                {FIVE_TIME_OPTIONS.map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    className="chip-toggle"
                    aria-pressed={Math.round(five.totalMs / 1000) === sec}
                    onClick={() => game.five.setTime(sec)}
                  >
                    {n(sec)} ث
                  </button>
                ))}
              </div>
              <button onClick={game.five.begin} className="btn btn-primary btn-lg w-full">
                ⏱️ ابدأ الجولة
              </button>
            </>
          )}
          {five.step === "playing" && (
            <button onClick={game.five.end} className="btn btn-ghost w-full">
              ⏹️ خلّص الوقت
            </button>
          )}
          {five.step === "review" && (
            <>
              <p className="text-sm text-muted">راجع الإجابات المرفوضة. لو العنوان صح بس مش عندنا، دوس «صح».</p>
              <button onClick={game.five.results} className="btn btn-primary btn-lg w-full">
                📊 عرض النتائج
              </button>
            </>
          )}
          {five.step === "results" && (
            <button onClick={game.five.next} className="btn btn-primary btn-lg w-full">
              {isLast ? "🏆 النتيجة النهائية" : "الجولة التالية ⬅️"}
            </button>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="mb-2 font-extrabold text-muted">🏆 الترتيب</h2>
          <Scoreboard
            players={pub.players}
            meId={state.hostId}
            hostId={state.hostId}
            correctIds={pub.players.filter((p) => (five.counts[p.id] ?? 0) > 0).map((p) => p.id)}
            compact
          />
        </section>

        {five.step !== "ready" && <ReviewList game={game} state={state} playing={five.step === "playing"} />}
      </aside>
    </main>
  );
}

/** Rejected and host-accepted titles. Blurred while playing (the host plays too) until tapped. */
function ReviewList({ game, state, playing }: { game: HostGame; state: GameState; playing: boolean }) {
  const [peek, setPeek] = useState<Record<string, boolean>>({});
  const items = state.five!.entries.filter((e) => e.verdict === "close" || e.verdict === "wrong" || e.verdict === "accepted").slice(0, 60);
  if (!items.length) return null;
  const row = (e: FiveEntry) => {
    const visible = !playing || peek[e.id];
    return (
      <li key={e.id} className="flex items-center gap-2 rounded-xl bg-surface-2/60 px-2.5 py-1.5 text-sm">
        <span>{e.verdict === "accepted" ? "☑️" : e.verdict === "close" ? "🔥" : "❌"}</span>
        <span className="font-bold">{state.players[e.playerId]?.name ?? "؟"}</span>
        <button
          className={`min-w-0 flex-1 truncate text-start ${visible ? "" : "select-none blur-sm"}`}
          onClick={() => setPeek((s) => ({ ...s, [e.id]: true }))}
          title={visible ? e.text : "اضغط عشان تشوف"}
        >
          {e.text}
        </button>
        {e.verdict === "accepted" ? (
          <button onClick={() => game.five.undo(e.id)} className="rounded-lg bg-danger/20 px-2 py-0.5 text-xs font-black text-danger">
            تراجع
          </button>
        ) : (
          visible && (
            <button onClick={() => game.five.accept(e.id)} className="rounded-lg bg-success/20 px-2 py-0.5 text-xs font-black text-success">
              صح ✔
            </button>
          )
        )}
      </li>
    );
  };
  return (
    <section className="panel p-4">
      <h2 className="mb-2 font-extrabold text-muted">🧐 مراجعة الإجابات</h2>
      <ul className="max-h-80 space-y-1.5 overflow-y-auto">{items.map(row)}</ul>
    </section>
  );
}

/** Copies the titles the host accepted as JSON for content/filmography-overrides.json. */
function CopyMissing() {
  const [done, setDone] = useState<number | null>(null);
  async function copy() {
    const people: Record<string, { add: { ar: string; type: "movie" }[] }> = {};
    for (const [id, titles] of Object.entries(getAccepted())) {
      const actor = ACTOR_MAP[id];
      if (actor && titles.length) people[actor.nameAr] = { add: titles.map((ar) => ({ ar, type: "movie" })) };
    }
    await navigator.clipboard?.writeText(JSON.stringify({ people }, null, 2));
    setDone(Object.keys(people).length);
  }
  return (
    <button onClick={copy} className="btn btn-ghost text-sm">
      {done === null ? "📋 نسخ العناوين الناقصة" : `✓ اتنسخ (${n(done)} ممثل)`}
    </button>
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
  const pub = publicOf(state, 0); // time only matters for timers
  const me = pub.players.find((p) => p.id === state.hostId);
  const won = pub.players[0]?.id === state.hostId && (me?.score ?? 0) > 0;
  const key = `${state.room}:${state.startedAt ?? state.titleIds[0] ?? ""}`;
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
      {pub.teams && pub.charades && <TeamScores teams={pub.teams} scores={pub.charades.scores} big />}
      <Podium players={pub.players} meId={state.hostId} />
      {state.settings.game === "five" && <CopyMissing />}
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
