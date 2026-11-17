"use client";

import { useState } from "react";
import { n } from "@/lib/format";
import { TEAM_ICONS, TEAM_TINT } from "@/lib/game/teams";
import type { PublicPlayer } from "@/lib/game/types";

const members = (players: PublicPlayer[], team: number) => players.filter((p) => p.team === team);

/** Player's lobby: tap a team to join it. */
export function TeamPicker({
  players,
  teams,
  meId,
  hostId,
  onPick,
}: {
  players: PublicPlayer[];
  teams: string[];
  meId: string;
  hostId: string;
  onPick: (team: number) => void;
}) {
  const mine = players.find((p) => p.id === meId)?.team;
  const waiting = players.filter((p) => p.team === undefined);
  return (
    <section className="space-y-3">
      <h2 className="display text-2xl">اختار فريقك</h2>
      <div className="grid grid-cols-2 gap-3">
        {teams.map((name, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onPick(i)}
            aria-pressed={mine === i}
            className={`rounded-2xl p-3 text-start transition ${TEAM_TINT[i].bg} ${mine === i ? `ring-4 ${TEAM_TINT[i].ring}` : "ring-1 ring-line"}`}
          >
            <span className="text-3xl">{TEAM_ICONS[i]}</span>
            <span className="display block text-xl leading-tight">{name}</span>
            <span className={`text-sm font-bold ${TEAM_TINT[i].text}`}>{mine === i ? "انت هنا ✓" : `${n(members(players, i).length)} لاعب`}</span>
            <ul className="mt-2 space-y-0.5 text-sm">
              {members(players, i).map((p) => (
                <li key={p.id} className={`truncate ${p.id === meId ? "font-black" : ""}`}>
                  {p.avatar} {p.name}
                  {p.id === hostId && <span className="text-xs text-muted"> (المضيف)</span>}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      {waiting.length > 0 && <p className="text-center text-sm text-muted">لسه ماختارش: {waiting.map((p) => p.name).join("، ")}</p>}
    </section>
  );
}

/** Host's lobby: name the two teams, see who is where, move people, or split everyone at random. */
export function TeamBoard({
  players,
  teams,
  meId,
  hostId,
  onMove,
  onRename,
  onShuffle,
  onKick,
}: {
  players: PublicPlayer[];
  teams: string[];
  meId: string;
  hostId: string;
  onMove: (playerId: string, team: number) => void;
  onRename: (team: number, name: string) => void;
  onShuffle: () => void;
  onKick: (playerId: string) => void;
}) {
  const waiting = players.filter((p) => p.team === undefined);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((name, i) => (
          <div key={i} className={`rounded-2xl p-3 ring-1 ring-line ${TEAM_TINT[i].bg}`}>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{TEAM_ICONS[i]}</span>
              <TeamName name={name} onCommit={(v) => onRename(i, v)} />
              <span className={`text-sm font-black ${TEAM_TINT[i].text}`}>{n(members(players, i).length)}</span>
            </div>
            <ul className="mt-2 space-y-1">
              {members(players, i).map((p) => (
                <li key={p.id} className={`flex items-center gap-2 rounded-xl bg-surface-2/70 px-2.5 py-1 text-sm ${p.id === meId ? "ring-1 ring-magenta/60" : ""}`}>
                  <span className="text-lg">{p.avatar}</span>
                  <span className="min-w-0 flex-1 truncate font-bold">
                    {p.name}
                    {p.id === hostId && <span className="ms-1 text-xs text-muted">(المضيف)</span>}
                  </span>
                  <button onClick={() => onMove(p.id, 1 - i)} className="rounded-lg px-1.5 text-muted hover:text-ink" title="انقله للفريق التاني" aria-label={`انقل ${p.name} للفريق التاني`}>
                    ⇄
                  </button>
                  {p.id !== hostId && (
                    <button onClick={() => onKick(p.id)} className="rounded-lg px-1.5 text-muted hover:text-danger" aria-label={`إخراج ${p.name}`} title="إخراج">
                      ✕
                    </button>
                  )}
                </li>
              ))}
              {members(players, i).length === 0 && <li className="text-sm text-muted">لسه فاضي</li>}
            </ul>
          </div>
        ))}
      </div>
      {waiting.length > 0 && (
        <div className="rounded-2xl bg-surface-2/60 p-3">
          <p className="mb-1.5 text-sm font-bold text-muted">لسه ماختاروش فريق (هيتوزعوا لوحدهم لو سيبتهم)</p>
          <ul className="space-y-1">
            {waiting.map((p) => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="text-lg">{p.avatar}</span>
                <span className="min-w-0 flex-1 truncate font-bold">{p.name}</span>
                {teams.map((t, i) => (
                  <button key={i} onClick={() => onMove(p.id, i)} className={`rounded-lg px-2 py-0.5 text-xs font-black ${TEAM_TINT[i].bg} ${TEAM_TINT[i].text}`}>
                    {TEAM_ICONS[i]} {t}
                  </button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={onShuffle} className="btn btn-ghost w-full text-sm">
        🎲 وزّع الكل عشوائي
      </button>
    </div>
  );
}

/** Edits a team's name; commits on blur or Enter. */
function TeamName({ name, onCommit }: { name: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };
  return (
    <input
      value={draft ?? name}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      maxLength={16}
      aria-label="اسم الفريق"
      className="display min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xl outline-none focus:bg-surface-2/70"
    />
  );
}

/** Team totals, e.g. under the title of a turn or on the final screen. */
export function TeamScores({ teams, scores, acting, big }: { teams: string[]; scores: number[]; acting?: number; big?: boolean }) {
  const lead = scores[0] === scores[1] ? -1 : scores[0] > scores[1] ? 0 : 1;
  return (
    <div className="grid grid-cols-2 gap-2">
      {teams.map((name, i) => (
        <div key={i} className={`rounded-2xl px-3 py-2 text-center ${TEAM_TINT[i].bg} ${acting === i || (big && lead === i) ? `ring-2 ${TEAM_TINT[i].ring}` : "ring-1 ring-line"}`}>
          <p className={`truncate font-bold ${TEAM_TINT[i].text}`}>
            {TEAM_ICONS[i]} {name} {acting === i && "🎭"}
            {big && lead === i && " 👑"}
          </p>
          <p className={`display tabular-nums ${big ? "text-5xl" : "text-3xl"}`}>{n(scores[i] ?? 0)}</p>
        </div>
      ))}
    </div>
  );
}
