"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useState } from "react";
import { Logo, ProfileForm } from "@/components/common";
import { n } from "@/lib/format";
import { createGame } from "@/lib/game/engine";
import { isRoomCode, newRoomCode, saveHostGame } from "@/lib/game/room";
import type { Settings } from "@/lib/game/types";
import { useProfile } from "@/lib/profile";

function Toggle<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { v: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={String(o.v)} type="button" className="chip-toggle" aria-pressed={o.v === value} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const fadeUp = (delay: number) => ({
  initial: { y: 24, opacity: 0 },
  animate: { y: 0, opacity: 1 },
  transition: { delay, type: "spring" as const, stiffness: 180, damping: 20 },
});

export function HomeClient() {
  const router = useRouter();
  const [profile, update] = useProfile();
  const [editing, setEditing] = useState(false);
  const [code, setCode] = useState("");
  const [settings, setSettings] = useState<Settings>({ rounds: 10, pool: "all", difficulty: "any", autoRevealSec: 30 });
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  function host() {
    if (!profile) return;
    const room = newRoomCode();
    saveHostGame(createGame(room, { id: profile.id, name: profile.name, avatar: profile.avatar }, settings, Date.now()));
    router.push(`/host/${room}`);
  }

  const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, "");

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col items-center gap-8 px-4 pb-16 pt-10 sm:pt-16">
      <Logo />

      {profile === null ? (
        <div className="h-64" />
      ) : !profile.name || editing ? (
        <motion.section {...fadeUp(0.2)} className="panel w-full max-w-md p-5">
          <h2 className="display mb-4 text-2xl">{profile.name ? "عدّل بياناتك" : "أهلاً! عرّفنا بنفسك"}</h2>
          <ProfileForm
            name={profile.name}
            avatar={profile.avatar}
            cta={profile.name ? "حفظ" : "يلا بينا 🍿"}
            onSubmit={(name, avatar) => {
              update((p) => ({ ...p, name, avatar }));
              setEditing(false);
            }}
          />
        </motion.section>
      ) : (
        <>
          <motion.button
            {...fadeUp(0.15)}
            onClick={() => setEditing(true)}
            className="flex items-center gap-2 rounded-full bg-surface/80 py-1.5 pe-4 ps-1.5 font-bold ring-1 ring-line hover:ring-magenta"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-2xl">{profile.avatar}</span>
            {profile.name}
            <span className="text-sm text-muted">✏️</span>
          </motion.button>

          <div className="grid w-full gap-5 md:grid-cols-[1.3fr_1fr]">
            <motion.section {...fadeUp(0.25)} className="panel space-y-5 p-5 sm:p-6">
              <div>
                <h2 className="display text-3xl">🎥 ابدأ لعبة جديدة</h2>
                <p className="text-muted">انت المضيف وبتلعب كمان. ابعت الكود لصحابك.</p>
              </div>
              <div className="space-y-3">
                <p className="font-bold">عدد الجولات</p>
                <Toggle value={settings.rounds} onChange={(v) => set("rounds", v)} options={[5, 10, 15].map((v) => ({ v, label: n(v) }))} />
                <p className="font-bold">نوع العناوين</p>
                <Toggle
                  value={settings.pool}
                  onChange={(v) => set("pool", v)}
                  options={[
                    { v: "all", label: "🎬 الكل" },
                    { v: "movie", label: "🎞️ أفلام" },
                    { v: "series", label: "📺 مسلسلات" },
                  ]}
                />
                <p className="font-bold">الصعوبة</p>
                <Toggle
                  value={settings.difficulty}
                  onChange={(v) => set("difficulty", v)}
                  options={[
                    { v: "any", label: "خليط" },
                    { v: "easy", label: "سهل" },
                    { v: "medium", label: "متوسط" },
                    { v: "hard", label: "صعب" },
                  ]}
                />
                <p className="font-bold">كشف تلقائي للممثلين</p>
                <Toggle
                  value={settings.autoRevealSec}
                  onChange={(v) => set("autoRevealSec", v)}
                  options={[
                    { v: 0, label: "يدوي" },
                    { v: 20, label: `كل ${n(20)} ث` },
                    { v: 30, label: `كل ${n(30)} ث` },
                    { v: 45, label: `كل ${n(45)} ث` },
                  ]}
                />
              </div>
              <button onClick={host} className="btn btn-primary btn-lg w-full">
                ابدأ اللعبة 🚀
              </button>
            </motion.section>

            <div className="flex flex-col gap-5">
              <motion.section {...fadeUp(0.35)} className="panel space-y-4 p-5 sm:p-6">
                <h2 className="display text-3xl">🎟️ ادخل لعبة</h2>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (isRoomCode(cleanCode)) router.push(`/play/${cleanCode}`);
                  }}
                >
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="الكود"
                    className="field flex-1 text-center text-2xl uppercase tracking-[0.3em]"
                    dir="ltr"
                    maxLength={5}
                    autoCapitalize="characters"
                    autoComplete="off"
                    aria-label="كود اللعبة"
                  />
                  <button className="btn btn-teal" disabled={!isRoomCode(cleanCode)}>
                    دخول
                  </button>
                </form>
                <p className="text-sm text-muted">أو امسح الـ QR من شاشة المضيف.</p>
              </motion.section>

              {profile.stats.games > 0 && (
                <motion.section {...fadeUp(0.45)} className="panel grid grid-cols-4 gap-2 p-4 text-center">
                  {[
                    ["🎮", profile.stats.games, "لعبة"],
                    ["🏆", profile.stats.wins, "فوز"],
                    ["⭐", profile.stats.best, "أعلى نتيجة"],
                    ["✅", profile.stats.correct, "إجابة صح"],
                  ].map(([icon, value, label]) => (
                    <div key={label as string}>
                      <div className="text-xl">{icon}</div>
                      <div className="text-xl font-black">{n(value as number)}</div>
                      <div className="text-xs text-muted">{label}</div>
                    </div>
                  ))}
                </motion.section>
              )}
            </div>
          </div>
        </>
      )}

      <motion.section {...fadeUp(0.55)} className="grid w-full gap-3 sm:grid-cols-3">
        {[
          ["١", "٣ ممثلين مساعدين", "أصعب مرحلة — ١٠٠ نقطة"],
          ["٢", "ممثل بدور أكبر", "بتقرب — ٧٠ نقطة"],
          ["٣", "الأبطال", "أكيد عرفتها — ٤٠ نقطة"],
        ].map(([num, title, sub]) => (
          <div key={num} className="panel flex items-center gap-3 p-4">
            <span className="display flex size-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-magenta to-orange text-2xl">
              {num}
            </span>
            <div>
              <p className="font-extrabold">{title}</p>
              <p className="text-sm text-muted">{sub}</p>
            </div>
          </div>
        ))}
      </motion.section>
      <p className="text-center text-sm text-muted">
        كل تلميح بيخصم ١٠ نقط · أول واحد يعرف ياخد +٢٠ ·{" "}
        <Link href="/about" className="underline hover:text-ink">
          عن اللعبة
        </Link>
      </p>
    </main>
  );
}
