"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useState } from "react";
import { initials, n } from "@/lib/format";
import type { PublicClue } from "@/lib/game/types";

const ROLE_LABEL = ["", "", "", "دور أكبر", "بطولة", "بطولة"];

export function ActorCard({ clue, index }: { clue: PublicClue; index: number }) {
  const shown = clue !== "hidden";
  const isLead = index >= 4;
  const [broken, setBroken] = useState(false);

  return (
    <div className="flip aspect-[4/5] w-full">
      <motion.div
        className="flip-inner"
        initial={false}
        animate={{ rotateY: shown ? 180 : 0, scale: shown ? 1 : 0.97 }}
        transition={{ type: "spring", stiffness: 140, damping: 16, delay: shown ? (index % 3) * 0.12 : 0 }}
      >
        {/* Back: film-reel ticket with the clue number */}
        <div className="flip-face card-back flex flex-col items-center justify-center gap-1">
          <span className="display text-4xl text-muted/80 sm:text-5xl">{n(index + 1)}</span>
          {isLead && <span className="text-xs font-bold text-gold/80">⭐ بطولة</span>}
        </div>

        {/* Front: photo (or initials) + name */}
        <div className={`flip-face flip-front bg-surface-2 ${isLead && shown ? "lead-glow" : ""}`}>
          {shown && clue === null && (
            <div className="flex h-full items-center justify-center p-2 text-center text-sm text-muted">لا يوجد</div>
          )}
          {shown && clue && (
            <>
              {clue.photo && !broken ? (
                <Image
                  src={clue.photo}
                  alt={clue.nameAr}
                  fill
                  loading="eager"
                  sizes="(max-width: 640px) 33vw, 180px"
                  className="object-cover"
                  onError={() => setBroken(true)}
                />
              ) : (
                <div
                  className="flex h-full items-start justify-center pt-[22%] display text-4xl text-ink/90 sm:text-5xl"
                  style={{
                    background: `linear-gradient(150deg, hsl(${(index * 57 + 300) % 360} 70% 45%), hsl(${(index * 57 + 350) % 360} 75% 30%))`,
                  }}
                >
                  {initials(clue.nameAr)}
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-1.5 pb-1.5 pt-6 text-center">
                <p className="text-[0.8rem] font-extrabold leading-tight sm:text-base">{clue.nameAr}</p>
              </div>
              {ROLE_LABEL[index] && (
                <span
                  className={`absolute top-1.5 start-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-black ${
                    isLead ? "bg-gold text-black" : "bg-teal text-black"
                  }`}
                >
                  {ROLE_LABEL[index]}
                </span>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
}
