// 3D VFX: ONE instanced billboard draw call for every particle in the scene (pooled, capped, quality-scaled).
// Painterly look: a small hand-drawn atlas (soft blob / star / sparkle / coin / heart / ring, grey inked edge tinted warm per particle),
// normal alpha blending (no additive white). Reads the shared bus (vfx.burst with a world position). Reduce motion = one static glow.
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../game/store.ts";
import { QUALITY } from "../scenes/look.tsx";
import { vfx, quality, reduced, type VfxKind, type VfxOpts } from "./vfx.ts";

const N = QUALITY === "low" ? 140 : 320;
const COLS = 3, ROWS = 2;
const CELL = { blob: 0, star: 1, spark: 2, coin: 3, heart: 4, ring: 5 } as const;

const tint = (list: string[]) => list.map((c) => new THREE.Color(c).multiplyScalar(0.92)); // slightly under 1 so bloom never blows them out
const PAL = {
  confetti: tint(["#ffcf4a", "#ff9a62", "#f27a9a", "#86d494", "#7fc6ea", "#b9a0f0", "#ffe9b0"]),
  gold: tint(["#ffd45a", "#ffbf3a", "#ffe58a"]),
  pink: tint(["#ff8fae", "#ff6f96", "#ffb3c6"]),
  dust: tint(["#d9c39b", "#c9b088", "#e8d6b4"]),
};
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];

let atlas: THREE.CanvasTexture | null = null;
function makeAtlas() {
  if (atlas) return atlas;
  const S = 128, cv = document.createElement("canvas"); cv.width = S * COLS; cv.height = S * ROWS;
  const c = cv.getContext("2d")!;
  const cell = (i: number, fn: () => void) => { c.save(); c.translate((i % COLS) * S + S / 2, Math.floor(i / COLS) * S + S / 2); fn(); c.restore(); };
  const edge = "#b9b2a8", fill = "#fffaf0";
  cell(CELL.blob, () => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 56); g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.55, "rgba(255,255,255,.85)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 56, 0, 6.283); c.fill(); });
  cell(CELL.star, () => {
    c.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 24 : 54, a = (i / 10) * 6.283 - 1.5708; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
    c.lineJoin = "round"; c.lineWidth = 9; c.strokeStyle = edge; c.stroke(); c.fillStyle = fill; c.fill();
  });
  cell(CELL.spark, () => {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 20); g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)"); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 20, 0, 6.283); c.fill();
    c.beginPath(); c.moveTo(0, -58); c.quadraticCurveTo(4, -4, 58, 0); c.quadraticCurveTo(4, 4, 0, 58); c.quadraticCurveTo(-4, 4, -58, 0); c.quadraticCurveTo(-4, -4, 0, -58); c.closePath();
    c.fillStyle = "rgba(255,255,255,.95)"; c.fill();
  });
  cell(CELL.coin, () => {
    c.beginPath(); c.arc(0, 0, 50, 0, 6.283); c.lineWidth = 9; c.strokeStyle = edge; c.stroke(); c.fillStyle = fill; c.fill();
    c.beginPath(); c.arc(0, 0, 30, 0, 6.283); c.lineWidth = 6; c.strokeStyle = "#d8d0c4"; c.stroke();
    c.beginPath(); c.arc(-16, -16, 8, 0, 6.283); c.fillStyle = "#fff"; c.fill();
  });
  cell(CELL.heart, () => {
    c.beginPath(); c.moveTo(0, 46); c.bezierCurveTo(-64, 4, -38, -50, 0, -18); c.bezierCurveTo(38, -50, 64, 4, 0, 46); c.closePath();
    c.lineJoin = "round"; c.lineWidth = 9; c.strokeStyle = edge; c.stroke(); c.fillStyle = fill; c.fill();
  });
  cell(CELL.ring, () => { c.beginPath(); c.arc(0, 0, 48, 0, 6.283); c.lineWidth = 10; c.strokeStyle = "rgba(255,255,255,.95)"; c.stroke(); c.beginPath(); c.arc(0, 0, 54, 0, 6.283); c.lineWidth = 3; c.strokeStyle = "rgba(190,180,165,.9)"; c.stroke(); });
  atlas = new THREE.CanvasTexture(cv);
  atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.generateMipmaps = true; atlas.anisotropy = 2;
  return atlas;
}

const VERT = /* glsl */ `
attribute vec3 aPos; attribute vec4 aMisc; attribute vec3 aCol;
uniform vec2 uGrid; varying vec2 vUv; varying vec4 vC;
void main() {
  float c = cos(aMisc.y), s = sin(aMisc.y);
  vec2 q = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * aMisc.x;
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
  mv.xy += q;
  gl_Position = projectionMatrix * mv;
  float cell = aMisc.w; vec2 cuv = vec2(mod(cell, uGrid.x), uGrid.y - 1.0 - floor(cell / uGrid.x));
  vUv = (cuv + uv) / uGrid; vC = vec4(aCol, aMisc.z);
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap; varying vec2 vUv; varying vec4 vC;
void main() {
  vec4 t = texture2D(uMap, vUv);
  float a = t.a * vC.a; if (a < 0.01) discard;
  gl_FragColor = vec4(t.rgb * vC.rgb, a);
  #include <colorspace_fragment>
}`;

