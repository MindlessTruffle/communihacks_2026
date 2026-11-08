// 2D VFX layer: one pointer-events:none canvas at the toast z-level. Pooled + capped particles, rAF loop that only runs while
// something is alive. Hand-inked look: soft warm fills with a brown ink outline. Reduce motion => bursts become a static glow.
import { useEffect, useRef } from "react";
import { useGame } from "../game/store.ts";
import { QUALITY } from "../scenes/look.tsx";
import { vfx, quality, reduced, type VfxKind, type VfxEvent, type ScreenPt, type VfxOpts } from "./vfx.ts";
import "./vfx.css";

const INK = "#4a2e18";
const MAX = QUALITY === "low" ? 120 : 260;
const CONFETTI = ["#ffcf4a", "#ff9a62", "#f27a9a", "#86d494", "#7fc6ea", "#b9a0f0", "#fff0c2"];
const GOLD = ["#ffd45a", "#ffbf3a", "#fff0a8"];
const PINKS = ["#ff8fae", "#ff6f96", "#ffb3c6"];
const DUSTC = ["#e8d6b4", "#d9c39b", "#f2e6cc"];

type Shape = "conf" | "coin" | "star" | "heart" | "spark" | "blob" | "glow" | "ring" | "fly";
interface P {
  on: boolean; shape: Shape; x: number; y: number; vx: number; vy: number; g: number; drag: number;
  rot: number; spin: number; size: number; size1: number; life: number; age: number; delay: number; col: string; a: number;
  sway: number;
  // flying coin bezier + arrival
  x0: number; y0: number; cx: number; cy: number; x1: number; y1: number; el: Element | null;
}
const pool: P[] = Array.from({ length: MAX }, () => ({
  on: false, shape: "blob" as Shape, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, rot: 0, spin: 0, size: 0, size1: 0, life: 1, age: 0, delay: 0,
  col: "#fff", a: 1, sway: 0, x0: 0, y0: 0, cx: 0, cy: 0, x1: 0, y1: 0, el: null,
}));
let cursor = 0;
function spawn(shape: Shape, col: string): P {
  const p = pool[cursor]; cursor = (cursor + 1) % MAX; // ring buffer: the oldest particle is recycled when the cap is hit
  p.on = true; p.shape = shape; p.col = col; p.age = 0; p.delay = 0; p.a = 1; p.g = 0; p.drag = 0; p.vx = 0; p.vy = 0;
  p.rot = 0; p.spin = 0; p.sway = 0; p.el = null; p.size1 = -1;
  return p;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const unit = () => Math.min(1.4, Math.max(0.7, innerHeight / 720));

function pop(el0: Element | null) {
  if (!el0) return;
  // Hud remounts a stat on every change (key=bump), so re-find the live element by its data-stat when the captured one is gone.
  const el = el0.isConnected ? el0 : document.querySelector(`[data-stat="${el0.getAttribute("data-stat")}"]`);
  if (!el) return;
  el.classList.remove("vfx-hit"); void (el as HTMLElement).offsetWidth; el.classList.add("vfx-hit");
  setTimeout(() => el.classList.remove("vfx-hit"), 700);
}

function glow(x: number, y: number, col: string, size = 70) {
  const p = spawn("glow", col); p.x = x; p.y = y; p.size = size * 0.7; p.size1 = size; p.life = 0.8;
}

function burst(kind: VfxKind, x: number, y: number, opts: VfxOpts) {
  const u = unit();
  const cnt = (d: number) => Math.max(1, Math.round((opts.n ?? d) * quality()));
  if (reduced()) { // gentle static glow instead of motion
    if (kind === "dust") return;
    if (kind === "ripple") { const p = spawn("ring", INK); p.x = x; p.y = y; p.size = 16 * u; p.size1 = 16 * u; p.life = 0.5; return; }
    glow(x, y, kind === "hearts" ? "#ff9bb5" : "#ffd66b", 64 * u);
    return;
  }
  switch (kind) {
    case "confetti":
      for (let i = 0, n = cnt(34); i < n; i++) {
        const r = Math.random(); const p = spawn(r < 0.6 ? "conf" : r < 0.78 ? "star" : "blob", pick(CONFETTI));
        const ang = -Math.PI / 2 + rnd(-1.15, 1.15), sp = rnd(260, 620) * u;
        p.x = x + rnd(-8, 8); p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.g = 820 * u; p.drag = 1.3;
        p.rot = rnd(0, 6.28); p.spin = rnd(-7, 7); p.size = rnd(7, 12) * u; p.life = rnd(1.4, 2.1); p.sway = rnd(0, 6.28);
        if (p.shape === "blob") p.size *= 0.8;
      }
      break;
    case "coins":
      for (let i = 0, n = cnt(9); i < n; i++) {
        const p = spawn("coin", pick(GOLD)); const ang = -Math.PI / 2 + rnd(-0.7, 0.7), sp = rnd(300, 520) * u;
        p.x = x; p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp; p.g = 1100 * u; p.drag = 0.6;
        p.spin = rnd(5, 9); p.rot = rnd(0, 6.28); p.size = rnd(10, 14) * u; p.life = rnd(0.9, 1.2);
      }
      break;
    case "sparkle":
      for (let i = 0, n = cnt(14); i < n; i++) {
        const p = spawn(i % 3 ? "spark" : "blob", pick(GOLD)); const ang = rnd(0, 6.28), sp = rnd(50, 190) * u;
        p.x = x + Math.cos(ang) * 6; p.y = y + Math.sin(ang) * 6; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 20; p.drag = 2.6;
        p.rot = rnd(0, 1.5); p.spin = rnd(-2, 2); p.size = (p.shape === "blob" ? rnd(3, 6) : rnd(8, 15)) * u; p.size1 = 0; p.life = rnd(0.7, 1.1);
      }
      break;
    case "hearts":
      for (let i = 0, n = cnt(7); i < n; i++) {
        const p = spawn("heart", pick(PINKS));
        p.x = x + rnd(-26, 26) * u; p.y = y + rnd(-6, 10); p.vx = rnd(-20, 20); p.vy = -rnd(90, 170) * u; p.drag = 0.4;
        p.rot = rnd(-0.4, 0.4); p.size = rnd(11, 18) * u; p.life = rnd(1.2, 1.7); p.sway = rnd(0, 6.28); p.delay = i * 0.06;
      }
      break;
    case "dust":
      for (let i = 0, n = cnt(7); i < n; i++) {
        const p = spawn("blob", pick(DUSTC)); const ang = rnd(0, 6.28), sp = rnd(20, 80) * u;
        p.x = x; p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp * 0.6 - 25; p.drag = 2.2;
        p.size = rnd(5, 9) * u; p.size1 = p.size * 2.6; p.life = rnd(0.5, 0.8); p.a = 0.5;
      }
      break;
    case "ripple": { const p = spawn("ring", INK); p.x = x; p.y = y; p.size = 10 * u; p.size1 = 54 * u; p.life = 0.6; p.rot = rnd(0, 6); break; }
    case "stars":
      for (let i = 0, n = cnt(14); i < n; i++) {
        const p = spawn("star", i % 2 ? "#ffd45a" : "#ffb347"); const ang = rnd(0, 6.28), sp = rnd(140, 340) * u;
        p.x = x; p.y = y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp - 90; p.g = 380 * u; p.drag = 1.6;
        p.rot = rnd(-0.6, 0.6); p.spin = rnd(-3, 3); p.size = rnd(9, 15) * u; p.life = rnd(0.9, 1.3);
      }
      break;
  }
}

function coinsTo(el: Element | null, n: number, from?: ScreenPt) {
  const u = unit();
  let tx = innerWidth * 0.1, ty = innerHeight * 0.9;
  if (el) { const r = el.getBoundingClientRect(); if (r.width > 0) { tx = r.left + r.width / 2; ty = r.top + r.height / 2; } }
  if (reduced()) { setTimeout(() => { glow(tx, ty, "#ffd66b", 60 * u); pop(el); wake(); }, 250); return; }
  const f = from ?? { x: innerWidth * 0.5, y: innerHeight * 0.62 };
  const count = Math.max(2, Math.round(Math.min(n, 14) * quality()));
  for (let i = 0; i < count; i++) {
    const p = spawn("fly", pick(GOLD));
    p.x0 = f.x + rnd(-40, 40) * u; p.y0 = f.y + rnd(-20, 20) * u; p.x1 = tx; p.y1 = ty;
    p.cx = (p.x0 + tx) / 2 + rnd(-90, 90) * u; p.cy = Math.min(p.y0, ty) - rnd(90, 190) * u;
    p.life = rnd(0.7, 0.95); p.delay = i * 0.07; p.size = rnd(11, 14) * u; p.spin = rnd(6, 10); p.rot = rnd(0, 6.28); p.el = el;
    p.x = p.x0; p.y = p.y0; p.a = 0;
  }
}

let wake: () => void = () => {};

// ------------------------------------------------------------------ drawing
function path(ctx: CanvasRenderingContext2D, shape: Shape, s: number) {
  ctx.beginPath();
  if (shape === "star") {
    for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.45 : s, a = (i / 10) * 6.283 - 1.5708; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  } else if (shape === "heart") {
    ctx.moveTo(0, s * 0.85);
    ctx.bezierCurveTo(-s * 1.25, s * 0.1, -s * 0.7, -s * 0.95, 0, -s * 0.35);
    ctx.bezierCurveTo(s * 0.7, -s * 0.95, s * 1.25, s * 0.1, 0, s * 0.85);
    ctx.closePath();
  } else if (shape === "spark") {
    ctx.moveTo(0, -s); ctx.quadraticCurveTo(0, 0, s, 0); ctx.quadraticCurveTo(0, 0, 0, s); ctx.quadraticCurveTo(0, 0, -s, 0); ctx.quadraticCurveTo(0, 0, 0, -s);
    ctx.closePath();
  } else if (shape === "conf") {
    ctx.rect(-s * 0.55, -s * 0.28, s * 1.1, s * 0.56);
  } else ctx.arc(0, 0, s, 0, 6.283);
}

function draw(ctx: CanvasRenderingContext2D, p: P, t: number) {
  const u = p.age / p.life;
  const size = p.size1 >= 0 ? p.size + (p.size1 - p.size) * u : p.size;
  const alpha = p.a * Math.min(1, p.age / 0.06) * (u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1);
  if (alpha <= 0.01 || size <= 0) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.translate(p.x, p.y);
  switch (p.shape) {
    case "glow": {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      g.addColorStop(0, p.col); g.addColorStop(1, "rgba(255,214,107,0)");
      ctx.globalAlpha = Math.sin(Math.min(1, u) * Math.PI) * 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.283); ctx.fill();
      break;
    }
    case "ring": { // hand-inked wobbly ring: dark outline + cream inner highlight
      const n = 18; const w = (r: number) => {
        ctx.beginPath();
        for (let i = 0; i <= n; i++) { const a = (i / n) * 6.283, rr = r * (1 + Math.sin(a * 3 + p.rot) * 0.06 + Math.sin(a * 5 + p.rot * 2) * 0.03); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      };
      ctx.globalAlpha = Math.min(1, alpha) * 0.85;
      w(size); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.stroke();
      w(size - 2.8); ctx.lineWidth = 2.4; ctx.strokeStyle = "#fff3d0"; ctx.stroke();
      break;
    }
    case "blob": {
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, size);
      g.addColorStop(0, p.col); g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.283); ctx.fill();
      break;
    }
    case "fly":
    case "coin": {
      ctx.scale(Math.max(0.18, Math.abs(Math.cos(p.rot))), 1);
      ctx.beginPath(); ctx.arc(0, 0, size, 0, 6.283); ctx.fillStyle = p.col; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, size * 0.55, 0, 6.283); ctx.lineWidth = 1.4; ctx.strokeStyle = "#b47a14"; ctx.stroke();
      ctx.beginPath(); ctx.arc(-size * 0.3, -size * 0.3, size * 0.2, 0, 6.283); ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.fill();
      break;
    }
    default: {
      ctx.rotate(p.rot);
      if (p.shape === "conf") ctx.scale(1, Math.max(0.25, Math.abs(Math.cos(t * 5 + p.sway))));
      path(ctx, p.shape, size);
      ctx.fillStyle = p.col; ctx.fill();
      if (p.shape !== "spark") { ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.globalAlpha = Math.min(1, alpha) * 0.7; ctx.stroke(); }
    }
  }
  ctx.restore();
}

