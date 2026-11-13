const arNum = new Intl.NumberFormat("ar-EG");

/** Arabic-Indic digits for display. */
export const n = (x: number) => arNum.format(x);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => w !== "عبد" && w.length > 1)
    .slice(0, 2)
    .map((w) => (w.startsWith("ال") && w.length > 3 ? w[2] : w[0]))
    .join(" ");

export const newGuessId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function fireConfetti(big = false) {
  const confetti = (await import("canvas-confetti")).default;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#ff3d8b", "#ff9f1c", "#2ec4b6", "#ffd166", "#ffffff"];
  confetti({ particleCount: big ? 180 : 90, spread: big ? 110 : 75, origin: { y: 0.7 }, colors });
  if (big) {
    setTimeout(() => confetti({ particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.8 }, colors }), 300);
    setTimeout(() => confetti({ particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.8 }, colors }), 500);
  }
}
