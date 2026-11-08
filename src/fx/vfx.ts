// Game-feel VFX bus. Tiny pub/sub: callers say WHAT happened and WHERE; Vfx2D (canvas overlay) and Vfx3D (instanced
// billboards inside the R3F scene) decide how to draw it. See handoff-notes/vfx.md.
import type { Vector3 } from "three";
import { useGame } from "../game/store.ts";
import { QUALITY } from "../scenes/look.tsx";

export type VfxKind = "confetti" | "coins" | "sparkle" | "hearts" | "dust" | "ripple" | "stars";
export interface ScreenPt { x: number; y: number }
/** Screen px {x,y}, a DOM element (its centre), or a world position (THREE.Vector3 or any {x,y,z}). */
export type VfxAt = ScreenPt | Element | Vector3 | { x: number; y: number; z: number };
export interface VfxOpts {
  /** particle count override (still scaled by quality tier and capped) */
  n?: number;
  /** size multiplier. 3D: world scale (1 = person-sized scene, ~4 in the court). 2D: ignored. */
  scale?: number;
  /** 3D only: particle size multiplier on top of `scale` (bigger bits without flying further). */
  size?: number;
  /** spawn spread radius (3D world units / 2D px) */
  spread?: number;
}

export type VfxEvent =
  | { type: "burst2d"; kind: VfxKind; x: number; y: number; opts: VfxOpts }
  | { type: "burst3d"; kind: VfxKind; x: number; y: number; z: number; opts: VfxOpts }
  | { type: "coinsTo"; el: Element | null; n: number; from?: ScreenPt }
  | { type: "ripple"; x: number; y: number };

type Listener = (e: VfxEvent) => void;
const listeners = new Set<Listener>();
const emit = (e: VfxEvent) => listeners.forEach((l) => l(e));

/** 1 on the high tier, 0.5 on the low tier. Multiply every particle count by this. */
export const quality = () => (QUALITY === "low" ? 0.5 : 1);
export const reduced = () => useGame.getState().settings.reduceMotion;

export const vfx = {
  /** Subscribe to every effect request (used by Vfx2D / Vfx3D). Returns an unsubscribe fn. */
  on(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },

  /** Burst of `kind` at `at` (screen px / element / world position). */
  burst(kind: VfxKind, at: VfxAt, opts: VfxOpts = {}) {
    if (typeof Element !== "undefined" && at instanceof Element) {
      const r = at.getBoundingClientRect();
      emit({ type: "burst2d", kind, x: r.left + r.width / 2, y: r.top + r.height / 2, opts });
    } else if ("z" in at) {
      emit({ type: "burst3d", kind, x: at.x, y: at.y, z: at.z, opts });
    } else { const p = at as ScreenPt; emit({ type: "burst2d", kind, x: p.x, y: p.y, opts }); }
  },

  /** `n` coins fly in an arc from `from` (default: lower centre of the screen) into `targetEl` (e.g. the gold stat). */
  coinsTo(targetEl: Element | null, n = 6, from?: ScreenPt) { emit({ type: "coinsTo", el: targetEl, n, from }); },

  /** Hand-inked tap ring (Vfx2D already fires this on every pointerdown). */
  ripple(x: number, y: number) { emit({ type: "ripple", x, y }); },

  /** Screen point from viewport percentages (0..100). Handy for "centre of the screen" bursts. */
  pct(px: number, py: number): ScreenPt { return { x: (innerWidth * px) / 100, y: (innerHeight * py) / 100 }; },

  /** The gold / happiness / people stat element in the HUD (null when the HUD is not mounted). */
  stat(kind: "gold" | "happiness" | "people"): HTMLElement | null { return document.querySelector<HTMLElement>(`[data-stat="${kind}"]`); },
};
