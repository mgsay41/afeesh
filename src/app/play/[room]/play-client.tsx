"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionBadge, ProfileForm, TopBar } from "@/components/common";
import { FiveActor, FiveHeader, FiveInput, FiveProgress, FiveResults, FiveTimer, useCountdown, type OwnEntry } from "@/components/game/five-view";
import { GuessBox } from "@/components/game/guess-box";
import { AnswerReveal, AutoTimer, ClueBoard, HintChips, RoundHeader } from "@/components/game/round-view";
import { Podium, Scoreboard } from "@/components/game/scoreboard";
import { fireConfetti, n, newGuessId } from "@/lib/format";
import { familyOf } from "@/lib/game/games";
import { loadHostGame } from "@/lib/game/room";
import type { PublicState } from "@/lib/game/types";
import { usePlayerGame } from "@/lib/game/use-player-game";
import { recordCorrect, recordGame, useProfile, type Profile } from "@/lib/profile";
import { PlayerChain, PlayerCharades, PlayerQuiz } from "./play-games";

export function PlayClient({ room }: { room: string }) {
  const [profile, update] = useProfile();
  const [joined, setJoined] = useState(false);

  // This browser is hosting this room with the same profile: give the player tab its own
  // profile, otherwise "joining" would just overwrite the host.
  const isHostProfile = !!profile && loadHostGame(room)?.hostId === profile.id;
  useEffect(() => {
    if (!isHostProfile) return;
    const url = new URL(location.href);
    const slot = Number(url.searchParams.get("slot") ?? 1);
    url.searchParams.set("slot", String(slot + 1));
    location.replace(url);
  }, [isHostProfile]);

  if (!profile || isHostProfile) return <div className="min-h-dvh" />;
  if (!joined) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-8">
        <div className="text-center">
          <Link href="/" className="display neon-text text-6xl">
            أفيش
          </Link>
          <p className="mt-2 text-muted">
            داخل لعبة <span className="font-black tracking-widest text-ink" dir="ltr">{room}</span>
          </p>
        </div>
        <motion.section initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="panel p-5">
          <ProfileForm
            name={profile.name}
            avatar={profile.avatar}
            cta="ادخل اللعبة 🎟️"
            onSubmit={(name, avatar) => {
              update((p) => ({ ...p, name, avatar }));
              setJoined(true);
            }}
          />
        </motion.section>
      </main>
    );
  }
  return <Game room={room} profile={profile} update={update} />;
}

function Game({ room, profile, update }: { room: string; profile: Profile; update: ReturnType<typeof useProfile>[1] }) {
  const me = useMemo(() => ({ id: profile.id, name: profile.name, avatar: profile.avatar }), [profile.id, profile.name, profile.avatar]);
  const game = usePlayerGame(room, me);
  const { state, status, mode, kicked } = game;
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaitedLong(true), 9000);
    return () => clearTimeout(t);
  }, []);

  if (kicked) {
    return (
      <Center emoji="🚪" title="المضيف طلّعك من اللعبة">
        <Link href="/" className="btn btn-ghost w-full">
          الرئيسية
        </Link>
      </Center>
    );
  }

  return (
    <>
      <TopBar>
        <span className="flex items-center gap-1.5 font-bold">
          <span className="text-xl">{profile.avatar}</span>
          {profile.name}
        </span>
        <ConnectionBadge status={status} mode={mode} />
      </TopBar>
      {!state && (game.setupError || status === "offline") ? (
        <Center emoji="🔌" title="مش قادرين نتصل">
          <p className="text-muted">
            {game.setupError
              ? "مفتاح Ably على السيرفر فيه مشكلة. صاحب اللعبة لازم يراجع ABLY_API_KEY."
              : "النت فاصل أو الاتصال اتقطع. جرّب تاني."}
          </p>
          <button className="btn btn-ghost w-full" onClick={() => location.reload()}>
            حاول تاني 🔄
          </button>
        </Center>
      ) : !state ? (
        <Center emoji="📡" title="بندوّر على المضيف…">
          {mode === "local" && (
            <p className="panel p-4 text-sm text-orange">
              اللعبة في الوضع التجريبي (مفيش مفتاح Ably)، فبتشتغل بس بين تابات نفس المتصفح. من موبايل أو متصفح تاني
              مش هتوصل للمضيف. ضيف ABLY_API_KEY عشان تلعبوا من أجهزة مختلفة.
            </p>
          )}
          {waitedLong && (
            <p className="text-muted">
              اتأكد إن الكود صح <b dir="ltr">{room}</b> وإن صفحة المضيف مفتوحة.
            </p>
          )}
        </Center>
      ) : state.phase === "lobby" ? (
        <Lobby state={state} meId={me.id} />
      ) : state.phase === "round" ? (
        <PlayerGameView game={game} state={state} meId={me.id} update={update} />
      ) : (
        <Final state={state} meId={me.id} update={update} />
      )}
    </>
  );
}

