import { Flag, Settings } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MaskFace } from "@/components/game/MaskFace";
import { elapsedMs, formatTime, remainingMines } from "@/game/engine";
import type { Board } from "@/game/types";
import { cn } from "@/lib/utils";

interface Props {
  board: Board;
  flagMode: boolean;
  coarse: boolean;
  onFlagMode: (v: boolean) => void;
  onRestart: () => void;
  onSettings: () => void;
}

export function Hud({ board, flagMode, coarse, onFlagMode, onRestart, onSettings }: Props) {
  const timeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (timeRef.current) {
        timeRef.current.textContent = formatTime(elapsedMs(board, performance.now()));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [board]);

  const mines = remainingMines(board);
  const mood = board.status === "won" ? "win" : board.status === "lost" ? "lose" : "play";

  return (
    <header className="relative z-10 grid shrink-0 grid-cols-3 items-center gap-2 px-3 pt-1 pb-2">
      <div className="hud-panel justify-self-start">
        <span className="digital text-lg text-fg">{mines}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-subtle">minas</span>
      </div>

      <div className="flex items-center justify-center">
        <Button
          data-testid="btn-restart"
          variant="secondary"
          size="icon"
          aria-label="Reiniciar"
          onClick={onRestart}
          className={cn(
            "size-12 rounded-xl",
            board.status === "won" && "border-success/40",
            board.status === "lost" && "border-danger/40",
          )}
        >
          <MaskFace mood={mood} size={34} />
        </Button>
      </div>

      <div className="flex items-center justify-end gap-1">
        <div className="hud-panel items-end">
          <span ref={timeRef} className="digital text-lg text-fg">
            0:00.0
          </span>
          <span className="text-[10px] uppercase tracking-[0.14em] text-subtle">tempo</span>
        </div>
        {coarse ? (
          <Button
            data-testid="btn-flag-mode"
            variant={flagMode ? "primary" : "secondary"}
            size="icon"
            aria-label="Modo bandeira"
            aria-pressed={flagMode}
            onClick={() => onFlagMode(!flagMode)}
          >
            <Flag className="size-4" strokeWidth={1.75} />
          </Button>
        ) : null}
        <Button data-testid="btn-menu" variant="ghost" size="icon" aria-label="Ajustes" onClick={onSettings}>
          <Settings className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
    </header>
  );
}
