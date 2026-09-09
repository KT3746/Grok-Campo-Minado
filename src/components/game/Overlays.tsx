import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { dailyKey, formatTime } from "@/game/engine";
import { useGame } from "@/game/store";
import type { DiffStats, OverlayId } from "@/game/types";
import { cn } from "@/lib/utils";

function Shell({
  children,
  onClose,
  title,
  wide,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center sm:items-center [transform:translateZ(0)]">
      <button className="absolute inset-0 bg-bg/70" aria-label="Fechar" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="overlay-title"
        className={cn(
          "modal-in relative z-10 m-3 w-full border border-border bg-surface p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]",
          wide ? "max-w-lg rounded-3xl" : "max-w-md rounded-3xl",
        )}
      >
        <h2 id="overlay-title" className="font-display text-xl font-semibold tracking-tight">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="digital text-sm text-fg">{value}</span>
    </div>
  );
}

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-4 py-2.5"
    >
      <span className="text-sm text-fg">{label}</span>
      <span
        className={cn(
          "relative h-7 w-12 rounded-full transition-colors duration-200",
          on ? "bg-accent" : "bg-elevated",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-6 rounded-full bg-fg transition-transform duration-200",
            on ? "translate-x-5 bg-accent-fg" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

function SettingsBody() {
  const settings = useGame((s) => s.settings);
  const patch = useGame((s) => s.patchSettings);
  return (
    <div>
      <Switch label="Som" on={settings.sound} onChange={(v) => patch({ sound: v })} />
      <div className="flex items-center gap-3 py-2">
        <span className="w-16 text-sm text-muted">Volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={settings.volume}
          onChange={(e) => patch({ volume: Number(e.target.value) })}
          className="h-1.5 flex-1 accent-accent"
        />
      </div>
      <Switch label="Vibração" on={settings.haptics} onChange={(v) => patch({ haptics: v })} />
      <Switch
        label="Marca de interrogação"
        on={settings.questions}
        onChange={(v) => patch({ questions: v })}
      />
      <Switch
        label="Toque longo para bandeira"
        on={settings.longPress}
        onChange={(v) => patch({ longPress: v })}
      />
      <Switch
        label="Reduzir movimento"
        on={settings.reducedMotion}
        onChange={(v) => patch({ reducedMotion: v })}
      />
    </div>
  );
}

function statLine(d: DiffStats) {
  const rate = d.played ? Math.round((d.won / d.played) * 100) : 0;
  return {
    played: String(d.played),
    won: String(d.won),
    rate: d.played ? `${rate}%` : "—",
    best: d.bestMs != null ? formatTime(d.bestMs) : "—",
    streak: String(d.streak),
  };
}

function StatsBody() {
  const stats = useGame((s) => s.stats);
  const [tab, setTab] = useState<"easy" | "medium" | "expert" | "daily">("easy");
  const d = statLine(stats[tab]);
  const tabs = [
    ["easy", "Fácil"],
    ["medium", "Médio"],
    ["expert", "Expert"],
    ["daily", "Diário"],
  ] as const;
  return (
    <div>
      <div className="mb-3 flex gap-1 rounded-xl bg-bg p-1">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "h-9 flex-1 rounded-lg text-sm transition-colors",
              tab === id ? "bg-elevated text-fg" : "text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Row label="Partidas" value={d.played} />
      <Row label="Vitórias" value={d.won} />
      <Row label="Taxa" value={d.rate} />
      <Row label="Melhor tempo" value={d.best} />
      <Row label="Sequência" value={d.streak} />
      {tab === "daily" ? (
        <p className="mt-3 text-xs text-subtle">
          {stats.lastDaily === dailyKey() ? "Desafio de hoje já jogado." : "O tabuleiro muda à meia-noite local."}
        </p>
      ) : null}
    </div>
  );
}

function HowToBody() {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-muted">
      <p>Cada número mostra quantas minas existem nas oito casas vizinhas.</p>
      <p>Toque para revelar. Segure — ou clique com o direito — para marcar uma bandeira.</p>
      <p>O primeiro toque nunca cai em mina. Números zero abrem o campo em cascata.</p>
      <p>
        Em um número, toque de novo (ou clique do meio) para abrir os vizinhos, se as bandeiras
        estiverem certas.
      </p>
      <p className="text-subtle">Setas movem o cursor. Espaço revela. F marca. C abre vizinhos.</p>
    </div>
  );
}

function CustomBody() {
  const custom = useGame((s) => s.custom);
  const setCustom = useGame((s) => s.setCustom);
  const start = useGame((s) => s.start);
  const maxMines = custom.cols * custom.rows - 9;
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 flex justify-between text-sm text-muted">
          Largura <span className="digital text-fg">{custom.cols}</span>
        </span>
        <input
          type="range"
          min={5}
          max={30}
          value={custom.cols}
          onChange={(e) => setCustom({ cols: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 flex justify-between text-sm text-muted">
          Altura <span className="digital text-fg">{custom.rows}</span>
        </span>
        <input
          type="range"
          min={5}
          max={24}
          value={custom.rows}
          onChange={(e) => setCustom({ rows: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </label>
      <label className="block">
        <span className="mb-1 flex justify-between text-sm text-muted">
          Minas <span className="digital text-fg">{custom.mines}</span>
        </span>
        <input
          type="range"
          min={1}
          max={Math.max(1, maxMines)}
          value={custom.mines}
          onChange={(e) => setCustom({ mines: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </label>
      <Button variant="primary" className="w-full" onClick={() => start("custom")}>
        Jogar {custom.cols} × {custom.rows}
      </Button>
    </div>
  );
}

function ResultBody() {
  const last = useGame((s) => s.lastResult);
  const restart = useGame((s) => s.restart);
  const toTitle = useGame((s) => s.toTitle);
  if (!last) return null;
  return (
    <div>
      <p className="digital text-3xl text-fg">{formatTime(last.timeMs)}</p>
      {last.isBest ? <p className="mt-1 text-sm text-success">Novo recorde</p> : null}
      <div className="mt-5 flex gap-2">
        <Button data-testid="btn-again" variant="primary" className="flex-1" onClick={restart}>
          De novo
        </Button>
        <Button data-testid="btn-to-title" className="flex-1" onClick={toTitle}>
          Menu
        </Button>
      </div>
    </div>
  );
}

function Confirm({
  text,
  confirm,
  onYes,
  onNo,
}: {
  text: string;
  confirm: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-muted">{text}</p>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" className="flex-1" onClick={onYes}>
          {confirm}
        </Button>
        <Button className="flex-1" onClick={onNo}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

const TITLES: Record<Exclude<OverlayId, null>, string> = {
  settings: "Ajustes",
  stats: "Estatísticas",
  howto: "Como jogar",
  custom: "Personalizado",
  result: "",
  "confirm-restart": "Reiniciar",
  "confirm-menu": "Sair da partida",
};

export function Overlays() {
  const overlay = useGame((s) => s.overlay);
  const last = useGame((s) => s.lastResult);
  const setOverlay = useGame((s) => s.setOverlay);
  const restart = useGame((s) => s.restart);
  const toTitle = useGame((s) => s.toTitle);
  const board = useGame((s) => s.board);
  if (!overlay) return null;

  if (overlay === "result") {
    const won = last?.won;
    return (
      <Shell
        title={won ? "Campo limpo" : "Campo perdido"}
        onClose={() => setOverlay(null)}
      >
        <ResultBody />
      </Shell>
    );
  }

  if (overlay === "confirm-restart") {
    return (
      <Shell title="Reiniciar" onClose={() => setOverlay(null)}>
        <Confirm
          text="Começar um novo campo neste tamanho?"
          confirm="Reiniciar"
          onYes={restart}
          onNo={() => setOverlay(null)}
        />
      </Shell>
    );
  }

  if (overlay === "confirm-menu") {
    return (
      <Shell title="Sair da partida" onClose={() => setOverlay(null)}>
        <Confirm
          text={board?.status === "playing" ? "A partida em andamento fica salva neste aparelho." : "Voltar ao menu?"}
          confirm="Menu"
          onYes={toTitle}
          onNo={() => setOverlay(null)}
        />
      </Shell>
    );
  }

  return (
    <Shell title={TITLES[overlay]} onClose={() => setOverlay(null)} wide={overlay === "stats"}>
      {overlay === "settings" ? <SettingsBody /> : null}
      {overlay === "stats" ? <StatsBody /> : null}
      {overlay === "howto" ? <HowToBody /> : null}
      {overlay === "custom" ? <CustomBody /> : null}
      {overlay === "settings" || overlay === "howto" || overlay === "stats" ? (
        <Button className="mt-4 w-full" onClick={() => setOverlay(null)}>
          Fechar
        </Button>
      ) : null}
    </Shell>
  );
}