/** Picks the screen for the running game. */
function PlayerGameView({
  game,
  state,
  meId,
  update,
}: {
  game: ReturnType<typeof usePlayerGame>;
  state: PublicState;
  meId: string;
  update: ReturnType<typeof useProfile>[1];
}) {
  switch (familyOf(state.settings.game)) {
    case "five":
      return <PlayerFive key={state.five?.index} game={game} state={state} meId={meId} update={update} />;
    case "quiz":
      return <PlayerQuiz game={game} state={state} meId={meId} />;
    case "charades":
      return <PlayerCharades game={game} state={state} meId={meId} />;
    case "chain":
      return <PlayerChain game={game} state={state} meId={meId} />;
    default:
      return <PlayerRound key={state.round?.index} game={game} state={state} meId={meId} update={update} />;
  }
}

function Center({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <motion.p animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 1.8 }} className="text-6xl">
        {emoji}
      </motion.p>
      <h1 className="display text-3xl">{title}</h1>
      {children}
    </main>
  );
}

function Lobby({ state, meId }: { state: PublicState; meId: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 py-6">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
        <p className="text-6xl">🎉</p>
        <h1 className="display mt-2 text-4xl">انت جوه!</h1>
        <p className="text-muted">استنى المضيف يبدأ اللعبة…</p>
      </motion.div>
      <section className="panel p-4">
        <h2 className="mb-2 font-extrabold text-muted">👥 اللاعبين ({n(state.players.length)})</h2>
        <Scoreboard players={state.players} meId={meId} hostId={state.hostId} compact />
      </section>
    </main>
  );
}

function PlayerRound({
  game,
  state,
  meId,
  update,
}: {
  game: ReturnType<typeof usePlayerGame>;
  state: PublicState;
  meId: string;
  update: ReturnType<typeof useProfile>[1];
}) {
  const round = state.round!;
  // Keyed by round index in the parent, so this resets every round.
  const [myGuesses, setMyGuesses] = useState<string[]>([]);
  const [showBoard, setShowBoard] = useState(false);
  const solved = round.correctIds.includes(meId);
  const result = game.lastResult && myGuesses.includes(game.lastResult.guessId) ? game.lastResult : null;

  const celebrated = useRef<string | null>(null);
  useEffect(() => {
    if (result?.verdict === "correct" && celebrated.current !== result.guessId) {
      celebrated.current = result.guessId;
      void fireConfetti();
      recordCorrect(update);
      navigator.vibrate?.(80);
    }
  }, [result, update]);

  const myRank = state.players.findIndex((p) => p.id === meId) + 1;
  const myScore = state.players.find((p) => p.id === meId)?.score ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 pb-10">
      <RoundHeader round={round} />
      <AutoTimer msLeft={round.autoMsLeft} receivedAt={game.receivedAt} totalSec={state.settings.autoRevealSec} />
      <ClueBoard round={round} />
      <HintChips round={round} />
      <AnimatePresence>{round.revealed && <AnswerReveal round={round} />}</AnimatePresence>
      {!round.revealed ? (
        <GuessBox
          key={round.index}
          result={result}
          misses={round.misses[meId] ?? 0}
          solved={solved}
          placeholder={round.mode === "link" ? "اسم الممثل…" : undefined}
          onGuess={(text) => {
            const id = newGuessId();
            setMyGuesses((g) => [...g, id]);
            game.guess(id, round.index, text);
          }}
        />
      ) : (
        <p className="text-center font-bold text-muted">
          {solved ? "برافو عليك! 👏" : "المرة الجاية 💪"} · المضيف هيبدأ الجولة الجاية
        </p>
      )}

      <button onClick={() => setShowBoard((s) => !s)} className="panel flex items-center justify-between px-4 py-3 font-bold">
        <span>🏆 ترتيبك: {n(myRank)} من {n(state.players.length)}</span>
        <span className="tabular-nums text-gold">
          {n(myScore)} نقطة {showBoard ? "▲" : "▼"}
        </span>
      </button>
      <AnimatePresence>
        {(showBoard || round.revealed) && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Scoreboard players={state.players} meId={meId} hostId={state.hostId} firstId={round.firstId} correctIds={round.correctIds} compact />
          </motion.div>
        )}
      </AnimatePresence>
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

