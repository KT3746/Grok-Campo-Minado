import type { Board, Cell, DifficultyId, Outcome, OutcomeKind } from "./types";
import { DIRS } from "./types";

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailyKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function dailySeed(d = new Date()): number {
  return hashString(`veil-daily-${dailyKey(d)}`);
}

export function idx(cols: number, x: number, y: number): number {
  return y * cols + x;
}

export function xy(cols: number, i: number): { x: number; y: number } {
  return { x: i % cols, y: Math.floor(i / cols) };
}

export function inBounds(cols: number, rows: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

export function neighbors(cols: number, rows: number, i: number): number[] {
  const { x, y } = xy(cols, i);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(cols, rows, nx, ny)) out.push(idx(cols, nx, ny));
  }
  return out;
}

function emptyCell(): Cell {
  return { mine: false, revealed: false, flag: 0, adjacent: 0 };
}

function finiteInt(n: unknown, fallback: number): number {
  const v = typeof n === "number" ? n : Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : fallback;
}

export function createBoard(
  cols: number,
  rows: number,
  mines: number,
  seed: number,
  difficulty: DifficultyId,
): Board {
  const c = Math.max(1, finiteInt(cols, 9));
  const r = Math.max(1, finiteInt(rows, 9));
  const n = c * r;
  // Always leave at least one safe cell so the first click can never be a mine.
  const safeMines = Math.max(0, Math.min(finiteInt(mines, 1), n - 1));
  return {
    cols: c,
    rows: r,
    mines: safeMines,
    cells: Array.from({ length: n }, emptyCell),
    status: "ready",
    minesPlaced: false,
    revealedCount: 0,
    flagCount: 0,
    startMs: null,
    endMs: null,
    exploded: null,
    seed: finiteInt(seed, 1) >>> 0,
    firstIndex: null,
    difficulty,
  };
}

export function cloneBoard(b: Board): Board {
  return { ...b, cells: b.cells.map((c) => ({ ...c })) };
}

function exclusionSet(b: Board, safeIndex: number): Set<number> {
  const n = b.cols * b.rows;
  const around = [safeIndex, ...neighbors(b.cols, b.rows, safeIndex)];
  if (n - around.length >= b.mines) return new Set(around);
  return new Set([safeIndex]);
}

export function refreshAdjacent(b: Board): void {
  for (let i = 0; i < b.cells.length; i++) {
    const c = b.cells[i]!;
    if (c.mine) {
      c.adjacent = 0;
      continue;
    }
    let adj = 0;
    for (const n of neighbors(b.cols, b.rows, i)) {
      if (b.cells[n]!.mine) adj++;
    }
    c.adjacent = adj;
  }
}

export function recomputeCounts(b: Board): void {
  let revealed = 0;
  let flags = 0;
  let mines = 0;
  for (const c of b.cells) {
    if (c.mine) mines++;
    if (c.revealed) revealed++;
    if (c.flag === 1) flags++;
  }
  b.revealedCount = revealed;
  b.flagCount = flags;
  if (b.minesPlaced && mines > 0) b.mines = mines;
}

export function placeMines(board: Board, safeIndex: number): Board {
  const b = cloneBoard(board);
  const rng = makeRng(b.seed ^ ((safeIndex + 1) * 2654435761));
  const forbidden = exclusionSet(b, safeIndex);
  const pool: number[] = [];
  for (let i = 0; i < b.cells.length; i++) {
    if (!forbidden.has(i)) pool.push(i);
  }
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }
  const want = Math.min(b.mines, pool.length);
  for (let k = 0; k < want; k++) {
    const i = pool[k]!;
    b.cells[i]!.mine = true;
  }
  b.mines = want;
  refreshAdjacent(b);
  b.minesPlaced = true;
  return b;
}

function beginPlay(b: Board, index: number, now: number): Board {
  let next = b.minesPlaced ? cloneBoard(b) : placeMines(b, index);
  if (next.status === "ready") {
    next = { ...next, status: "playing", startMs: now, firstIndex: index };
  } else if (next.firstIndex == null) {
    next = { ...next, firstIndex: index, startMs: next.startMs ?? now };
  }
  return next;
}

function finish(b: Board, status: "won" | "lost", exploded: number | null, now: number): Board {
  if (status === "lost" && exploded != null) {
    const c = b.cells[exploded];
    if (c) c.revealed = true;
  }
  return { ...b, status, exploded, endMs: now };
}

function floodReveal(b: Board, start: number): number[] {
  const order: number[] = [];
  const seen = new Uint8Array(b.cells.length);
  const q = [start];
  let head = 0;
  while (head < q.length) {
    const i = q[head++]!;
    if (seen[i]) continue;
    const c = b.cells[i]!;
    if (c.flag === 1) continue;
    seen[i] = 1;
    if (c.revealed) continue;
    if (c.mine) continue;
    c.revealed = true;
    b.revealedCount++;
    order.push(i);
    if (c.adjacent === 0) {
      for (const n of neighbors(b.cols, b.rows, i)) {
        if (!seen[n]) q.push(n);
      }
    }
  }
  return order;
}

function checkWin(b: Board): boolean {
  const safe = b.cols * b.rows - b.mines;
  return safe > 0 && b.revealedCount >= safe;
}

function autoFlagMines(b: Board): void {
  for (const c of b.cells) {
    if (c.mine) {
      if (c.flag !== 1) {
        c.flag = 1;
        b.flagCount++;
      }
    } else if (c.flag === 1) {
      // Drop leftover flags on safe cells so remaining reads 0 on a win.
      c.flag = 0;
      b.flagCount--;
    }
  }
}

