export type FlagState = 0 | 1 | 2;
export type GameStatus = "ready" | "playing" | "won" | "lost";
export type DifficultyId = "easy" | "medium" | "expert" | "daily" | "custom";
export type ScreenId = "title" | "play";
export type OverlayId =
  | null
  | "settings"
  | "stats"
  | "howto"
  | "custom"
  | "result"
  | "confirm-restart"
  | "confirm-menu";

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flag: FlagState;
  adjacent: number;
}

export interface Board {
  cols: number;
  rows: number;
  mines: number;
  cells: Cell[];
  status: GameStatus;
  minesPlaced: boolean;
  revealedCount: number;
  flagCount: number;
  startMs: number | null;
  endMs: number | null;
  exploded: number | null;
  seed: number;
  firstIndex: number | null;
  difficulty: DifficultyId;
}

export interface Preset {
  id: DifficultyId;
  cols: number;
  rows: number;
  mines: number;
  label: string;
}

export const PRESETS: Record<"easy" | "medium" | "expert", Preset> = {
  easy: { id: "easy", cols: 9, rows: 9, mines: 10, label: "Fácil" },
  medium: { id: "medium", cols: 16, rows: 16, mines: 40, label: "Médio" },
  expert: { id: "expert", cols: 30, rows: 16, mines: 99, label: "Expert" },
};

export interface Settings {
  sound: boolean;
  volume: number;
  haptics: boolean;
  questions: boolean;
  longPress: boolean;
  reducedMotion: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  volume: 0.7,
  haptics: true,
  questions: false,
  longPress: true,
  reducedMotion: false,
};

export interface DiffStats {
  played: number;
  won: number;
  bestMs: number | null;
  streak: number;
  bestStreak: number;
}

export interface Stats {
  easy: DiffStats;
  medium: DiffStats;
  expert: DiffStats;
  daily: DiffStats;
  lastDaily: string | null;
}

export const EMPTY_DIFF: DiffStats = {
  played: 0,
  won: 0,
  bestMs: null,
  streak: 0,
  bestStreak: 0,
};

export const DEFAULT_STATS: Stats = {
  easy: { ...EMPTY_DIFF },
  medium: { ...EMPTY_DIFF },
  expert: { ...EMPTY_DIFF },
  daily: { ...EMPTY_DIFF },
  lastDaily: null,
};

export type OutcomeKind =
  | "noop"
  | "reveal"
  | "flag"
  | "unflag"
  | "question"
  | "chord"
  | "blocked"
  | "boom"
  | "win";

export interface Outcome {
  board: Board;
  revealed: number[];
  kind: OutcomeKind;
}

export const DIRS = [
  [-1, -1],
  [0, -1],
  [1, -1],
  [-1, 0],
  [1, 0],
  [-1, 1],
  [0, 1],
  [1, 1],
] as const;