function PlayerFive({
  game,
  state,
  meId,
  update,
}: {
  game: ReturnType<typeof usePlayerGame>;
  state: PublicState;
  meId: string;
  update: ReturnType<typeof useProfile>[1];
}) {
  const five = state.five!;
  // Keyed by round index in the parent, so this resets every round.
  const [sent, setSent] = useState<{ id: string; text: string }[]>([]);
  const [showBoard, setShowBoard] = useState(false);
  const left = useCountdown(five.msLeft, game.receivedAt);
  const count = five.counts[meId] ?? 0;

  // Latest verdict per entry; entries refused for other reasons (duplicate, late…) leave the list.
  const entries: OwnEntry[] = sent
    .map((s): OwnEntry | null => {
      const res = [...game.results].reverse().find((r) => r.guessId === s.id);
      if (!res) return { ...s, status: "pending" };
      if (res.verdict === "correct" || res.verdict === "close" || res.verdict === "wrong") return { ...s, status: res.verdict };
      return null;
    })
    .filter((e): e is OwnEntry => e !== null)
    .reverse();
  const last = game.lastResult && sent.some((s) => s.id === game.lastResult!.guessId) ? game.lastResult : null;
  const notice = last ? (FIVE_NOTICE[last.verdict] ?? null) : null;

  const celebrated = useRef(false);
  useEffect(() => {
    if (count >= 5 && !celebrated.current) {
      celebrated.current = true;
      void fireConfetti();
      recordCorrect(update);
      navigator.vibrate?.(80);
    }
  }, [count, update]);

  const myRank = state.players.findIndex((p) => p.id === meId) + 1;
  const myScore = state.players.find((p) => p.id === meId)?.score ?? 0;

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 pb-10">
      <FiveHeader five={five} />
      {five.step === "playing" && <FiveTimer left={left} totalMs={five.totalMs} />}
      <FiveActor five={five} small={five.step !== "ready"} />

      {five.step === "playing" && (
        <>
          <FiveInput
            entries={entries}
            count={count}
            active={(left ?? 0) > 0}
            notice={notice}
            onEnter={(text) => {
              const id = newGuessId();
              setSent((s) => [...s, { id, text }]);
              game.guess(id, five.index, text);
            }}
          />
          <section className="panel p-3">
            <FiveProgress players={state.players} counts={five.counts} meId={meId} />
          </section>
        </>
      )}
      {five.step === "review" && (
        <p className="panel p-4 text-center text-lg font-extrabold">
          ⏰ الوقت خلص! المضيف بيراجع الإجابات…
          <span className="mt-1 block text-gold">جبت {n(count)} من ٥</span>
        </p>
      )}
      {five.step === "results" && <FiveResults five={five} players={state.players} meId={meId} />}
      {five.step === "ready" && <p className="text-center font-bold text-muted">المضيف هيبدأ الجولة… استعد! 💪</p>}

      <button onClick={() => setShowBoard((b) => !b)} className="panel flex items-center justify-between px-4 py-3 font-bold">
        <span>🏆 ترتيبك: {n(myRank)} من {n(state.players.length)}</span>
        <span className="tabular-nums text-gold">
          {n(myScore)} نقطة {showBoard ? "▲" : "▼"}
        </span>
      </button>
      {(showBoard || five.step === "results") && <Scoreboard players={state.players} meId={meId} hostId={state.hostId} compact />}
    </main>
  );
}

function Final({ state, meId, update }: { state: PublicState; meId: string; update: ReturnType<typeof useProfile>[1] }) {
  const me = state.players.find((p) => p.id === meId);
  const rank = state.players.findIndex((p) => p.id === meId) + 1;
  const won = rank === 1 && (me?.score ?? 0) > 0;
  const key = `${state.room}:${state.version}`;
  const recorded = useRef(false);
  useEffect(() => {
    void fireConfetti(won);
    if (me && !recorded.current) {
      recorded.current = true;
      recordGame(update, key, me.score, won);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per finished game
  }, []);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-8 text-center">
      <motion.h1 initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="display neon-text text-5xl">
        {won ? "انت الكسبان! 🏆" : `ترتيبك ${n(rank)}`}
      </motion.h1>
      <Podium players={state.players} meId={meId} />
      <p className="text-muted">لو المضيف داس &quot;العب تاني&quot; هتدخل الجولة الجديدة لوحدك.</p>
      <Link href="/" className="btn btn-ghost">
        الرئيسية
      </Link>
    </main>
  );
}
