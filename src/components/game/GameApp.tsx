import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BoardView } from "@/components/game/BoardView";
import { Hud } from "@/components/game/Hud";
import { Overlays } from "@/components/game/Overlays";
import { TitleScreen } from "@/components/game/TitleScreen";
import { difficultyLabel, elapsedMs, formatTime, pauseBoard, resumeBoard } from "@/game/engine";
import { resumeAudio, unlockAudio } from "@/game/audio";
import { savedBoard, useGame } from "@/game/store";

export function GameApp() {
  const screen = useGame((s) => s.screen);
  const board = useGame((s) => s.board);
  const stats = useGame((s) => s.stats);
  const overlay = useGame((s) => s.overlay);
  const flagMode = useGame((s) => s.flagMode);
  const hydrated = useGame((s) => s.hydrated);
  const hydrate = useGame((s) => s.hydrate);
  const persist = useGame((s) => s.persist);
  const start = useGame((s) => s.start);
  const continueSaved = useGame((s) => s.continueSaved);
  const setOverlay = useGame((s) => s.setOverlay);
  const setFlagMode = useGame((s) => s.setFlagMode);
  const [save, setSave] = useState<ReturnType<typeof savedBoard>>(null);
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    hydrate();
    setSave(savedBoard());
    const w = window as unknown as { __veil?: typeof useGame };
    w.__veil = useGame;
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => setCoarse(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    const onVis = () => {
      const st = useGame.getState();
      if (document.visibilityState === "hidden") {
        if (st.board && st.screen === "play") {
          useGame.setState({ board: pauseBoard(st.board, performance.now()) });
        }
        useGame.getState().persist();
      } else {
        const cur = useGame.getState();
        if (cur.board && cur.screen === "play" && !cur.overlay) {
          useGame.setState({ board: resumeBoard(cur.board, performance.now()) });
        }
        resumeAudio();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      mq.removeEventListener("change", apply);
      document.removeEventListener("visibilitychange", onVis);
      delete w.__veil;
    };
  }, [hydrate, persist]);

  useEffect(() => {
    if (screen === "title") setSave(savedBoard());
  }, [screen, overlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (overlay) {
          setOverlay(null);
          return;
        }
        if (screen === "play") setOverlay("confirm-menu");
      }
      if (e.code === "KeyR" && screen === "play" && !overlay) {
        setOverlay("confirm-restart");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlay, screen, setOverlay]);

  const saveLabel = save
    ? `${difficultyLabel(save.difficulty, save.cols, save.rows)} · ${formatTime(elapsedMs(save, save.endMs ?? performance.now()))}`
    : null;

  if (screen === "title") {
    return (
      <>
        <div className="relative min-h-dvh">
          <TitleScreen
            stats={stats}
            hasSave={hydrated && !!save}
            saveLabel={saveLabel}
            onStart={start}
            onContinue={continueSaved}
            onOpen={(id) => setOverlay(id)}
          />
          <Overlays />
        </div>
      </>
    );
  }

  if (!board) return null;

  const requestRestart = () => {
    if (board.status === "playing" && board.revealedCount > 0) setOverlay("confirm-restart");
    else useGame.getState().restart();
  };

  return (
    <div className="relative isolate flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <div className="flex items-center gap-1 px-2 pt-[max(0.25rem,env(safe-area-inset-top))]">
        <Button
          data-testid="btn-back"
          variant="ghost"
          size="sm"
          onClick={() => setOverlay("confirm-menu")}
        >
          <ChevronLeft className="size-4" strokeWidth={1.75} />
          Menu
        </Button>
        <span className="flex-1 text-center text-xs uppercase tracking-[0.18em] text-subtle">
          {difficultyLabel(board.difficulty, board.cols, board.rows)}
        </span>
        <span className="w-[4.5rem]" />
      </div>
      <Hud
        board={board}
        flagMode={flagMode}
        coarse={coarse}
        onFlagMode={setFlagMode}
        onRestart={requestRestart}
        onSettings={() => setOverlay("settings")}
      />
      <BoardView />
      <p className="px-4 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] pt-1 text-center text-[11px] text-subtle">
        {coarse
          ? flagMode
            ? "Toque marca · segure para revelar"
            : "Toque revela · segure para bandeira"
          : "Direito marca · meio abre vizinhos · F bandeira"}
      </p>
      <Overlays />
    </div>
  );
}