export function revealCell(board: Board, index: number, now: number): Outcome {
  if (board.status === "won" || board.status === "lost") {
    return { board, revealed: [], kind: "noop" };
  }
  if (index < 0 || index >= board.cells.length || !Number.isInteger(index)) {
    return { board, revealed: [], kind: "noop" };
  }
  const target = board.cells[index]!;
  if (target.revealed) {
    if (target.adjacent > 0) return chordCell(board, index, now);
    return { board, revealed: [], kind: "noop" };
  }
  if (target.flag === 1) return { board, revealed: [], kind: "noop" };

  let b = beginPlay(board, index, now);
  const cell = b.cells[index]!;
  if (cell.mine) {
    b = finish(b, "lost", index, now);
    return { board: b, revealed: [index], kind: "boom" };
  }
  const revealed = floodReveal(b, index);
  if (checkWin(b)) {
    autoFlagMines(b);
    b = finish(b, "won", null, now);
    return { board: b, revealed, kind: "win" };
  }
  return { board: b, revealed, kind: "reveal" };
}

export function toggleFlag(
  board: Board,
  index: number,
  _now: number,
  allowQuestion: boolean,
): Outcome {
  if (board.status === "won" || board.status === "lost") {
    return { board, revealed: [], kind: "noop" };
  }
  if (index < 0 || index >= board.cells.length || !Number.isInteger(index)) {
    return { board, revealed: [], kind: "noop" };
  }
  const cell = board.cells[index];
  if (!cell || cell.revealed) return { board, revealed: [], kind: "noop" };

  const next = cloneBoard(board);
  // Flagging before the first reveal should not start the clock — classic behavior.
  const c = next.cells[index]!;
  const cycle = allowQuestion ? 3 : 2;
  const prev = c.flag === 1 || c.flag === 2 ? c.flag : 0;
  c.flag = ((prev + 1) % cycle) as 0 | 1 | 2;
  if (prev === 1) next.flagCount--;
  if (c.flag === 1) next.flagCount++;
  if (next.flagCount < 0) next.flagCount = 0;
  const kind: OutcomeKind = c.flag === 1 ? "flag" : c.flag === 2 ? "question" : "unflag";
  return { board: next, revealed: [], kind };
}

export function chordCell(board: Board, index: number, now: number): Outcome {
  if (board.status !== "playing" && board.status !== "ready") {
    return { board, revealed: [], kind: "noop" };
  }
  if (index < 0 || index >= board.cells.length || !Number.isInteger(index)) {
    return { board, revealed: [], kind: "noop" };
  }
  const cell = board.cells[index];
  if (!cell || !cell.revealed || cell.adjacent === 0) {
    return { board, revealed: [], kind: "noop" };
  }
  const neigh = neighbors(board.cols, board.rows, index);
  let flags = 0;
  let hidden = 0;
  for (const n of neigh) {
    const c = board.cells[n]!;
    if (c.flag === 1) flags++;
    else if (!c.revealed) hidden++;
  }
  if (hidden === 0) return { board, revealed: [], kind: "noop" };
  if (flags !== cell.adjacent) return { board, revealed: [], kind: "blocked" };

  let b = cloneBoard(board);
  if (b.status === "ready") {
    b = beginPlay(b, index, now);
  }
  const revealed: number[] = [];
  const hits: number[] = [];
  for (const n of neigh) {
    const c = b.cells[n]!;
    if (c.revealed || c.flag === 1) continue;
    if (c.mine) {
      c.revealed = true;
      hits.push(n);
      continue;
    }
    const more = floodReveal(b, n);
    revealed.push(...more);
  }
  if (hits.length) {
    b = finish(b, "lost", hits[0]!, now);
    return { board: b, revealed: [...hits, ...revealed], kind: "boom" };
  }
  if (checkWin(b)) {
    autoFlagMines(b);
    b = finish(b, "won", null, now);
    return { board: b, revealed, kind: "win" };
  }
  return { board: b, revealed, kind: revealed.length ? "chord" : "noop" };
}

export function remainingMines(b: Board): number {
  const left = b.mines - b.flagCount;
  return Number.isFinite(left) ? left : 0;
}

export function elapsedMs(b: Board, now: number): number {
  if (b.startMs == null || !Number.isFinite(b.startMs)) return 0;
  const end = b.endMs != null && Number.isFinite(b.endMs) ? b.endMs : now;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - b.startMs);
}

export function pauseBoard(b: Board, now: number): Board {
  if (b.status !== "playing" || b.startMs == null || b.endMs != null) return b;
  const t = Number.isFinite(now) ? now : 0;
  return { ...b, endMs: t };
}

export function resumeBoard(b: Board, now: number): Board {
  if (b.status !== "playing" || b.startMs == null || b.endMs == null) return b;
  const elapsed = b.endMs - b.startMs;
  if (!Number.isFinite(elapsed) || !Number.isFinite(now)) return { ...b, endMs: null };
  return { ...b, startMs: now - elapsed, endMs: null };
}

export function formatTime(ms: number): string {
  const clamped = Math.max(0, Math.floor(Number.isFinite(ms) ? ms : 0));
  const totalTenths = Math.floor(clamped / 100);
  const tenths = totalTenths % 10;
  const totalSec = Math.floor(totalTenths / 10);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}.${tenths}`;
}

export function difficultyLabel(id: DifficultyId, cols: number, rows: number): string {
  if (id === "easy") return "Fácil";
  if (id === "medium") return "Médio";
  if (id === "expert") return "Expert";
  if (id === "daily") return "Diário";
  return `${cols} × ${rows}`;
}
