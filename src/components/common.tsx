"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { AVATARS } from "@/lib/profile";
import type { ConnectionStatus, Mode } from "@/lib/realtime";

export function Logo({ size = "lg" }: { size?: "sm" | "lg" }) {
  if (size === "sm") {
    return (
      <Link href="/" className="display neon-text text-3xl" aria-label="أفيش — الرئيسية">
        أفيش
      </Link>
    );
  }
  return (
    <div className="relative text-center">
      <motion.h1
        initial={{ scale: 0.4, opacity: 0, rotate: -6 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 12 }}
        className="display neon-text flicker text-8xl sm:text-9xl"
      >
        أفيش
      </motion.h1>
      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="mt-1 text-lg font-bold text-muted"
      >
        من الممثلين… اعرف الفيلم 🎬
      </motion.p>
    </div>
  );
}

export function ProfileForm({
  name: initialName,
  avatar: initialAvatar,
  cta,
  onSubmit,
}: {
  name: string;
  avatar: string;
  cta: string;
  onSubmit: (name: string, avatar: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim(), avatar);
      }}
    >
      <label className="block space-y-1.5">
        <span className="font-bold">اسمك</span>
        <input
          className="field"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="اكتب اسمك…"
          maxLength={20}
          autoFocus={!initialName}
          autoComplete="nickname"
        />
      </label>
      <fieldset>
        <legend className="mb-1.5 font-bold">اختار شكلك</legend>
        <div className="grid grid-cols-8 gap-1.5">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAvatar(a)}
              aria-pressed={a === avatar}
              aria-label={a}
              className={`aspect-square rounded-xl text-2xl transition ${
                a === avatar ? "scale-110 bg-magenta/30 ring-2 ring-magenta" : "bg-bg hover:bg-surface-2"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </fieldset>
      <button className="btn btn-primary btn-lg w-full" disabled={!name.trim()}>
        {cta}
      </button>
    </form>
  );
}

export function QrShare({ room }: { room: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- origin is only known in the browser
    setUrl(`${window.location.origin}/play/${room}`);
  }, [room]);

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "أفيش", text: "تعالى نلعب أفيش! 🎬", url });
        return;
      } catch {
        /* cancelled → fall back to copy */
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <div className="rounded-3xl bg-white p-3 shadow-[0_0_50px_-10px_var(--magenta)]">
        {url ? <QRCodeSVG value={url} size={190} bgColor="#ffffff" fgColor="#120a24" level="M" /> : <div className="size-[190px]" />}
      </div>
      <div>
        <p className="text-sm font-bold text-muted">كود اللعبة</p>
        <p className="display text-5xl tracking-[0.2em]" dir="ltr">
          {room}
        </p>
      </div>
      <button onClick={share} className="btn btn-ghost w-full">
        {copied ? "✓ اتنسخ اللينك" : "🔗 ابعت اللينك"}
      </button>
    </div>
  );
}

export function ConnectionBadge({ status, mode }: { status: ConnectionStatus; mode: Mode | null }) {
  if (mode === "local") {
    return (
      <span
        className="rounded-full bg-orange/20 px-2.5 py-1 text-xs font-bold text-orange"
        title="مفيش مفتاح Ably — اللعب شغال بين تابات نفس المتصفح بس"
      >
        وضع تجريبي
      </span>
    );
  }
  const map = {
    online: ["bg-success", "متصل"],
    connecting: ["bg-orange animate-pulse", "بيتصل…"],
    offline: ["bg-danger animate-pulse", "مفصول"],
  } as const;
  const [dot, label] = map[status];
  return (
    <span className="flex items-center gap-1.5 text-xs font-bold text-muted">
      <span className={`size-2 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export function TopBar({ children }: { children?: React.ReactNode }) {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-4">
      <Logo size="sm" />
      <div className="flex items-center gap-3">{children}</div>
    </header>
  );
}

/** Keeps the host screen awake during a game (where supported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = () =>
      navigator.wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => {});
    void request();
    const onVis = () => document.visibilityState === "visible" && request();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release();
    };
  }, [active]);
}
