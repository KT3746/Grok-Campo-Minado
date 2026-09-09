import type { Board } from "./types";
import { xy } from "./engine";
import type { JuiceEvent } from "./store";

const NUM_COLORS = [
  "#00000000",
  "#6b9ad4",
  "#5c9a74",
  "#c45c4a",
  "#5a6d9a",
  "#a35a4a",
  "#4a9aaa",
  "#1c1d20",
  "#6a6b70",
];

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

export interface ViewCam {
  zoom: number;
  panX: number;
  panY: number;
  userZoomed: boolean;
}

export interface Layout {
  cell: number;
  gap: number;
  originX: number;
  originY: number;
  boardW: number;
  boardH: number;
  pad: number;
}

interface CellFx {
  reveal: number;
  flag: number;
  press: number;
  mine: number;
  pop: number;
}

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3;
}
function easeOutBack(t: number) {
  const c = 1.70158;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}
function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hash(i: number) {
  let x = (i + 1) * 374761393;
  x = (x ^ (x >>> 13)) * 1274126177;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export function computeLayout(
  cssW: number,
  cssH: number,
  cols: number,
  rows: number,
  cam: ViewCam,
): Layout {
  const pad = 10;
  const availW = Math.max(40, cssW - pad * 2);
  const availH = Math.max(40, cssH - pad * 2);
  const gapRatio = 0.08;
  const maxCell = 64;
  const minCell = 22;
  const raw = Math.min(availW / cols, availH / rows, maxCell);
  const cellFit = clamp(raw * (1 - gapRatio), minCell, maxCell);
  const cell = cellFit * cam.zoom;
  const gap = clamp(cell * gapRatio, 1.2, 3.2 * cam.zoom);
  const boardW = cols * (cell + gap) - gap;
  const boardH = rows * (cell + gap) - gap;
  const originX = (cssW - boardW) / 2 + cam.panX;
  const originY = (cssH - boardH) / 2 + cam.panY;
  const slack = 48;
  let ox = originX;
  let oy = originY;
  if (boardW <= cssW - 8) {
    ox = (cssW - boardW) / 2;
    cam.panX = 0;
  } else {
    const minX = cssW - slack - boardW;
    const maxX = slack;
    const clamped = clamp(ox, minX, maxX);
    cam.panX += clamped - ox;
    ox = clamped;
  }
  if (boardH <= cssH - 8) {
    oy = (cssH - boardH) / 2;
    cam.panY = 0;
  } else {
    const minY = cssH - slack - boardH;
    const maxY = slack;
    const clamped = clamp(oy, minY, maxY);
    cam.panY += clamped - oy;
    oy = clamped;
  }
  return { cell, gap, originX: ox, originY: oy, boardW, boardH, pad };
}

export function hitIndex(layout: Layout, cols: number, rows: number, x: number, y: number): number | null {
  const { cell, gap, originX, originY } = layout;
  const step = cell + gap;
  const col = Math.floor((x - originX) / step);
  const row = Math.floor((y - originY) / step);
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const lx = x - originX - col * step;
  const ly = y - originY - row * step;
  if (lx > cell + 0.5 || ly > cell + 0.5 || lx < -0.5 || ly < -0.5) return null;
  return row * cols + col;
}

export class FieldView {
  fx: CellFx[] = [];
  particles: Particle[] = [];
  trauma = 0;
  flash = 0;
  lastJuiceId = 0;
  time = 0;
  hover = -1;
  press = -1;
  cursor = -1;
  longPress = 0;
  reduced = false;
  private pool: Particle[] = [];

  syncSize(n: number) {
    if (this.fx.length !== n) {
      this.fx = Array.from({ length: n }, () => ({
        reveal: 0,
        flag: 0,
        press: 0,
        mine: 0,
        pop: 0,
      }));
    }
  }

  snap(board: Board) {
    this.syncSize(board.cells.length);
    for (let i = 0; i < board.cells.length; i++) {
      const c = board.cells[i]!;
      const f = this.fx[i]!;
      f.reveal = c.revealed ? 1 : 0;
      f.flag = c.flag === 1 ? 1 : c.flag === 2 ? 0.5 : 0;
      f.press = 0;
      f.mine = board.status === "lost" && c.mine ? 1 : 0;
      f.pop = 0;
    }
  }

  resetFx() {
    for (const f of this.fx) {
      f.reveal = 0;
      f.flag = 0;
      f.press = 0;
      f.mine = 0;
      f.pop = 0;
    }
    this.particles.length = 0;
    this.trauma = 0;
    this.flash = 0;
    this.lastJuiceId = 0;
  }

  ingest(board: Board, juice: JuiceEvent | null, reduced: boolean) {
    this.reduced = reduced;
    this.syncSize(board.cells.length);
    if (juice && juice.id !== this.lastJuiceId) {
      this.lastJuiceId = juice.id;
      this.onJuice(board, juice);
    }
  }

  private onJuice(board: Board, juice: JuiceEvent) {
    const origin = juice.origin ?? 0;
    const { x: ox, y: oy } = xy(board.cols, origin);
    if (juice.kind === "blocked") {
      this.trauma = Math.max(this.trauma, 0.28);
      this.fx[origin]!.pop = 1;
    }
    if (juice.kind === "flag" || juice.kind === "unflag" || juice.kind === "question") {
      this.fx[origin]!.pop = 1;
    }
    if (juice.kind === "boom") {
      this.trauma = 0.85;
      this.flash = 0.7;
      this.burst(board, origin, 28, true);
    }
    if (juice.kind === "win") {
      this.trauma = 0.2;
      this.burst(board, origin, 42, false);
    }
    if (juice.kind === "reveal" || juice.kind === "chord" || juice.kind === "win") {
      for (const i of juice.revealed) {
        const { x, y } = xy(board.cols, i);
        const dist = Math.max(Math.abs(x - ox), Math.abs(y - oy));
        this.fx[i]!.pop = 1;
        if (this.reduced) this.fx[i]!.reveal = 1;
        else this.fx[i]!.reveal = Math.max(this.fx[i]!.reveal, -dist * 0.055);
      }
    }
  }

  private alloc(): Particle {
    return (
      this.pool.pop() ?? {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        max: 1,
        size: 2,
        color: "#ccc",
        rot: 0,
        vr: 0,
      }
    );
  }

  burst(board: Board, origin: number, count: number, hot: boolean) {
    if (this.reduced) return;
    const { x, y } = xy(board.cols, origin);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * (hot ? 220 : 140);
      const p = this.alloc();
      p.x = x + 0.5;
      p.y = y + 0.5;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.life = p.max = 0.4 + Math.random() * 0.5;
      p.size = 1.4 + Math.random() * 2.4;
      p.color = hot
        ? Math.random() > 0.5
          ? "#c45c4a"
          : "#e8c4a8"
        : Math.random() > 0.5
          ? "#c9cdc8"
          : "#6f9e7e";
      p.rot = Math.random() * Math.PI;
      p.vr = (Math.random() - 0.5) * 8;
      this.particles.push(p);
    }
  }

  tick(dt: number, board: Board) {
    const capped = Math.min(dt, 0.1);
    this.time += capped;
    this.trauma = Math.max(0, this.trauma - capped * 1.8);
    this.flash = Math.max(0, this.flash - capped * 2.2);

    for (let i = 0; i < board.cells.length; i++) {
      const c = board.cells[i]!;
      const f = this.fx[i]!;
      const revealTarget = c.revealed ? 1 : 0;
      const flagTarget = c.flag === 1 ? 1 : c.flag === 2 ? 0.5 : 0;
      const pressTarget = this.press === i && !c.revealed ? 1 : 0;
      let mineTarget = 0;
      if (board.status === "lost" && c.mine) {
        const { x, y } = xy(board.cols, i);
        const { x: ox, y: oy } = xy(board.cols, board.exploded ?? 0);
        const dist = Math.hypot(x - ox, y - oy);
        const delay = this.reduced ? 0 : dist * 0.045;
        mineTarget = this.timeSinceLost(board) > delay ? 1 : 0;
      }
      if (board.status === "won" && c.mine) mineTarget = 0;

      const k = this.reduced ? 1 : 1 - Math.exp(-14 * capped);
      if (f.reveal < 0) {
        f.reveal = Math.min(0, f.reveal + capped);
        if (f.reveal >= 0) f.reveal = 0.04;
      } else {
        f.reveal = lerp(f.reveal, revealTarget, k);
      }
      f.flag = lerp(f.flag, flagTarget, k);
      f.press = lerp(f.press, pressTarget, 1 - Math.exp(-18 * capped));
      f.mine = lerp(f.mine, mineTarget, this.reduced ? 1 : 1 - Math.exp(-10 * capped));
      f.pop = Math.max(0, f.pop - capped * 4.2);
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i]!;
      p.life -= capped;
      p.x += p.vx * capped * 0.045;
      p.y += p.vy * capped * 0.045;
      p.vy += 90 * capped * 0.045;
      p.rot += p.vr * capped;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        this.pool.push(p);
      }
    }
  }

  private timeSinceLost(board: Board) {
    if (board.endMs == null) return 0;
    return (performance.now() - board.endMs) / 1000;
  }

  shake(): { x: number; y: number } {
    if (this.reduced || this.trauma <= 0) return { x: 0, y: 0 };
    const mag = this.trauma * this.trauma * 7;
    const t = this.time * 29;
    return { x: Math.sin(t * 1.7) * mag, y: Math.cos(t * 1.9) * mag };
  }
}

