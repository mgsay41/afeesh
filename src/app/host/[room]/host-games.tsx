"use client";

import { useEffect, useMemo, useState } from "react";
import { ChainScreen } from "@/components/game/chain-view";
import { CharadesScreen } from "@/components/game/charades-view";
import { QuizScreen } from "@/components/game/quiz-view";
import { Scoreboard } from "@/components/game/scoreboard";
import { publicOf } from "@/lib/game/registry";
import type { GameState } from "@/lib/game/types";
import type { HostGame } from "@/lib/game/use-host-game";

/** The public view of the game, refreshed (with a fresh clock base) on every state change. */
function useHostView(state: GameState) {
  const [receivedAt, setReceivedAt] = useState(() => Date.now());
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh the timer base on each state change
    setReceivedAt(Date.now());
  }, [state.version]);
  const pub = useMemo(() => publicOf(state, receivedAt), [state, receivedAt]);
  return { pub, receivedAt };
}

function Layout({ main, controls, board }: { main: React.ReactNode; controls: React.ReactNode; board: React.ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[1fr_360px]">
      <section>{main}</section>
      <aside className="space-y-4">
        <section className="panel space-y-3 p-4">
          <h2 className="font-extrabold text-muted">🎛️ التحكم</h2>
          {controls}
        </section>
        <section className="panel p-4">
          <h2 className="mb-2 font-extrabold text-muted">🏆 الترتيب</h2>
          {board}
        </section>
      </aside>
    </main>
  );
}

export function HostQuiz({ game, state }: { game: HostGame; state: GameState }) {
  const { pub, receivedAt } = useHostView(state);
  const quiz = pub.quiz!;
  const isLast = quiz.index + 1 >= quiz.total;
  return (
    <Layout
      main={<QuizScreen key={quiz.index} quiz={quiz} players={pub.players} meId={state.hostId} receivedAt={receivedAt} onPick={game.quiz.pick} />}
      controls={
        quiz.step === "playing" ? (
          <button onClick={game.quiz.reveal} className="btn btn-ghost w-full">
            ⏹️ اكشف الإجابة دلوقتي
          </button>
        ) : (
          <button onClick={game.quiz.next} className="btn btn-primary btn-lg w-full">
            {isLast ? "🏆 النتيجة النهائية" : "السؤال التالي ⬅️"}
          </button>
        )
      }
      board={
        <Scoreboard players={pub.players} meId={state.hostId} hostId={state.hostId} correctIds={Object.keys(quiz.reveal?.points ?? {})} compact />
      }
    />
  );
}

export function HostCharades({ game, state }: { game: HostGame; state: GameState }) {
  const { pub, receivedAt } = useHostView(state);
  const turn = pub.charades!;
  const t = state.charades!.turn;
  const teams = pub.teams ?? [];
  const isLast = turn.index + 1 >= turn.total;
  const performer = pub.players.find((p) => p.id === turn.performerId);
  const actingTeam = pub.players.filter((p) => p.team === turn.team);
  return (
    <Layout
      main={
        <CharadesScreen
          key={turn.index}
          turn={turn}
          players={pub.players}
          teams={teams}
          meId={state.hostId}
          receivedAt={receivedAt}
          secret={t.performerId === state.hostId ? t.title.ar : null}
          guess={game.guess}
          lastResult={null}
          onClaim={game.charades.claim}
          onStart={game.charades.begin}
          onSkip={game.charades.skip}
        />
      }
      controls={
        <>
          {(turn.step === "pick" || turn.step === "ready") && (
            <div className="space-y-1.5">
              <p className="text-sm text-muted">
                {turn.step === "pick" ? "الفريق بيختار مين يمثّل. أو اختار انت:" : "غيّر اللي بيمثّل (لو موبايله مش بيعرض العنوان):"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {actingTeam.map((p) => (
                  <button key={p.id} onClick={() => game.charades.assign(p.id)} className="chip-toggle" aria-pressed={p.id === turn.performerId}>
                    {p.avatar} {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turn.step === "ready" && t.performerId !== state.hostId && (
            <button onClick={game.charades.begin} className="btn btn-ghost w-full">
              ▶️ ابدأ بدالُه {performer && `(${performer.name})`}
            </button>
          )}
          {turn.step !== "done" && (
            <button onClick={game.charades.end} className="btn btn-ghost w-full">
              ⏹️ خلّص الدور
            </button>
          )}
          {turn.step === "done" && (
            <button onClick={game.charades.next} className="btn btn-primary btn-lg w-full">
              {isLast ? "🏆 النتيجة النهائية" : "الدور التالي ⬅️"}
            </button>
          )}
        </>
      }
      board={<Scoreboard players={pub.players} meId={state.hostId} hostId={state.hostId} correctIds={turn.guessedIds} compact showTeam />}
    />
  );
}

export function HostChain({ game, state }: { game: HostGame; state: GameState }) {
  const { pub, receivedAt } = useHostView(state);
  const chain = pub.chain!;
  return (
    <Layout
      main={
        <ChainScreen
          chain={chain}
          players={pub.players}
          meId={state.hostId}
          receivedAt={receivedAt}
          guess={game.guess}
          lastResult={null}
          rejected={state.chain!.rejected}
          onAccept={game.chain.accept}
        />
      }
      controls={
        <button onClick={game.chain.end} className={`btn w-full ${chain.over ? "btn-primary btn-lg" : "btn-ghost"}`}>
          {chain.over ? "🏆 النتيجة النهائية" : "🏁 إنهاء اللعبة"}
        </button>
      }
      board={<Scoreboard players={pub.players} meId={state.hostId} hostId={state.hostId} compact />}
    />
  );
}
