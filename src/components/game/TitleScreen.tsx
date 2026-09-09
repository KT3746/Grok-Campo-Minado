import { Flag, BarChart3, Settings, HelpCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MaskFace } from "@/components/game/MaskFace";
import { dailyKey, formatTime } from "@/game/engine";
import { PRESETS, type DifficultyId, type Stats } from "@/game/types";
import { cn } from "@/lib/utils";

interface Props {
  stats: Stats;
  hasSave: boolean;
  saveLabel: string | null;
  onStart: (id: DifficultyId) => void;
  onContinue: () => void;
  onOpen: (id: "settings" | "stats" | "howto" | "custom") => void;
}

function DiffCard({
  title,
  meta,
  best,
  onClick,
  testId,
  featured,
}: {
  title: string;
  meta: string;
  best: string | null;
  onClick: () => void;
  testId: string;
  featured?: boolean;
}) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={cn(
        "group flex flex-col items-start gap-1 rounded-2xl border p-4 text-left transition-[transform,border-color,background-color] duration-200 ease-out active:scale-[0.96]",
        featured
          ? "border-accent/35 bg-elevated/80 hover:border-accent/60"
          : "border-border bg-surface hover:border-accent/35 hover:bg-elevated",
      )}
    >
      <span className="font-display text-lg font-semibold tracking-tight text-fg">{title}</span>
      <span className="text-sm text-muted">{meta}</span>
      <span className="mt-2 digital text-xs text-subtle">{best ? `melhor ${best}` : "sem recorde"}</span>
    </button>
  );
}

export function TitleScreen({ stats, hasSave, saveLabel, onStart, onContinue, onOpen }: Props) {
  const daily = stats.daily;
  const dailyDone = stats.lastDaily === dailyKey() && stats.daily.won > 0;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-fg">
      <img
        src="/atmosphere.jpg"
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/35 via-bg/78 to-bg" />
      <div className="veil-spot" />

      <div className="relative mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-10 stagger-in">
        <div className="mb-8 flex flex-col items-center gap-4 text-center">
          <MaskFace mood="idle" size={88} />
          <div>
            <h1 className="font-display text-6xl font-semibold tracking-[-0.04em] text-fg sm:text-7xl">VEIL</h1>
            <p className="mt-2 text-sm uppercase tracking-[0.28em] text-muted">Campo minado</p>
          </div>
          <p className="max-w-[22rem] text-sm leading-relaxed text-muted">
            Sorrisos no palco. Minas no chão.
          </p>
        </div>

        {hasSave ? (
          <button
            data-testid="btn-continue"
            onClick={onContinue}
            className="mb-4 flex h-12 items-center justify-between rounded-xl border border-accent/30 bg-elevated px-4 text-left transition-colors hover:border-accent/50"
          >
            <span className="flex items-center gap-2 text-sm text-fg">
              <Play className="size-4" strokeWidth={1.75} />
              Continuar
            </span>
            <span className="digital text-xs text-muted">{saveLabel}</span>
          </button>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <DiffCard
            testId="btn-easy"
            title={PRESETS.easy.label}
            meta="9 × 9 · 10 minas"
            best={stats.easy.bestMs != null ? formatTime(stats.easy.bestMs) : null}
            onClick={() => onStart("easy")}
          />
          <DiffCard
            testId="btn-medium"
            title={PRESETS.medium.label}
            meta="16 × 16 · 40 minas"
            best={stats.medium.bestMs != null ? formatTime(stats.medium.bestMs) : null}
            onClick={() => onStart("medium")}
          />
          <DiffCard
            testId="btn-expert"
            title={PRESETS.expert.label}
            meta="30 × 16 · 99 minas"
            best={stats.expert.bestMs != null ? formatTime(stats.expert.bestMs) : null}
            onClick={() => onStart("expert")}
          />
          <DiffCard
            testId="btn-daily"
            title="Diário"
            meta={dailyDone ? "já foi hoje" : "16 × 16 · um tabuleiro"}
            best={daily.bestMs != null ? formatTime(daily.bestMs) : null}
            onClick={() => onStart("daily")}
            featured
          />
        </div>

        <Button
          data-testid="btn-custom"
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => onOpen("custom")}
        >
          Personalizado
        </Button>

        <div className="mt-8 flex items-center justify-center gap-1">
          <Button data-testid="btn-howto" variant="ghost" size="sm" onClick={() => onOpen("howto")}>
            <HelpCircle className="size-4" strokeWidth={1.75} />
            Como jogar
          </Button>
          <Button data-testid="btn-stats" variant="ghost" size="sm" onClick={() => onOpen("stats")}>
            <BarChart3 className="size-4" strokeWidth={1.75} />
            Estatísticas
          </Button>
          <Button data-testid="btn-settings" variant="ghost" size="sm" onClick={() => onOpen("settings")}>
            <Settings className="size-4" strokeWidth={1.75} />
            Ajustes
          </Button>
        </div>
      </div>

      <p className="relative px-5 pb-[max(4.5rem,calc(env(safe-area-inset-bottom)+3.5rem))] text-center text-[11px] tracking-wide text-subtle">
        <Flag className="mr-1 inline size-3 opacity-70" strokeWidth={1.75} />
        Primeiro toque é cortesia da casa
      </p>
    </div>
  );
}