function drawFlag(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, t: number) {
  const scale = 0.82 + 0.18 * easeOutBack(clamp(t, 0, 1));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.globalAlpha *= clamp(t * 1.6, 0, 1);
  const poleH = s * 0.46;
  ctx.strokeStyle = "#d8d4cc";
  ctx.lineWidth = Math.max(1.2, s * 0.06);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, poleH * 0.55);
  ctx.lineTo(-s * 0.12, -poleH * 0.55);
  ctx.stroke();
  ctx.fillStyle = "#e8e4dc";
  ctx.beginPath();
  ctx.moveTo(-s * 0.1, -poleH * 0.55);
  ctx.lineTo(s * 0.32, -poleH * 0.18);
  ctx.lineTo(-s * 0.1, s * 0.02);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawWrongX(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.strokeStyle = "#c45c4a";
  ctx.lineWidth = Math.max(1.6, s * 0.08);
  ctx.lineCap = "round";
  const m = s * 0.22;
  ctx.beginPath();
  ctx.moveTo(cx - m, cy - m);
  ctx.lineTo(cx + m, cy + m);
  ctx.moveTo(cx + m, cy - m);
  ctx.lineTo(cx - m, cy + m);
  ctx.stroke();
  ctx.restore();
}

function drawQuestion(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  ctx.save();
  ctx.fillStyle = "#c9cdc8";
  ctx.font = `600 ${Math.floor(s * 0.5)}px Outfit, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", cx, cy + s * 0.03);
  ctx.restore();
}

function drawMine(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  exploded: boolean,
  t: number,
) {
  const a = clamp(t, 0, 1);
  const pop = easeOutBack(a);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(pop, pop);
  ctx.globalAlpha *= a;
  const r = s * 0.22;
  const spikes = 8;
  ctx.fillStyle = exploded ? "#c45c4a" : "#d6d2ca";
  ctx.beginPath();
  for (let i = 0; i < spikes; i++) {
    const ang = (i / spikes) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(ang) * r * 1.55;
    const y = Math.sin(ang) * r * 1.55;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
    const mid = ang + Math.PI / spikes;
    ctx.lineTo(Math.cos(mid) * r * 0.72, Math.sin(mid) * r * 0.72);
  }
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  ctx.fillStyle = exploded ? "#8a3228" : "#1c1d20";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.28, -r * 0.28, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = exploded ? "rgba(255,210,180,0.45)" : "rgba(255,255,255,0.22)";
  ctx.fill();
  ctx.restore();
}

export function drawField(
  ctx: CanvasRenderingContext2D,
  board: Board,
  layout: Layout,
  view: FieldView,
  cssW: number,
  cssH: number,
  dpr: number,
) {
  const { cell, gap, originX, originY } = layout;
  const step = cell + gap;
  const radius = clamp(cell * 0.16, 3, 8);
  const shake = view.shake();

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  ctx.save();
  ctx.translate(shake.x, shake.y);

  const wellX = originX - 10;
  const wellY = originY - 10;
  const wellW = layout.boardW + 20;
  const wellH = layout.boardH + 20;
  roundRect(ctx, wellX, wellY, wellW, wellH, 16);
  ctx.fillStyle = "#0c0d0f";
  ctx.fill();
  ctx.strokeStyle = "rgba(240,239,235,0.08)";
  ctx.lineWidth = 1;
  ctx.stroke();

  for (let i = 0; i < board.cells.length; i++) {
    const c = board.cells[i]!;
    const f = view.fx[i] ?? { reveal: c.revealed ? 1 : 0, flag: 0, press: 0, mine: 0, pop: 0 };
    const { x: col, y: row } = xy(board.cols, i);
    const x = originX + col * step;
    const y = originY + row * step;
    const press = f.press;
    const pop = 1 + f.pop * 0.06;
    const revealedAmt = clamp(f.reveal, 0, 1);
    const hover = view.hover === i && revealedAmt < 0.5 && board.status !== "won" && board.status !== "lost";
    const isCursor = view.cursor === i;

    ctx.save();
    ctx.translate(x + cell / 2, y + cell / 2);
    ctx.scale(pop, pop);
    ctx.translate(-cell / 2, -cell / 2);

    const inset = press * 1.2;
    const grain = hash(i) * 8 - 4;

    if (revealedAmt < 0.97) {
      const lift = hover ? -0.6 : 0;
      const bx = inset;
      const by = inset + lift + press * 0.8;
      const bw = cell - inset * 2;
      const bh = cell - inset * 2;
      const base = hover ? 66 + grain * 0.2 : 58 + grain * 0.3;
      const g = 58 + grain * 0.25;
      roundRect(ctx, bx, by + 1.4, bw, bh, radius);
      ctx.fillStyle = `rgb(${g - 14},${g - 14},${g - 10})`;
      ctx.fill();
      roundRect(ctx, bx, by, bw, bh, radius);
      const lg = ctx.createLinearGradient(bx, by, bx, by + bh);
      lg.addColorStop(0, `rgb(${base + 18},${base + 18},${base + 14})`);
      lg.addColorStop(1, `rgb(${base - 10},${base - 10},${base - 8})`);
      ctx.fillStyle = lg;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.14)";
      ctx.lineWidth = 1;
      roundRect(ctx, bx + 0.6, by + 0.6, bw - 1.2, bh * 0.46, radius * 0.8);
      ctx.stroke();
    }

    if (revealedAmt > 0.02) {
      ctx.globalAlpha = easeOutCubic(revealedAmt);
      const sunk = lerp(4, 0, 1 - revealedAmt);
      roundRect(ctx, sunk * 0.2, sunk * 0.2, cell, cell, radius);
      ctx.fillStyle = i === board.exploded ? "#2a1614" : "#141518";
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      if (c.revealed && !c.mine && c.adjacent > 0 && revealedAmt > 0.55) {
        ctx.fillStyle = NUM_COLORS[c.adjacent] ?? "#c9cdc8";
        ctx.font = `600 ${Math.floor(cell * 0.5)}px Outfit, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(c.adjacent), cell / 2, cell / 2 + 0.5);
      }
    }

    if (f.flag > 0.05 && !c.revealed && !(board.status === "lost" && c.mine)) {
      if (c.flag === 2) drawQuestion(ctx, cell / 2, cell / 2, cell);
      else drawFlag(ctx, cell / 2, cell / 2, cell, f.flag);
    }

    if (board.status === "lost") {
      // Keep flags on correctly marked mines; reveal the rest. Don't stack both.
      if (c.mine && c.flag !== 1) drawMine(ctx, cell / 2, cell / 2, cell, i === board.exploded, f.mine);
      if (c.flag === 1 && !c.mine && board.endMs != null && performance.now() - board.endMs > 280) {
        drawWrongX(ctx, cell / 2, cell / 2, cell);
      }
    }
    if (board.status === "won" && c.mine && !c.revealed) {
      drawFlag(ctx, cell / 2, cell / 2, cell, Math.max(f.flag, 0.85));
    }

    if (isCursor) {
      ctx.strokeStyle = "rgba(201,205,200,0.7)";
      ctx.lineWidth = 1.5;
      roundRect(ctx, 1.2, 1.2, cell - 2.4, cell - 2.4, radius);
      ctx.stroke();
    }

    if (view.longPress > 0 && view.press === i) {
      ctx.strokeStyle = "rgba(201,205,200,0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cell / 2, cell / 2, cell * 0.36, -Math.PI / 2, -Math.PI / 2 + view.longPress * Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  for (const p of view.particles) {
    const px = originX + p.x * step;
    const py = originY + p.y * step;
    ctx.save();
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
    ctx.translate(px, py);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
    ctx.restore();
  }

  ctx.restore();

  if (view.flash > 0.01) {
    ctx.fillStyle = `rgba(255,236,220,${view.flash * 0.22})`;
    ctx.fillRect(0, 0, cssW, cssH);
  }
}
