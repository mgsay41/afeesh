"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConnectionBadge, ProfileForm, TopBar } from "@/components/common";
import { GuessBox } from "@/components/game/guess-box";
import { AnswerReveal, AutoTimer, ClueBoard, HintChips, RoundHeader } from "@/components/game/round-view";
import { Podium, Scoreboard } from "@/components/game/scoreboard";
import { fireConfetti, n, newGuessId } from "@/lib/format";
import type { PublicState } from "@/lib/game/types";
import { usePlayerGame } from "@/lib/game/use-player-game";
import { recordCorrect, recordGame, useProfile, type Profile } from "@/lib/profile";

export function PlayClient({ room }: { room: string }) {
  const [profile, update] = useProfile();
  const [joined, setJoined] = useState(false);

  if (!profile) return <div className="min-h-dvh" />;
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
      {!state ? (
        <Center emoji="📡" title="بندوّر على المضيف…">
          {waitedLong && (
            <p className="text-muted">
              اتأكد إن الكود صح <b dir="ltr">{room}</b> وإن صفحة المضيف مفتوحة.
              {mode === "local" && " (وضع تجريبي: لازم تكون على نفس المتصفح)"}
            </p>
          )}
        </Center>
      ) : state.phase === "lobby" ? (
        <Lobby state={state} meId={me.id} />
      ) : state.phase === "round" ? (
        <PlayerRound key={state.round?.index} game={game} state={state} meId={me.id} update={update} />
      ) : (
        <Final state={state} meId={me.id} update={update} />
      )}
    </>
  );
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
