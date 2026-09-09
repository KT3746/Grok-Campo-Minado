import { create } from "zustand";
import {
  chordCell,
  createBoard,
  dailyKey,
  dailySeed,
  elapsedMs,
  pauseBoard,
  resumeBoard,
  revealCell,
  toggleFlag,
} from "./engine";
import { loadSave, writeSave, type SaveBlob } from "./persist";
import {
  playBlocked,
  playBoom,
  playFlag,
  playFloodTick,
  playReveal,
  playUnflag,
  playWin,
  setAudioEnabled,
  setAudioVolume,
  unlockAudio,
} from "./audio";
import { DEFAULT_SETTINGS, EMPTY_DIFF, PRESETS, type Board, type DifficultyId, type OverlayId, type Outcome, type ScreenId, type Settings, type Stats } from "./types";

export interface JuiceEvent {
  id: number;
  kind: Outcome["kind"];
  revealed: number[];
  origin: number | null;
  at: number;
}

interface GameState {
  screen: ScreenId;
  overlay: OverlayId;
  board: Board | null;
  settings: Settings;
  stats: Stats;
  custom: { cols: number; rows: number; mines: number };
  flagMode: boolean;
  hydrated: boolean;
  lastResult: {
    won: boolean;
    timeMs: number;
    isBest: boolean;
    difficulty: DifficultyId;
  } | null;
  juice: JuiceEvent | null;
  recorded: boolean;
  hydrate: () => void;
  persist: () => void;
  start: (id: DifficultyId, dims?: { cols: number; rows: number; mines: number }) => void;
  continueSaved: () => void;
  applyOutcome: (out: Outcome, origin: number | null) => void;
  reveal: (index: number) => void;
  flag: (index: number) => void;
  chord: (index: number) => void;
  setOverlay: (o: OverlayId) => void;
  setFlagMode: (v: boolean) => void;
  patchSettings: (p: Partial<Settings>) => void;
  setCustom: (p: Partial<{ cols: number; rows: number; mines: number }>) => void;
  restart: () => void;
  toTitle: () => void;
  dismissResult: () => void;
}

let juiceSeq = 1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function haptic(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

function recordStats(stats: Stats, board: Board, won: boolean, timeMs: number): { stats: Stats; isBest: boolean } {
  const key: "easy" | "medium" | "expert" | "daily" | null =
    board.difficulty === "custom" ? null : board.difficulty;
  if (!key) return { stats, isBest: false };
  const prev = stats[key];
  const isBest = won && (prev.bestMs == null || timeMs < prev.bestMs);
  const streak = won ? prev.streak + 1 : 0;
  const nextDiff = {
    played: prev.played + 1,
    won: prev.won + (won ? 1 : 0),
    bestMs: isBest ? timeMs : prev.bestMs,
    streak,
    bestStreak: Math.max(prev.bestStreak, streak),
  };
  const next: Stats = { ...stats, [key]: nextDiff };
  if (key === "daily") next.lastDaily = dailyKey();
  return { stats: next, isBest };
}

function schedulePersist(get: () => GameState) {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    get().persist();
  }, 250);
}

