// Multiplayer simulation: the ten gummy players (poses are pure functions of the section clock), icon pops over heads,
// and the name-tag projector (DOM labels positioned every frame, de-cluttered so they never overlap).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GummyCharacter } from "../characters/gummy/GummyCharacter.tsx";
import { PLAYERS, N } from "./simData.ts";
import { simClock, useSim } from "./simStore.ts";

export interface Pose {
  x: number; z: number; y?: number;
  /** facing (radians, 0 = toward +z). Walking players face their direction of travel instead. */
  rot?: number;
  /** "auto" = walk while moving, idle otherwise */
  anim?: string;
  speed?: number;
  scale?: number;
  hide?: boolean;
  icon?: { name: string; k: number } | null;
}
export type PoseFn = (i: number, t: number) => Pose;

/** World-space head-top of every actor (+ index N for the street NPC): read by the tag projector. */
export const heads: { pos: THREE.Vector3; vis: boolean }[] = Array.from({ length: N + 2 }, () => ({ pos: new THREE.Vector3(), vis: false }));

const texCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
function iconTex(name: string) {
  let t = texCache.get(name);
  if (!t) { t = loader.load(`/ui/icons/${name}.png`); t.colorSpace = THREE.SRGBColorSpace; texCache.set(name, t); }
  return t;
}

const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const SimActor = memo(function SimActor({ i, pose, scale, headY = 0.5, locomotion = true }: { i: number; pose: PoseFn; scale: number; headY?: number; locomotion?: boolean }) {
  const p = PLAYERS[i];
  const outer = useRef<THREE.Group>(null!);
  const sprite = useRef<THREE.Sprite>(null!);
  const [anim, setAnim] = useState("idle");
  const [speed, setSpeed] = useState(1);
  const st = useRef({ x: NaN, z: NaN, v: 0, rot: 0, anim: "idle", speed: 1, icon: "" });
  const mat = useMemo(() => new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }), []);
  useEffect(() => () => mat.dispose(), [mat]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1), s = st.current, g = outer.current;
    if (!g) return;
    const po = pose(i, simClock.t);
    if (Number.isNaN(s.x)) { s.x = po.x; s.z = po.z; s.rot = po.rot ?? 0; }
    const vx = (po.x - s.x) / Math.max(dt, 1e-3), vz = (po.z - s.z) / Math.max(dt, 1e-3);
    const sp = Math.hypot(vx, vz);
    s.v += (sp - s.v) * Math.min(1, dt * 12);
    const moving = s.v > 0.5 && dt > 0;
    s.x = po.x; s.z = po.z;
    let target = po.rot ?? s.rot;
    if (moving && sp > 0.6) target = Math.atan2(vx, vz);
    s.rot += angDiff(target, s.rot) * Math.min(1, dt * 11);
    g.position.set(po.x, po.y ?? 0, po.z);
    g.rotation.y = s.rot;
    const k = po.scale ?? 1;
    g.scale.setScalar(Math.max(0.001, k));
    g.visible = !po.hide && k > 0.02;
    const want = po.anim && po.anim !== "auto" ? po.anim : moving ? "walk" : "idle";
    if (want !== s.anim) { s.anim = want; setAnim(want); }
    const spd = po.speed ?? (moving ? Math.min(1.7, 0.6 + s.v / 4) : 1);
    if (Math.abs(spd - s.speed) > 0.12) { s.speed = spd; setSpeed(spd); }
    const h = heads[i];
    h.pos.set(po.x, (po.y ?? 0) + headY * scale * k, po.z); h.vis = g.visible;
    // icon pop above the head
    const ic = po.icon;
    const spr = sprite.current;
    if (spr) {
      if (ic && ic.k > 0 && ic.k < 1) {
        if (s.icon !== ic.name) { s.icon = ic.name; mat.map = iconTex(ic.name); mat.color.set(ic.name === "check" ? "#3fe08a" : ic.name === "cross" ? "#ff6a4d" : "#ffffff"); mat.needsUpdate = true; }
        const e = ic.k < 0.25 ? 1 - Math.pow(1 - ic.k / 0.25, 3) * Math.cos((ic.k / 0.25) * 5) : 1;
        const fade = ic.k > 0.8 ? (1 - ic.k) / 0.2 : 1;
        const size = 0.62 * scale / 3 * Math.max(0.01, e);
        spr.scale.set(size, size, 1);
        spr.position.set(0, headY * scale / k + 0.3 * scale / 3 + ic.k * 0.18, 0);
        mat.opacity = fade; spr.visible = true;
      } else spr.visible = false;
    }
  });
  return (
    <group ref={outer}>
      <GummyCharacter url={p.url} anim={anim} speed={speed} scale={scale} locomotion={locomotion && anim === "walk"} />
      <sprite ref={sprite} material={mat} renderOrder={20} visible={false} />
    </group>
  );
});

