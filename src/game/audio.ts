let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let sfx: GainNode | null = null;
let unlocked = false;
let volume = 0.7;
let enabled = true;

function ensure(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    master = ctx.createGain();
    sfx = ctx.createGain();
    sfx.connect(master);
    master.connect(ctx.destination);
    applyGain();
  }
  return ctx;
}

function applyGain() {
  if (!master || !ctx) return;
  const g = enabled ? volume * volume : 0;
  master.gain.setTargetAtTime(g, ctx.currentTime, 0.02);
}

export function setAudioEnabled(on: boolean) {
  enabled = on;
  applyGain();
}

export function setAudioVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  applyGain();
}

export function unlockAudio() {
  const c = ensure();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  unlocked = true;
}

export function resumeAudio() {
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function envGain(t0: number, attack: number, decay: number, peak: number): GainNode | null {
  if (!ctx || !sfx) return null;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  g.connect(sfx);
  return g;
}

function tone(freq: number, dur: number, type: OscillatorType, peak: number, attack = 0.004, detune = 0) {
  const c = ensure();
  if (!c || !unlocked || !enabled) return;
  const t0 = c.currentTime;
  const g = envGain(t0, attack, dur, peak);
  if (!g) return;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (detune) o.detune.setValueAtTime(detune, t0);
  o.connect(g);
  o.start(t0);
  o.stop(t0 + attack + dur + 0.02);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

function noiseBurst(dur: number, peak: number, hp = 400, lp = 2400) {
  const c = ensure();
  if (!c || !unlocked || !enabled || !sfx) return;
  const n = Math.floor(c.sampleRate * dur);
  const buffer = c.createBuffer(1, n, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const t0 = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime((hp + lp) / 2, t0);
  filter.Q.value = 0.7;
  const g = envGain(t0, 0.004, dur, peak);
  if (!g) return;
  src.connect(filter);
  filter.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
  src.onended = () => {
    src.disconnect();
    filter.disconnect();
    g.disconnect();
  };
}

export function playReveal(adjacent: number) {
  const f = 520 + adjacent * 38 + (Math.random() * 24 - 12);
  tone(f, 0.06, "triangle", 0.07, 0.003);
  noiseBurst(0.03, 0.03, 1200, 4000);
}

export function playFloodTick() {
  tone(880 + Math.random() * 80, 0.028, "sine", 0.035, 0.002);
}

export function playFlag() {
  tone(340, 0.05, "square", 0.045, 0.003);
  tone(510, 0.08, "triangle", 0.05, 0.008);
}

export function playUnflag() {
  tone(280, 0.05, "triangle", 0.04, 0.003);
}

export function playBlocked() {
  tone(140, 0.09, "sawtooth", 0.05, 0.002);
  noiseBurst(0.05, 0.04, 200, 600);
}

export function playBoom() {
  noiseBurst(0.45, 0.28, 80, 500);
  tone(70, 0.4, "sine", 0.22, 0.01);
  tone(48, 0.55, "sine", 0.16, 0.02);
  tone(180, 0.12, "sawtooth", 0.08, 0.004);
}

export function playWin() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  const c = ensure();
  if (!c || !unlocked || !enabled) return;
  notes.forEach((f, i) => {
    const t0 = c.currentTime + i * 0.09;
    const g = envGain(t0, 0.01, 0.28, 0.08);
    if (!g) return;
    const o = c.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(f, t0);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + 0.32);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  });
}

export function playUi() {
  tone(640, 0.04, "sine", 0.03, 0.002);
}

export function playHover() {
  tone(1200, 0.018, "sine", 0.012, 0.001);
}