export const useGame = create<GameState>((set, get) => ({
  screen: "title",
  overlay: null,
  board: null,
  settings: { ...DEFAULT_SETTINGS },
  stats: {
    easy: { ...EMPTY_DIFF },
    medium: { ...EMPTY_DIFF },
    expert: { ...EMPTY_DIFF },
    daily: { ...EMPTY_DIFF },
    lastDaily: null,
  },
  custom: { cols: 12, rows: 12, mines: 24 },
  flagMode: false,
  hydrated: false,
  lastResult: null,
  juice: null,
  recorded: false,

  hydrate: () => {
    const data = loadSave();
    if (typeof window !== "undefined") {
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) data.settings.reducedMotion = true;
    }
    setAudioEnabled(data.settings.sound);
    setAudioVolume(data.settings.volume);
    set({
      settings: data.settings,
      stats: data.stats,
      custom: data.custom,
      hydrated: true,
    });
  },

  persist: () => {
    const s = get();
    let board = s.board;
    if (board && (board.status === "playing" || board.status === "ready")) {
      // Always freeze elapsed in the blob so a refresh + Continuar
      // doesn't add the time the tab was closed.
      board = pauseBoard(board, performance.now());
    } else {
      board = null;
    }
    const blob: SaveBlob = {
      version: 1,
      board,
      settings: s.settings,
      stats: s.stats,
      custom: s.custom,
    };
    writeSave(blob);
  },

  start: (id, dims) => {
    unlockAudio();
    let cols: number;
    let rows: number;
    let mines: number;
    let seed: number;
    if (id === "easy" || id === "medium" || id === "expert") {
      const p = PRESETS[id];
      cols = p.cols;
      rows = p.rows;
      mines = p.mines;
      seed = (Math.random() * 0xffffffff) >>> 0;
    } else if (id === "daily") {
      cols = 16;
      rows = 16;
      mines = 40;
      seed = dailySeed();
    } else {
      const c = dims ?? get().custom;
      cols = c.cols;
      rows = c.rows;
      mines = c.mines;
      seed = (Math.random() * 0xffffffff) >>> 0;
    }
    const board = createBoard(cols, rows, mines, seed, id);
    set({
      screen: "play",
      overlay: null,
      board,
      flagMode: false,
      lastResult: null,
      juice: null,
      recorded: false,
    });
    get().persist();
  },

  continueSaved: () => {
    const data = loadSave();
    if (!data.board) return;
    unlockAudio();
    const board = resumeBoard(data.board, performance.now());
    set({
      screen: "play",
      overlay: null,
      board,
      flagMode: false,
      lastResult: null,
      juice: null,
      recorded: false,
    });
  },

  applyOutcome: (out, origin) => {
    const s = get();
    if (!s.board) return;
    if (out.kind === "noop") return;

    let stats = s.stats;
    let lastResult = s.lastResult;
    let recorded = s.recorded;
    let overlay = s.overlay;

    if ((out.kind === "win" || out.kind === "boom") && !recorded) {
      const won = out.kind === "win";
      const timeMs = elapsedMs(out.board, out.board.endMs ?? performance.now());
      const rec = recordStats(stats, out.board, won, timeMs);
      stats = rec.stats;
      lastResult = { won, timeMs, isBest: rec.isBest, difficulty: out.board.difficulty };
      recorded = true;
      overlay = "result";
    }

    if (s.settings.sound) {
      if (out.kind === "reveal" || out.kind === "chord") {
        const adj = origin != null ? (out.board.cells[origin]?.adjacent ?? 0) : 0;
        playReveal(adj);
        if (out.revealed.length > 8) playFloodTick();
      } else if (out.kind === "flag") playFlag();
      else if (out.kind === "unflag" || out.kind === "question") playUnflag();
      else if (out.kind === "blocked") playBlocked();
      else if (out.kind === "boom") playBoom();
      else if (out.kind === "win") playWin();
    }

    if (s.settings.haptics) {
      if (out.kind === "flag") haptic(8);
      else if (out.kind === "blocked") haptic(18);
      else if (out.kind === "boom") haptic([40, 40, 70]);
      else if (out.kind === "win") haptic([12, 30, 12, 30, 18]);
    }

    set({
      board: out.board,
      stats,
      lastResult,
      recorded,
      overlay,
      juice: {
        id: juiceSeq++,
        kind: out.kind,
        revealed: out.revealed,
        origin,
        at: performance.now(),
      },
    });
    if (out.kind === "win" || out.kind === "boom") {
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      get().persist();
    } else {
      schedulePersist(get);
    }
  },

  reveal: (index) => {
    const { board } = get();
    if (!board) return;
    get().applyOutcome(revealCell(board, index, performance.now()), index);
  },

  flag: (index) => {
    const { board, settings } = get();
    if (!board) return;
    get().applyOutcome(toggleFlag(board, index, performance.now(), settings.questions), index);
  },

  chord: (index) => {
    const { board } = get();
    if (!board) return;
    get().applyOutcome(chordCell(board, index, performance.now()), index);
  },

  setOverlay: (overlay) => {
    const s = get();
    const now = performance.now();
    let board = s.board;
    if (board && s.screen === "play" && board.status === "playing") {
      board = overlay ? pauseBoard(board, now) : resumeBoard(board, now);
    }
    set({ overlay, board });
  },
  setFlagMode: (flagMode) => set({ flagMode }),

  patchSettings: (p) => {
    const settings = { ...get().settings, ...p };
    setAudioEnabled(settings.sound);
    setAudioVolume(settings.volume);
    set({ settings });
    get().persist();
  },

  setCustom: (p) => {
    const custom = { ...get().custom, ...p };
    const maxMines = Math.max(1, custom.cols * custom.rows - 9);
    custom.mines = Math.max(1, Math.min(custom.mines, maxMines));
    set({ custom });
    get().persist();
  },

  restart: () => {
    const { board } = get();
    if (!board) return;
    get().start(board.difficulty, {
      cols: board.cols,
      rows: board.rows,
      mines: board.mines,
    });
  },

  toTitle: () => {
    const s = get();
    if (s.board && s.board.status === "playing") {
      set({ board: pauseBoard(s.board, performance.now()) });
    }
    get().persist();
    set({
      screen: "title",
      overlay: null,
      board: null,
      flagMode: false,
      juice: null,
    });
  },

  dismissResult: () => set({ overlay: null }),
}));

export function savedBoard(): Board | null {
  return loadSave().board;
}