export function SimCrowd({ pose, scale, headY, only }: { pose: PoseFn; scale: number; headY?: number; only?: number[] }) {
  const ids = only ?? PLAYERS.map((_, i) => i);
  return <>{ids.map((i) => <SimActor key={i} i={i} pose={pose} scale={scale} headY={headY} />)}</>;
}

// ------------------------------------------------------------------------------------------------ name tags
export const tagEls: (HTMLElement | null)[] = new Array(N + 2).fill(null);
const widths: number[] = new Array(N + 2).fill(0);
const tmp = new THREE.Vector3();

/** Inside the Canvas: projects every head to the screen, then pushes overlapping labels apart (up, then sideways). */
export function TagProjector({ enabled = true }: { enabled?: boolean }) {
  const items = useMemo(() => Array.from({ length: N + 2 }, () => ({ i: 0, x: 0, y: 0, w: 0, vis: false })), []);
  useFrame(({ camera, size }) => {
    const H = 30, GAP = 4;
    let n = 0;
    for (let i = 0; i <= N + 1; i++) {
      const el = tagEls[i];
      if (!el) continue;
      const h = heads[i];
      if (!enabled || !h.vis) { el.style.opacity = "0"; continue; }
      tmp.copy(h.pos).project(camera);
      if (tmp.z > 1 || tmp.z < -1) { el.style.opacity = "0"; continue; }
      if (!widths[i]) widths[i] = el.offsetWidth || 60; else if (i >= N) widths[i] = el.offsetWidth || widths[i];
      const it = items[n++];
      it.i = i; it.x = (tmp.x * 0.5 + 0.5) * size.width; it.y = (1 - (tmp.y * 0.5 + 0.5)) * size.height - 6; it.w = widths[i]; it.vis = true;
    }
    // nearest to the camera (largest y on screen, i.e. lowest) is placed first and keeps its spot
    const placed = items.slice(0, n).sort((a, b) => b.y - a.y);
    const done: typeof placed = [];
    for (const it of placed) {
      let tries = 0;
      const hit = (q: typeof it) => Math.abs(q.x - it.x) < (q.w + it.w) / 2 + GAP && Math.abs(q.y - it.y) < H + 2;
      while (tries < 4 && done.some(hit)) { it.y -= H + 2; tries++; }
      if (tries >= 4) { // still crowded: slide sideways instead
        it.y += 4 * (H + 2);
        const o = done.find(hit);
        if (o) it.x = o.x + (it.x >= o.x ? 1 : -1) * ((o.w + it.w) / 2 + GAP);
      }
      done.push(it);
      const el = tagEls[it.i]!;
      el.style.opacity = "1";
      el.style.transform = `translate3d(${Math.round(it.x)}px,${Math.round(it.y)}px,0) translate(-50%,-100%)`;
    }
  });
  return null;
}

/** Marks the current section's scene as drawn (3 frames after mount) so the director can start its clock and lift the curtain. */
export function SceneReady() {
  const n = useRef(0);
  useEffect(() => { heads[N].vis = false; heads[N + 1].vis = false; }, []); // street NPC tags belong to the street only
  useFrame(() => { if (n.current++ === 3) useSim.getState().patch({ ready: true }); });
  return null;
}