export function Vfx2D() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    const dpr = QUALITY === "low" ? 1 : Math.min(2, window.devicePixelRatio || 1);
    const size = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; };
    size(); addEventListener("resize", size);
    let raf = 0, last = 0, t = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; t += dt;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
      let alive = 0;
      for (const p of pool) {
        if (!p.on) continue;
        alive++;
        if (p.delay > 0) { p.delay -= dt; continue; }
        p.age += dt;
        if (p.age >= p.life) {
          p.on = false;
          if (p.shape === "fly") { pop(p.el); burst("sparkle", p.x1, p.y1, { n: 3 }); }
          continue;
        }
        if (p.shape === "fly") { // quadratic bezier arc into the stat; smoothstep so the coins accelerate then settle
          const u = p.age / p.life, e = u * u * (3 - 2 * u), m = 1 - e;
          p.x = m * m * p.x0 + 2 * m * e * p.cx + e * e * p.x1; p.y = m * m * p.y0 + 2 * m * e * p.cy + e * e * p.y1;
          p.rot += p.spin * dt; p.a = Math.min(1, u * 8);
        } else {
          p.vy += p.g * dt; const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k;
          p.x += (p.vx + (p.sway && p.shape === "heart" ? Math.sin(t * 3 + p.sway) * 18 : 0)) * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        }
        draw(ctx, p, t);
      }
      raf = alive ? requestAnimationFrame(loop) : 0;
      if (!alive) ctx.clearRect(0, 0, innerWidth, innerHeight);
    };
    wake = () => { if (!raf) { last = performance.now(); raf = requestAnimationFrame(loop); } };

    const offBus = vfx.on((e: VfxEvent) => {
      if (e.type === "burst2d") burst(e.kind, e.x, e.y, e.opts);
      else if (e.type === "coinsTo") coinsTo(e.el, e.n, e.from);
      else if (e.type === "ripple") burst("ripple", e.x, e.y, {});
      else return;
      wake();
    });

    // click / tap ripple on every pointerdown
    const pd = (e: PointerEvent) => { if (e.isPrimary) vfx.ripple(e.clientX, e.clientY); };
    addEventListener("pointerdown", pd, true);

    // Store hooks (no store edits): fx bus + stat deltas
    const un = useGame.subscribe((s, p) => {
      if (s.fx && s.fx !== p.fx) {
        if (s.fx.kind === "kindness") { vfx.burst("hearts", vfx.pct(50, 58)); vfx.burst("sparkle", vfx.pct(50, 50), { n: 12 }); }
        else if (s.fx.kind === "coins") vfx.burst("confetti", vfx.pct(50, 42), { n: 30 });
      }
      const r = s.run, pr = p.run;
      if (!r || !pr || r === pr || r.seed !== pr.seed) return;
      const dg = r.gold - pr.gold, dh = r.happiness - pr.happiness, dp = r.people - pr.people;
      const at = (k: "gold" | "happiness" | "people") => vfx.stat(k) ?? vfx.pct(8, 88);
      if (dg > 0) {
        const el = vfx.stat("gold"), shown = !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
        if (shown) vfx.coinsTo(el, Math.min(12, Math.max(3, Math.ceil(dg / 5))));
        else vfx.burst("coins", vfx.pct(50, 58)); // HUD not on screen (conversation, minigame): coins pop where the player is looking
      }
      if (dh > 0) vfx.burst("hearts", at("happiness"), { n: Math.min(6, 2 + Math.ceil(dh / 4)) });
      if (dp > 0) vfx.burst("sparkle", at("people"), { n: 8 });
      if (dg < 0 || dh < 0 || dp < 0) { const k = dg < 0 ? "gold" : dh < 0 ? "happiness" : "people"; vfx.burst("dust", at(k), { n: 4 }); }
    });
    return () => { offBus(); un(); removeEventListener("pointerdown", pd, true); removeEventListener("resize", size); cancelAnimationFrame(raf); raf = 0; };
  }, []);
  return <canvas ref={ref} className="vfx2d" aria-hidden="true" />;
}
