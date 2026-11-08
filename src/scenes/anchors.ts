// Screen-space anchors for DOM UI that must sit near 3D things (e.g. thought bubble above the ruler),
// plus the title -> court camera descent progress (written by ui/Title.tsx, read by CourtScene's camera).
import { create } from "zustand";
export const useAnchors = create<{ ruler: [number, number]; owl: [number, number]; set(k: "ruler" | "owl", v: [number, number]): void }>((set) => ({
  ruler: [22, 30],
  owl: [38, 38], // advisor owl head, screen % (CourtScene re-projects on every reframe) so UI can keep bubbles off it
  set: (k, v) => set({ [k]: v } as never),
}));

/** 0 = camera up in the sky over the peaks (title), 1 = settled court camera. Raw linear time; the camera applies the quintic ease. */
export const intro = { progress: 0 };
export const smoothProgress = (t: number) => { const p = Math.max(0, Math.min(1, t)); return p < 0.5 ? 16 * p ** 5 : 1 - Math.pow(-2 * p + 2, 5) / 2; };
