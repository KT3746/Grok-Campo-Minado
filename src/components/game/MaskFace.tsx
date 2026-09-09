import { cn } from "@/lib/utils";

export type MaskMood = "idle" | "play" | "win" | "lose";

export function MaskFace({
  mood = "idle",
  size = 72,
  className,
}: {
  mood?: MaskMood;
  size?: number;
  className?: string;
}) {
  const smile =
    mood === "win" ? "M20 40 C28 50 36 50 44 40" : mood === "lose" ? "M22 44 C28 38 36 38 42 44" : "M22 40 C28 46 36 46 42 40";
  const browL =
    mood === "play" ? "M18 22 L28 20" : mood === "lose" ? "M18 24 L28 22" : "M18 23 L28 23";
  const browR =
    mood === "play" ? "M36 20 L46 24" : mood === "lose" ? "M36 22 L46 24" : "M36 23 L46 23";
  const eyeR = mood === "lose" ? "x" : "open";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("shrink-0", mood === "idle" && "mask-float", className)}
    >
      <ellipse cx="32" cy="33" rx="20" ry="24" fill="var(--color-elevated)" />
      <ellipse cx="32" cy="33" rx="20" ry="24" stroke="var(--color-accent)" strokeWidth="1.6" />
      <path d="M16 28 C20 14 44 14 48 28" stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.55" />
      <path d={browL} stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
      <path d={browR} stroke="var(--color-accent)" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="24" cy="30" rx="3.2" ry={mood === "win" ? 1.4 : 3.6} fill="var(--color-fg)" />
      {eyeR === "x" ? (
        <>
          <path d="M38 27 L46 33" stroke="var(--color-danger)" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M46 27 L38 33" stroke="var(--color-danger)" strokeWidth="1.8" strokeLinecap="round" />
        </>
      ) : (
        <ellipse cx="40" cy="30" rx="3.2" ry={mood === "win" ? 1.4 : 3.6} fill="var(--color-fg)" />
      )}
      <path d={smile} stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round" fill="none" />
      {mood === "win" ? (
        <circle cx="50" cy="16" r="1.4" fill="var(--color-accent)" />
      ) : null}
    </svg>
  );
}

export function resultQuip(won: boolean, timeMs: number): string {
  const win = ["Limpo. Sem uma ruga.", "Presença de palco.", "O campo que se vire."];
  const lose = ["A casa caiu.", "Essa não estava no roteiro.", "Cortina cedo demais."];
  const list = won ? win : lose;
  return list[Math.abs(Math.floor(timeMs)) % list.length]!;
}
