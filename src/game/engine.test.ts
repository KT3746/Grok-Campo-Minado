import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chordCell,
  cloneBoard,
  createBoard,
  elapsedMs,
  formatTime,
  neighbors,
  pauseBoard,
  placeMines,
  remainingMines,
  resumeBoard,
  revealCell,
  toggleFlag,
} from "./engine.ts";

describe("engine", () => {
  it("first click is never a mine across many seeds", () => {
    for (let seed = 1; seed < 400; seed++) {
      let b = createBoard(9, 9, 10, seed, "easy");
      const click = seed % 81;
      const out = revealCell(b, click, 1000);
      assert.notEqual(out.kind, "boom", `seed ${seed} click ${click}`);
      assert.equal(out.board.cells[click]!.mine, false);
      assert.equal(out.board.cells[click]!.revealed, true);
      const mineCount = out.board.cells.filter((c) => c.mine).length;
      assert.equal(mineCount, 10);
    }
  });

  it("first click opening excludes neighbors when there is room", () => {
    let b = createBoard(9, 9, 10, 7, "easy");
    const click = 40; // center
    const out = revealCell(b, click, 1);
    assert.equal(out.board.cells[click]!.adjacent, 0);
    for (const n of neighbors(9, 9, click)) {
      assert.equal(out.board.cells[n]!.mine, false);
    }
  });

  it("flood reveals the zero region and numbered border", () => {
    let b = createBoard(9, 9, 10, 7, "easy");
    const out = revealCell(b, 40, 1);
    assert.ok(out.revealed.length >= 9);
    assert.ok(out.board.revealedCount === out.revealed.length);
    for (const i of out.revealed) {
      assert.equal(out.board.cells[i]!.revealed, true);
      assert.equal(out.board.cells[i]!.mine, false);
    }
  });

  it("cannot reveal a flagged cell", () => {
    let b = createBoard(9, 9, 10, 3, "easy");
    const f = toggleFlag(b, 0, 1, false);
    const r = revealCell(f.board, 0, 2);
    assert.equal(r.kind, "noop");
    assert.equal(r.board.cells[0]!.revealed, false);
  });

  it("flag cycles and remaining mines tracks", () => {
    let b = createBoard(9, 9, 10, 3, "easy");
    const a = toggleFlag(b, 0, 1, false);
    assert.equal(a.kind, "flag");
    assert.equal(remainingMines(a.board), 9);
    const u = toggleFlag(a.board, 0, 2, false);
    assert.equal(u.kind, "unflag");
    assert.equal(remainingMines(u.board), 10);
  });

  it("question cycle does not count as a mine flag", () => {
    let b = createBoard(9, 9, 10, 3, "easy");
    const a = toggleFlag(b, 0, 1, true);
    assert.equal(a.board.cells[0]!.flag, 1);
    const q = toggleFlag(a.board, 0, 2, true);
    assert.equal(q.kind, "question");
    assert.equal(q.board.cells[0]!.flag, 2);
    assert.equal(remainingMines(q.board), 10);
    const clear = toggleFlag(q.board, 0, 3, true);
    assert.equal(clear.kind, "unflag");
    assert.equal(clear.board.cells[0]!.flag, 0);
  });

  it("revealing a mine loses", () => {
    let b = placeMines(createBoard(9, 9, 10, 99, "easy"), 0);
    const mine = b.cells.findIndex((c) => c.mine);
    assert.ok(mine >= 0);
    const out = revealCell(b, mine, 5);
    assert.equal(out.kind, "boom");
    assert.equal(out.board.status, "lost");
    assert.equal(out.board.exploded, mine);
    assert.equal(out.board.cells[mine]!.revealed, true);
    assert.ok(out.board.endMs != null);
  });

  it("winning reveals all safe cells and auto-flags mines", () => {
    let b = placeMines(createBoard(9, 9, 10, 42, "easy"), 0);
    b = { ...b, status: "playing", startMs: 1, minesPlaced: true };
    let now = 2;
    let board = b;
    for (let i = 0; i < board.cells.length; i++) {
      if (board.status === "won" || board.status === "lost") break;
      if (board.cells[i]!.mine || board.cells[i]!.revealed) continue;
      const out = revealCell(board, i, now++);
      board = out.board;
    }
    assert.equal(board.status, "won");
    assert.equal(
      board.cells.filter((c) => c.revealed && !c.mine).length,
      81 - 10,
    );
    assert.equal(board.cells.filter((c) => c.mine && c.flag === 1).length, 10);
    assert.equal(remainingMines(board), 0);
  });

  it("chord opens neighbors when flags match", () => {
    let b = placeMines(createBoard(9, 9, 10, 42, "easy"), 40);
    b = { ...b, status: "playing", startMs: 1, minesPlaced: true };
    const numbered = b.cells.findIndex((c, i) => !c.mine && c.adjacent > 0 && i > 0);
    const n = numbered;
    let board = revealCell(b, n, 2).board;
    const cell = board.cells[n]!;
    assert.ok(cell.revealed && cell.adjacent > 0);
    const neigh = neighbors(9, 9, n);
    const mines = neigh.filter((i) => board.cells[i]!.mine);
    for (const m of mines) {
      if (board.cells[m]!.flag !== 1) {
        board = toggleFlag(board, m, 3, false).board;
      }
    }
    const out = chordCell(board, n, 4);
    assert.notEqual(out.kind, "blocked");
    if (mines.length === cell.adjacent) {
      assert.ok(out.kind === "chord" || out.kind === "win" || out.kind === "noop");
      for (const i of neigh) {
        if (board.cells[i]!.flag !== 1 && !board.cells[i]!.mine) {
          assert.equal(out.board.cells[i]!.revealed, true);
        }
      }
    }
  });

  it("chord is blocked when flag count is wrong", () => {
    let b = placeMines(createBoard(9, 9, 10, 42, "easy"), 40);
    b = { ...b, status: "playing", startMs: 1, minesPlaced: true };
    const n = b.cells.findIndex((c) => !c.mine && c.adjacent >= 2);
    const board = revealCell(b, n, 2).board;
    const out = chordCell(board, n, 3);
    assert.equal(out.kind, "blocked");
  });

  it("wrong flags then chord on a completed count detonates", () => {
    let b = placeMines(createBoard(9, 9, 10, 11, "easy"), 40);
    b = { ...b, status: "playing", startMs: 1, minesPlaced: true };
    const n = b.cells.findIndex((c) => !c.mine && c.adjacent === 1);
    let board = revealCell(b, n, 2).board;
    const neigh = neighbors(9, 9, n);
    const safe = neigh.find((i) => !board.cells[i]!.mine && !board.cells[i]!.revealed);
    const mine = neigh.find((i) => board.cells[i]!.mine);
    if (safe == null || mine == null) return;
    board = toggleFlag(board, safe, 3, false).board;
    const out = chordCell(board, n, 4);
    assert.equal(out.kind, "boom");
    assert.equal(out.board.status, "lost");
  });

  it("pause is idempotent and resume after a 'save' round-trip keeps elapsed", () => {
    let b = createBoard(9, 9, 10, 1, "easy");
    b = { ...b, status: "playing", startMs: 1000, endMs: null };
    const paused = pauseBoard(b, 5000);
    const pausedAgain = pauseBoard(paused, 9999);
    assert.equal(pausedAgain.endMs, 5000);
    assert.equal(elapsedMs(pausedAgain, 9999), 4000);
    const resumed = resumeBoard(pausedAgain, 20_000);
    assert.equal(elapsedMs(resumed, 20_000), 4000);
    assert.equal(elapsedMs(resumed, 21_500), 5500);
  });

  it("formatTime pads minutes and tenths", () => {
    assert.equal(formatTime(0), "0:00.0");
    assert.equal(formatTime(100), "0:00.1");
    assert.equal(formatTime(1000), "0:01.0");
    assert.equal(formatTime(61000), "1:01.0");
  });

  it("cloneBoard deep-copies cells", () => {
    const b = createBoard(2, 2, 1, 1, "custom");
    const c = cloneBoard(b);
    c.cells[0]!.revealed = true;
    assert.equal(b.cells[0]!.revealed, false);
  });

  it("reveal does not mutate the previous board object", () => {
    let b = placeMines(createBoard(9, 9, 10, 5, "easy"), 0);
    b = { ...b, status: "playing", startMs: 1, minesPlaced: true };
    const safe = b.cells.findIndex((c) => !c.mine);
    const out = revealCell(b, safe, 2);
    assert.equal(b.cells[safe]!.revealed, false);
    assert.equal(out.board.cells[safe]!.revealed, true);
    assert.notEqual(out.board, b);
  });
});
