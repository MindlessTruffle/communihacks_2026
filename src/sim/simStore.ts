// Multiplayer simulation: its OWN store. The real run (useGame) is never written to while the sim is open.
import { create } from "zustand";
import { START_STATS, type Visit } from "./simData.ts";

export type Section = "lobby" | "court" | "street" | "market" | "end";
export const ORDER: Section[] = ["lobby", "court", "street", "market", "end"];

/** Section-relative time (seconds). Scenes read this every frame, so everything on screen is a pure function of it. */
export const simClock = { section: "lobby" as Section, t: 0, scale: 1 };
/** Camera position of the sim canvas (for "face the camera" poses). */
export const simCam = { x: 0, y: 5, z: 20 };

interface SimState {
  open: boolean;
  runId: number;
  section: Section;
  /** curtain closed (between sections / while a scene is still compiling) */
  curtain: boolean;
  /** the current section's scene has drawn a frame; its clock only runs once true */
  ready: boolean;
  joined: number[];
  startPressed: boolean;
  visit: number;
  visitStep: "idle" | "ask" | "verdict";
  votes: { yes: number[]; no: number[] };
  verdict: { choice: "yes" | "no"; yes: number; no: number; line: string } | null;
  gold: number; happiness: number; people: number;
  /** last gold change (drives the HUD "+x" float) */
  caption: string | null;
  title: string | null;
  skipReq: number;
  /** speech bubbles over tagged actors (index N, N+1 = street NPCs) */
  bubbles: Record<number, string>;
  saved: number;
  begin(): void;
  exit(): void;
  replay(): void;
  patch(p: Partial<SimState>): void;
}

const fresh = () => ({
  section: "lobby" as Section, curtain: false, ready: false, joined: [] as number[], startPressed: false,
  visit: -1, visitStep: "idle" as const, votes: { yes: [] as number[], no: [] as number[] }, verdict: null,
  ...START_STATS, caption: null, title: null, skipReq: 0, bubbles: {}, saved: 0,
});

export const useSim = create<SimState>((set) => ({
  open: false, runId: 0, ...fresh(),
  begin() {
    try { document.exitPointerLock?.(); } catch { /* ignore */ }
    simClock.section = "lobby"; simClock.t = 0;
    set((s) => ({ open: true, runId: s.runId + 1, ...fresh() }));
  },
  exit() { set({ open: false }); },
  replay() { simClock.section = "lobby"; simClock.t = 0; set((s) => ({ runId: s.runId + 1, ...fresh() })); },
  patch: (p) => set(p as never),
}));

export type { Visit };

// While the sim is open the paused game must not hear the keyboard (Y/N/Space/E/WASD would otherwise reach the hidden court UI and change
// the real run). This capture listener is registered at import time, before any game listener, and swallows everything except Esc (= leave).
if (typeof window !== "undefined") {
  const block = (e: KeyboardEvent) => {
    if (!useSim.getState().open) return;
    if (e.type === "keydown" && e.key === "Escape") { if (!e.repeat) useSim.getState().exit(); }
    e.stopImmediatePropagation();
  };
  window.addEventListener("keydown", block, true);
  window.addEventListener("keyup", block, true);
}

// Debug handle for automated testing (dev builds only, like window.__rc).
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as { __sim: unknown }).__sim = { useSim, simClock };
