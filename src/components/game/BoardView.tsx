import { useCallback, useEffect, useRef } from "react";
import {
  computeLayout,
  drawField,
  FieldView,
  hitIndex,
  type Layout,
  type ViewCam,
} from "@/game/renderer";
import { useGame } from "@/game/store";

const LONG_MS = 420;
const TAP_SLOP_MOUSE = 12;
const TAP_SLOP_TOUCH = 30;

export function BoardView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hitRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef(new FieldView());
  const camRef = useRef<ViewCam>({ zoom: 1, panX: 0, panY: 0, userZoomed: false });
  const layoutRef = useRef<Layout | null>(null);
  const board = useGame((s) => s.board);
  const juice = useGame((s) => s.juice);
  const settings = useGame((s) => s.settings);
  const overlay = useGame((s) => s.overlay);

  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const press = useRef<{
    id: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    index: number | null;
    at: number;
    moved: boolean;
    panned: boolean;
    long: boolean;
    timer: number | null;
    pointerType: string;
  } | null>(null);
  const lastTap = useRef<{ index: number; at: number } | null>(null);
  const lastAct = useRef(0);
  const lastTs = useRef(0);
  const boardRef = useRef(board);
  const juiceRef = useRef(juice);
  const reducedRef = useRef(settings.reducedMotion);
  boardRef.current = board;
  juiceRef.current = juice;
  reducedRef.current = settings.reducedMotion;

  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    sizeRef.current = { w: rect.width, h: rect.height, dpr };
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
  }, []);

  useEffect(() => {
    resize();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [resize]);

  useEffect(() => {
    viewRef.current.resetFx();
    if (board) viewRef.current.snap(board);
    camRef.current = { zoom: 1, panX: 0, panY: 0, userZoomed: false };
  }, [board?.seed, board?.cols, board?.rows, board?.mines]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const loop = (ts: number) => {
      const dt = lastTs.current ? (ts - lastTs.current) / 1000 : 0.016;
      lastTs.current = ts;
      const b = boardRef.current;
      const { w, h, dpr } = sizeRef.current;
      if (b && w > 0) {
        const view = viewRef.current;
        view.ingest(b, juiceRef.current, reducedRef.current);
        view.tick(dt, b);
        const layout = computeLayout(w, h, b.cols, b.rows, camRef.current);
        layoutRef.current = layout;
        drawField(ctx, b, layout, view, w, h, dpr);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const hit = hitRef.current;
    if (!hit) return;

    const slopFor = (type: string) => (type === "mouse" ? TAP_SLOP_MOUSE : TAP_SLOP_TOUCH);

    const localPoint = (e: PointerEvent | MouseEvent) => {
      const r = hit.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    const ensureLayout = () => {
      if (layoutRef.current) return layoutRef.current;
      const b = boardRef.current;
      const { w, h } = sizeRef.current;
      if (!b || w <= 0) return null;
      const layout = computeLayout(w, h, b.cols, b.rows, camRef.current);
      layoutRef.current = layout;
      return layout;
    };

    const indexAt = (x: number, y: number) => {
      const b = boardRef.current;
      const layout = ensureLayout();
      if (!b || !layout) return null;
      return hitIndex(layout, b.cols, b.rows, x, y);
    };

    const clearLong = () => {
      if (press.current?.timer != null) {
        window.clearInterval(press.current.timer);
        press.current.timer = null;
      }
      viewRef.current.longPress = 0;
    };

    const actTap = (index: number) => {
      const { board: b, overlay: ov, flagMode } = useGame.getState();
      if (!b || ov) return;
      if (b.status === "won" || b.status === "lost") return;
      const cell = b.cells[index];
      if (!cell) return;
      lastAct.current = performance.now();
      const now = lastAct.current;
      const prev = lastTap.current;
      if (prev && prev.index === index && now - prev.at < 320 && cell.revealed) {
        useGame.getState().chord(index);
        lastTap.current = null;
        return;
      }
      lastTap.current = { index, at: now };
      if (cell.revealed) {
        useGame.getState().chord(index);
        return;
      }
      if (flagMode) useGame.getState().flag(index);
      else useGame.getState().reveal(index);
    };

    const onDown = (e: PointerEvent) => {
      if (useGame.getState().overlay) return;
      if (e.pointerType !== "mouse") e.preventDefault();
      const p = localPoint(e);
      pointers.current.set(e.pointerId, p);

      if (pointers.current.size === 2) {
        const pts = [...pointers.current.values()];
        const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        pinch.current = { dist: d, zoom: camRef.current.zoom };
        clearLong();
        return;
      }

      const index = indexAt(p.x, p.y);
      viewRef.current.press = index ?? -1;
      viewRef.current.hover = index ?? -1;

      if (e.button === 1 || e.buttons === 3) {
        if (index != null) useGame.getState().chord(index);
        return;
      }
      if (e.button === 2) {
        if (index != null) useGame.getState().flag(index);
        return;
      }

      const now = performance.now();
      press.current = {
        id: e.pointerId,
        x: p.x,
        y: p.y,
        lastX: p.x,
        lastY: p.y,
        index,
        at: now,
        moved: false,
        panned: false,
        long: false,
        timer: null,
        pointerType: e.pointerType,
      };

      const settingsNow = useGame.getState().settings;
      if (settingsNow.longPress && e.pointerType !== "mouse") {
        const start = now;
        press.current.timer = window.setInterval(() => {
          const pr = press.current;
          if (!pr || pr.moved) return;
          const t = (performance.now() - start) / LONG_MS;
          viewRef.current.longPress = Math.min(1, t);
          if (t >= 1 && !pr.long && pr.index != null) {
            pr.long = true;
            viewRef.current.longPress = 0;
            const { flagMode } = useGame.getState();
            if (flagMode) useGame.getState().reveal(pr.index);
            else useGame.getState().flag(pr.index);
            clearLong();
          }
        }, 16);
      }
    };

    const onMove = (e: PointerEvent) => {
      const p = localPoint(e);
      pointers.current.set(e.pointerId, p);

      if (pointers.current.size === 2 && pinch.current) {
        const pts = [...pointers.current.values()];
        const d = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
        const ratio = d / Math.max(1, pinch.current.dist);
        camRef.current.zoom = Math.min(2.6, Math.max(0.7, pinch.current.zoom * ratio));
        camRef.current.userZoomed = true;
        return;
      }

      const pr = press.current;
      if (pr && pr.id === e.pointerId) {
        const dx = p.x - pr.x;
        const dy = p.y - pr.y;
        if (Math.hypot(dx, dy) > slopFor(pr.pointerType)) {
          pr.moved = true;
          clearLong();
          viewRef.current.press = -1;
          const b = boardRef.current;
          const layout = layoutRef.current;
          if (
            b &&
            layout &&
            (layout.boardW > sizeRef.current.w - 8 ||
              layout.boardH > sizeRef.current.h - 8 ||
              camRef.current.zoom > 1.02)
          ) {
            pr.panned = true;
            camRef.current.panX += p.x - pr.lastX;
            camRef.current.panY += p.y - pr.lastY;
            camRef.current.userZoomed = true;
          }
          pr.lastX = p.x;
          pr.lastY = p.y;
        }
      } else if (e.pointerType === "mouse") {
        viewRef.current.hover = indexAt(p.x, p.y) ?? -1;
      }
    };

    const endPress = (e: PointerEvent, cancelled: boolean) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      const pr = press.current;
      viewRef.current.press = -1;
      viewRef.current.longPress = 0;
      clearLong();
      if (!pr || pr.id !== e.pointerId) return;
      press.current = null;
      if (pr.long || pr.panned || useGame.getState().overlay) return;
      if (e.button === 1 || e.button === 2) return;

      const p = localPoint(e);
      const dist = Math.hypot(p.x - pr.x, p.y - pr.y);
      const slop = slopFor(pr.pointerType);
      // Android WebViews often fire pointercancel instead of pointerup.
      if (cancelled && dist > slop * 2) return;
      if (!cancelled && pr.moved && dist > slop * 3) return;
      const index = pr.index ?? indexAt(p.x, p.y);
      if (index == null) return;
      actTap(index);
    };

    const onUp = (e: PointerEvent) => endPress(e, false);
    const onCancel = (e: PointerEvent) => endPress(e, true);

    const onClick = (e: MouseEvent) => {
      if (useGame.getState().overlay) return;
      if (performance.now() - lastAct.current < 400) return;
      const p = localPoint(e);
      const index = indexAt(p.x, p.y);
      if (index == null) return;
      e.preventDefault();
      actTap(index);
    };

    const onContext = (e: Event) => e.preventDefault();

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    hit.addEventListener("pointerdown", onDown, opts);
    hit.addEventListener("pointermove", onMove, opts);
    hit.addEventListener("pointerup", onUp, opts);
    hit.addEventListener("pointercancel", onCancel, opts);
    hit.addEventListener("click", onClick, opts);
    hit.addEventListener("contextmenu", onContext, opts);

    return () => {
      hit.removeEventListener("pointerdown", onDown, opts);
      hit.removeEventListener("pointermove", onMove, opts);
      hit.removeEventListener("pointerup", onUp, opts);
      hit.removeEventListener("pointercancel", onCancel, opts);
      hit.removeEventListener("click", onClick, opts);
      hit.removeEventListener("contextmenu", onContext, opts);
      clearLong();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useGame.getState().overlay) return;
      const b = boardRef.current;
      if (!b) return;
      const view = viewRef.current;
      const cols = b.cols;
      const n = b.cells.length;
      const move = (dx: number, dy: number) => {
        if (view.cursor < 0) view.cursor = Math.floor(n / 2);
        else {
          const x = view.cursor % cols;
          const y = Math.floor(view.cursor / cols);
          const nx = Math.min(cols - 1, Math.max(0, x + dx));
          const ny = Math.min(b.rows - 1, Math.max(0, y + dy));
          view.cursor = ny * cols + nx;
        }
      };
      if (e.code === "ArrowLeft") {
        e.preventDefault();
        move(-1, 0);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        move(1, 0);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        move(0, -1);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        move(0, 1);
      } else if (e.code === "KeyF") {
        if (view.cursor >= 0) useGame.getState().flag(view.cursor);
      } else if (e.code === "Enter" || e.code === "Space") {
        e.preventDefault();
        if (view.cursor >= 0) {
          if (e.shiftKey) useGame.getState().chord(view.cursor);
          else useGame.getState().reveal(view.cursor);
        }
      } else if (e.code === "KeyC") {
        if (view.cursor >= 0) useGame.getState().chord(view.cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={wrapRef} className="relative z-0 min-h-0 min-w-0 flex-1 touch-none">
      <canvas
        ref={canvasRef}
        className="pointer-events-none block h-full w-full select-none"
        aria-hidden="true"
      />
      <div
        ref={hitRef}
        data-testid="minefield"
        role="application"
        aria-label="Campo minado"
        className="absolute inset-0 touch-none select-none"
        style={{
          touchAction: "none",
          pointerEvents: overlay ? "none" : "auto",
          cursor: "pointer",
        }}
      />
    </div>
  );
}