interface Props {
  /** map an item id to its world position (market: lets the "basket" event pop coins at the stall) */
  slotPos?: (id: string) => THREE.Vector3 | undefined;
}

export function Vfx3D({ slotPos }: Props) {
  const sim = useMemo(() => ({
    pos: new Float32Array(N * 3), vel: new Float32Array(N * 3), life: new Float32Array(N), age: new Float32Array(N),
    s0: new Float32Array(N), s1: new Float32Array(N), rot: new Float32Array(N), spin: new Float32Array(N),
    grav: new Float32Array(N), drag: new Float32Array(N), alpha: new Float32Array(N), cell: new Float32Array(N), tent: new Uint8Array(N),
    next: 0, alive: 0,
  }), []);
  const { geo, mat, aPos, aMisc, aCol } = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute("position", base.getAttribute("position")); g.setAttribute("uv", base.getAttribute("uv"));
    const aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    const aMisc = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    const aCol = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aPos", aPos); g.setAttribute("aMisc", aMisc); g.setAttribute("aCol", aCol);
    g.instanceCount = N;
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
      uniforms: { uMap: { value: makeAtlas() }, uGrid: { value: new THREE.Vector2(COLS, ROWS) } },
    });
    return { geo: g, mat: m, aPos, aMisc, aCol };
  }, []);
  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  const meshRef = useRef<THREE.Mesh>(null);
  const slotRef = useRef(slotPos); slotRef.current = slotPos;

  useEffect(() => {
    const add = (cell: number, col: THREE.Color, x: number, y: number, z: number, vx: number, vy: number, vz: number, s0: number, s1: number, life: number, o: { grav?: number; drag?: number; alpha?: number; spin?: number; tent?: boolean; rot?: number } = {}) => {
      const i = sim.next; sim.next = (sim.next + 1) % N; // ring buffer: oldest recycled at the cap
      sim.pos[i * 3] = x; sim.pos[i * 3 + 1] = y; sim.pos[i * 3 + 2] = z;
      sim.vel[i * 3] = vx; sim.vel[i * 3 + 1] = vy; sim.vel[i * 3 + 2] = vz;
      sim.s0[i] = s0; sim.s1[i] = s1; sim.life[i] = life; sim.age[i] = 0; sim.cell[i] = cell;
      sim.grav[i] = o.grav ?? 0; sim.drag[i] = o.drag ?? 0; sim.alpha[i] = o.alpha ?? 1; sim.spin[i] = o.spin ?? 0; sim.rot[i] = o.rot ?? 0; sim.tent[i] = o.tent ? 1 : 0;
      aCol.setXYZ(i, col.r, col.g, col.b); aCol.needsUpdate = true;
      sim.alive++;
    };
    const burst = (kind: VfxKind, x: number, y: number, z: number, o: VfxOpts) => {
      const sc = o.scale ?? 1, sp = o.spread ?? 0.12 * sc;
      const cnt = (d: number) => Math.max(1, Math.round((o.n ?? d) * quality()));
      const j = () => rnd(-sp, sp);
      if (reduced()) { // one soft static glow, no travel
        if (kind === "dust") return;
        add(CELL.blob, kind === "hearts" ? PAL.pink[0] : PAL.gold[0], x, y, z, 0, 0, 0, 0.8 * sc, 1.3 * sc, 0.85, { alpha: 0.5, tent: true });
        return;
      }
      switch (kind) {
        case "confetti":
          for (let i = 0, n = cnt(26); i < n; i++) {
            const a = rnd(0, 6.283), h = rnd(0.5, 2.0) * sc;
            add(i % 3 === 0 ? CELL.blob : i % 3 === 1 ? CELL.star : CELL.spark, pick(PAL.confetti), x + j(), y + j(), z + j(), Math.cos(a) * h, rnd(2.4, 4.6) * sc, Math.sin(a) * h * 0.6,
              rnd(0.2, 0.32) * sc, rnd(0.14, 0.22) * sc, rnd(1.3, 2.0), { grav: 4.5 * sc, drag: 1.1, spin: rnd(-5, 5), rot: rnd(0, 6), alpha: 0.95 });
          }
          break;
        case "coins":
          for (let i = 0, n = cnt(6); i < n; i++)
            add(CELL.coin, pick(PAL.gold), x + j(), y, z + j(), rnd(-0.7, 0.7) * sc, rnd(2.8, 4.2) * sc, rnd(-0.5, 0.5) * sc, 0.28 * sc, 0.24 * sc, rnd(0.9, 1.2), { grav: 9 * sc, spin: rnd(-6, 6), drag: 0.3 });
          break;
        case "sparkle":
          for (let i = 0, n = cnt(10); i < n; i++) {
            const a = rnd(0, 6.283), e = rnd(-0.4, 1), r = rnd(0.4, 1.3) * sc;
            add(i % 3 ? CELL.spark : CELL.blob, pick(PAL.gold), x + j(), y + j(), z + j(), Math.cos(a) * r, e * r + 0.3 * sc, Math.sin(a) * r, rnd(0.4, 0.7) * sc, 0.02 * sc, rnd(0.65, 1.0), { drag: 2.2, spin: rnd(-2, 2), alpha: 0.95 });
          }
          break;
        case "hearts":
          for (let i = 0, n = cnt(5); i < n; i++)
            add(CELL.heart, pick(PAL.pink), x + j() * 2, y, z + j(), rnd(-0.25, 0.25) * sc, rnd(0.8, 1.3) * sc, 0, rnd(0.34, 0.48) * sc, rnd(0.42, 0.56) * sc, rnd(1.2, 1.7), { drag: 0.35, spin: rnd(-0.6, 0.6), rot: rnd(-0.3, 0.3), alpha: 0.95 });
          break;
        case "dust":
          for (let i = 0, n = cnt(5); i < n; i++) {
            const a = rnd(0, 6.283), r = rnd(0.25, 0.8) * sc;
            add(CELL.blob, pick(PAL.dust), x + j(), y, z + j(), Math.cos(a) * r, rnd(0.2, 0.5) * sc, Math.sin(a) * r, rnd(0.1, 0.16) * sc, rnd(0.4, 0.6) * sc, rnd(0.6, 0.9), { drag: 2.4, alpha: 0.42 });
          }
          break;
        case "ripple":
          add(CELL.ring, PAL.gold[2], x, y, z, 0, 0, 0, 0.1 * sc, 1.2 * sc, 0.6, { alpha: 0.8 });
          break;
        case "stars":
          for (let i = 0, n = cnt(10); i < n; i++) {
            const a = rnd(0, 6.283), r = rnd(0.8, 2.0) * sc;
            add(CELL.star, i % 2 ? PAL.gold[0] : PAL.gold[1], x + j(), y + j(), z + j(), Math.cos(a) * r, rnd(0.5, 2.2) * sc, Math.sin(a) * r, rnd(0.26, 0.4) * sc, 0.08 * sc, rnd(0.9, 1.3), { grav: 3.5 * sc, drag: 1.4, spin: rnd(-3, 3), alpha: 0.95 });
          }
          break;
      }
    };
    const off = vfx.on((e) => { if (e.type === "burst3d") burst(e.kind, e.x, e.y, e.z, e.opts); });
    // market: item goes into the basket -> coins pop up at its stall
    const un = useGame.subscribe((s, p) => {
      if (!s.fx || s.fx === p.fx || s.fx.kind !== "basket") return;
      const at = slotRef.current?.(String(s.fx.data));
      if (at) { vfx.burst("coins", { x: at.x, y: at.y + 0.3, z: at.z }, { scale: 0.5, n: 5 }); vfx.burst("sparkle", { x: at.x, y: at.y + 0.1, z: at.z }, { scale: 0.7, n: 6 }); }
    });
    return () => { off(); un(); };
  }, [sim, aCol]);

  useFrame((_, dtRaw) => {
    const m = meshRef.current; if (m) m.visible = sim.alive > 0; // no particles => no draw call at all
    if (!sim.alive) return;
    const dt = Math.min(dtRaw, 0.05);
    let alive = 0;
    for (let i = 0; i < N; i++) {
      if (sim.life[i] <= 0) continue;
      sim.age[i] += dt;
      const u = sim.age[i] / sim.life[i];
      if (u >= 1) { sim.life[i] = 0; aMisc.setXYZW(i, 0, 0, 0, 0); continue; }
      alive++;
      const k = Math.max(0, 1 - sim.drag[i] * dt), i3 = i * 3;
      sim.vel[i3 + 1] -= sim.grav[i] * dt;
      sim.vel[i3] *= k; sim.vel[i3 + 1] *= k; sim.vel[i3 + 2] *= k;
      sim.pos[i3] += sim.vel[i3] * dt; sim.pos[i3 + 1] += sim.vel[i3 + 1] * dt; sim.pos[i3 + 2] += sim.vel[i3 + 2] * dt;
      sim.rot[i] += sim.spin[i] * dt;
      const size = sim.s0[i] + (sim.s1[i] - sim.s0[i]) * u;
      const a = sim.tent[i] ? Math.sin(u * Math.PI) * sim.alpha[i] : sim.alpha[i] * Math.min(1, sim.age[i] / 0.07) * (u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1);
      aPos.setXYZ(i, sim.pos[i3], sim.pos[i3 + 1], sim.pos[i3 + 2]);
      aMisc.setXYZW(i, size, sim.rot[i], a, sim.cell[i]);
    }
    sim.alive = alive;
    aPos.needsUpdate = true; aMisc.needsUpdate = true;
  });

  return <mesh ref={meshRef} geometry={geo} material={mat} frustumCulled={false} renderOrder={999} visible={false} />;
}
