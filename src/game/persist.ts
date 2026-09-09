import type { Board, Settings, Stats } from "./types";
import { DEFAULT_SETTINGS, DEFAULT_STATS, EMPTY_DIFF } from "./types";

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

function mergeDiff(raw: unknown) {
  if (!raw || typeof raw !== "object") return { ...EMPTY_DIFF };
  const d = raw as Record<string, unknown>;
  return {
    played: typeof d.played === "number" ? d.played : 0,
    won: typeof d.won === "number" ? d.won : 0,
    bestMs: typeof d.bestMs === "number" ? d.bestMs : null,
    streak: typeof d.streak === "number" ? d.streak : 0,
    bestStreak: typeof d.bestStreak === "number" ? d.bestStreak : 0,
  };
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
    const statsRaw = parsed.stats ?? DEFAULT_STATS;
    const stats: Stats = {
      easy: mergeDiff(statsRaw.easy),
      medium: mergeDiff(statsRaw.medium),
      expert: mergeDiff(statsRaw.expert),
      daily: mergeDiff(statsRaw.daily),
      lastDaily: statsRaw.lastDaily ?? null,
    };
    const board =
      parsed.board && parsed.board.cells && parsed.board.status === "playing"
        ? parsed.board
        : parsed.board && parsed.board.status === "ready"
          ? parsed.board
          : null;
    return {
      version: SAVE_VERSION,
      board,
      settings,
      stats,
      custom: { ...DEFAULT_CUSTOM, ...(parsed.custom ?? {}) },
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
