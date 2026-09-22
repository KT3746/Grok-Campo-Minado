import type { Board, Cell, FlagState, GameStatus, Settings, Stats } from "./types";
import { DEFAULT_SETTINGS, DEFAULT_STATS, EMPTY_DIFF } from "./types";
import { recomputeCounts, refreshAdjacent } from "./engine";

const KEY = "veil.save.v1";
const SAVE_VERSION = 1;

export interface SaveBlob {
  version: number;
  board: Board | null;
  settings: Settings;
  stats: Stats;
  custom: { cols: number; rows: number; mines: number };
}

const DEFAULT_CUSTOM = { cols: 12, rows: 12, mines: 24 };

function finiteNumber(n: unknown, fallback: number): number {
  return typeof n === "number" && Number.isFinite(n) ? n : fallback;
}

function mergeDiff(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DIFF };
  const d = raw as Record<string, unknown>;
  const best = finiteNumber(d.bestMs, Number.NaN);
  return {
    played: Math.max(0, Math.floor(finiteNumber(d.played, 0))),
    won: Math.max(0, Math.floor(finiteNumber(d.won, 0))),
    bestMs: Number.isFinite(best) ? best : null,
    streak: Math.max(0, Math.floor(finiteNumber(d.streak, 0))),
    bestStreak: Math.max(0, Math.floor(finiteNumber(d.bestStreak, 0))),
  };
}

function sanitizeCell(raw: unknown): Cell {
  const c = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const flagRaw = finiteNumber(c.flag, 0);
  const flag = (flagRaw === 1 || flagRaw === 2 ? flagRaw : 0) as FlagState;
  return {
    mine: c.mine === true,
    revealed: c.revealed === true,
    flag,
    adjacent: Math.max(0, Math.min(8, Math.floor(finiteNumber(c.adjacent, 0)))),
  };
}

export function sanitizeBoard(raw: unknown): Board | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const cols = Math.floor(finiteNumber(b.cols, 0));
  const rows = Math.floor(finiteNumber(b.rows, 0));
  if (cols < 1 || rows < 1 || cols > 60 || rows > 40) return null;
  if (!Array.isArray(b.cells) || b.cells.length !== cols * rows) return null;
  const status = b.status as GameStatus;
  if (status !== "playing" && status !== "ready") return null;
  const cells = b.cells.map(sanitizeCell);
  const difficulty =
    b.difficulty === "easy" ||
    b.difficulty === "medium" ||
    b.difficulty === "expert" ||
    b.difficulty === "daily" ||
    b.difficulty === "custom"
      ? b.difficulty
      : "custom";
  const board: Board = {
    cols,
    rows,
    mines: Math.max(0, Math.min(cols * rows - 1, Math.floor(finiteNumber(b.mines, 1)))),
    cells,
    status,
    minesPlaced: b.minesPlaced === true,
    revealedCount: Math.max(0, Math.floor(finiteNumber(b.revealedCount, 0))),
    flagCount: Math.max(0, Math.floor(finiteNumber(b.flagCount, 0))),
    startMs: typeof b.startMs === "number" && Number.isFinite(b.startMs) ? b.startMs : null,
    endMs: typeof b.endMs === "number" && Number.isFinite(b.endMs) ? b.endMs : null,
    exploded: typeof b.exploded === "number" && Number.isInteger(b.exploded) ? b.exploded : null,
    seed: finiteNumber(b.seed, 1) >>> 0,
    firstIndex:
      typeof b.firstIndex === "number" && Number.isInteger(b.firstIndex) ? b.firstIndex : null,
    difficulty,
  };
  if (board.minesPlaced) refreshAdjacent(board);
  recomputeCounts(board);
  return board;
}

export function defaultSave(): SaveBlob {
  return {
    version: SAVE_VERSION,
    board: null,
    settings: { ...DEFAULT_SETTINGS },
    stats: {
      easy: { ...EMPTY_DIFF },
      medium: { ...EMPTY_DIFF },
      expert: { ...EMPTY_DIFF },
      daily: { ...EMPTY_DIFF },
      lastDaily: null,
    },
    custom: { ...DEFAULT_CUSTOM },
  };
}

export function loadSave(): SaveBlob {
  const fallback = defaultSave();
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveBlob>;
    const settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    settings.volume = Math.max(0, Math.min(1, finiteNumber(settings.volume, DEFAULT_SETTINGS.volume)));
    settings.sound = settings.sound === true;
    settings.haptics = settings.haptics === true;
    settings.questions = settings.questions === true;
    settings.longPress = settings.longPress !== false;
    settings.reducedMotion = settings.reducedMotion === true;
    const statsRaw = parsed.stats ?? DEFAULT_STATS;
    const stats: Stats = {
      easy: mergeDiff(statsRaw.easy),
      medium: mergeDiff(statsRaw.medium),
      expert: mergeDiff(statsRaw.expert),
      daily: mergeDiff(statsRaw.daily),
      lastDaily: typeof statsRaw.lastDaily === "string" ? statsRaw.lastDaily : null,
    };
    const board = sanitizeBoard(parsed.board);
    const customRaw = parsed.custom ?? DEFAULT_CUSTOM;
    const cols = Math.max(5, Math.min(30, Math.floor(finiteNumber(customRaw.cols, 12))));
    const rows = Math.max(5, Math.min(24, Math.floor(finiteNumber(customRaw.rows, 12))));
    const maxMines = Math.max(1, cols * rows - 9);
    const mines = Math.max(1, Math.min(maxMines, Math.floor(finiteNumber(customRaw.mines, 24))));
    return {
      version: SAVE_VERSION,
      board,
      settings,
      stats,
      custom: { cols, rows, mines },
    };
  } catch {
    return fallback;
  }
}

export function writeSave(save: SaveBlob): void {
  if (typeof window === "undefined") return;
  try {
    const payload: SaveBlob = { ...save, version: SAVE_VERSION };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    /* private mode / quota */
  }
}
