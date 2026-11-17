"use client";

import { useState } from "react";
import { ChainScreen } from "@/components/game/chain-view";
import { CharadesScreen } from "@/components/game/charades-view";
import { QuizScreen } from "@/components/game/quiz-view";
import { Scoreboard } from "@/components/game/scoreboard";
import { n } from "@/lib/format";
import type { PublicState } from "@/lib/game/types";
import type { usePlayerGame } from "@/lib/game/use-player-game";

type Game = ReturnType<typeof usePlayerGame>;

/** "Your rank" bar that expands into the scoreboard. */
function RankBar({ state, meId, open }: { state: PublicState; meId: string; open?: boolean }) {
  const [show, setShow] = useState(false);
  const rank = state.players.findIndex((p) => p.id === meId) + 1;
  const score = state.players.find((p) => p.id === meId)?.score ?? 0;
  return (
    <>
      <button onClick={() => setShow((s) => !s)} className="panel flex items-center justify-between px-4 py-3 font-bold">
        <span>🏆 ترتيبك: {n(rank)} من {n(state.players.length)}</span>
        <span className="tabular-nums text-gold">
          {n(score)} نقطة {show ? "▲" : "▼"}
        </span>
      </button>
      {(show || open) && <Scoreboard players={state.players} meId={meId} hostId={state.hostId} compact showTeam={!!state.teams} />}
    </>
  );
}

const shell = "mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-4 pb-10";

export function PlayerQuiz({ game, state, meId }: { game: Game; state: PublicState; meId: string }) {
  const quiz = state.quiz!;
  return (
    <main className={shell}>
      <QuizScreen key={quiz.index} quiz={quiz} players={state.players} meId={meId} receivedAt={game.receivedAt} onPick={(c) => game.pick(quiz.index, c)} />
      <RankBar state={state} meId={meId} open={quiz.step === "reveal"} />
    </main>
  );
}

export function PlayerCharades({ game, state, meId }: { game: Game; state: PublicState; meId: string }) {
  const turn = state.charades!;
  const secret = turn.performerId === meId && game.secret?.turn === turn.index ? game.secret.text : null;
  return (
    <main className={shell}>
      <CharadesScreen
        key={turn.index}
        turn={turn}
        players={state.players}
        teams={state.teams ?? []}
        meId={meId}
        receivedAt={game.receivedAt}
        secret={secret}
        guess={(id, text) => game.guess(id, turn.index, text)}
        lastResult={game.lastResult}
        onClaim={() => game.act(turn.index, "claim")}
        onStart={() => game.act(turn.index, "start")}
        onSkip={() => game.act(turn.index, "skip")}
      />
      <RankBar state={state} meId={meId} open={turn.step === "done"} />
    </main>
  );
}

export function PlayerChain({ game, state, meId }: { game: Game; state: PublicState; meId: string }) {
  const chain = state.chain!;
  return (
    <main className={shell}>
      <ChainScreen
        chain={chain}
        players={state.players}
        meId={meId}
        receivedAt={game.receivedAt}
        guess={(id, text) => game.guess(id, chain.count, text)}
        lastResult={game.lastResult}
      />
      <RankBar state={state} meId={meId} open={chain.over} />
    </main>
  );
}
