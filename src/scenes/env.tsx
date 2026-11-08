// Environment kit loader: mid-poly GLBs from tools/blender/gen_env.py (vertex-colour palette, baked AO, "env" + "glow" materials).
// Repeated props are drawn with InstancedMesh (one draw call per sub-mesh per asset), shared materials everywhere.
import { useEffect, useMemo } from "react";
import { useGLTF, OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "./common.tsx";
import { painterlyMaterial, type PainterlyOpts } from "./painterly.ts";

export const ENV_NAMES = [
  "tree_oak_a", "tree_oak_b", "tree_olive", "tree_round", "tree_pine", "tree_small",
  "bush_a", "bush_b", "bush_pink", "bush_white", "flowers_pink", "flowers_yellow", "flowers_white", "flowers_purple", "tuft",
  "rock_a", "rock_b", "rock_c", "path_stone", "fence", "lamp_post", "sign_bracket", "crate", "barrel", "banner_red", "banner_green", "well", "fountain",
  "stall_terra", "stall_teal", "stall_mustard", "stall_pink",
  "cottage_a", "cottage_b", "cottage_c", "house_two", "house_tall", "shop",
  "tower", "castle", "windmill", "windmill_blades", "gate_towers",
  "court_wall", "court_trim", "throne_dais", "throne_chair", "pillar", "banner_hang", "sconce", "perch", "throne", "coin_mound_s", "coin_mound_m", "coin_mound_l",
] as const;
export type EnvName = (typeof ENV_NAMES)[number];
const url = (n: string) => `/models/env/${n}.glb`;

// ---- shared materials
export const envMat = painterlyMaterial({ detail: "auto", vertexColors: true, roughness: 0.92 });
/** Brick court wall + metallic gold (coin mounds) get their own painted finish. */
/** Hand-painted brick sheet (4 m x 4 m tile): chunky rounded bricks, uneven painted mortar, top-light gradient, crisp top-edge highlight. */
function makeBrickTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 1024;
  const g = c.getContext("2d")!;
  let sd = 11; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  g.fillStyle = "#a98d72"; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 40; i++) { g.strokeStyle = r() > 0.5 ? "rgba(120,92,70,.18)" : "rgba(200,170,140,.16)"; g.lineWidth = 8 + r() * 14; g.lineCap = "round"; const y = r() * 1024, x = r() * 1024; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 120 + r() * 200, y + (r() - 0.5) * 20); g.stroke(); }
  const cols = ["#dcb890", "#d3ac84", "#e1c09a", "#cfa67d", "#d8b28a"];
  const BW = 256, BH = 128;
  for (let row = 0; row < 8; row++) {
    for (let i = -1; i < 5; i++) {
      const x0 = i * BW + (row % 2 ? BW / 2 : 0) + 9 + (r() - 0.5) * 6, y0 = row * BH + 9 + (r() - 0.5) * 5, w = BW - 18 - r() * 6, h = BH - 18 - r() * 4;
      for (const ox of [0, 1024, -1024]) {
        const X = x0 + ox;
        if (X > 1030 || X + w < -6) continue;
        const base = cols[Math.floor(r() * cols.length)];
        const gr = g.createLinearGradient(0, y0, 0, y0 + h);
        gr.addColorStop(0, "rgba(255,244,222,.55)"); gr.addColorStop(0.25, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(90,58,40,.32)");
        g.fillStyle = base; g.beginPath(); g.roundRect(X, y0, w, h, 26); g.fill();
        g.fillStyle = gr; g.beginPath(); g.roundRect(X, y0, w, h, 26); g.fill();
        for (let k = 0; k < 3; k++) { g.strokeStyle = r() > 0.5 ? "rgba(255,238,210,.2)" : "rgba(110,76,52,.16)"; g.lineWidth = 7 + r() * 9; g.lineCap = "round"; const yy = y0 + 18 + r() * (h - 36), xx = X + 14 + r() * 40; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 60 + r() * (w - 120), yy + (r() - 0.5) * 8); g.stroke(); }
        g.strokeStyle = "rgba(255,246,226,.75)"; g.lineWidth = 5; g.lineCap = "round"; g.beginPath(); g.moveTo(X + 22, y0 + 4); g.lineTo(X + w - 22, y0 + 4); g.stroke();
        g.strokeStyle = "rgba(255,240,215,.4)"; g.lineWidth = 4; g.beginPath(); g.moveTo(X + 4, y0 + 24); g.lineTo(X + 4, y0 + h - 24); g.stroke();
        g.strokeStyle = "rgba(96,64,44,.45)"; g.lineWidth = 6; g.beginPath(); g.moveTo(X + 22, y0 + h - 3); g.lineTo(X + w - 22, y0 + h - 3); g.stroke();
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
export const brickMat = painterlyMaterial({ detail: "brick", vertexColors: true, roughness: 0.93, scale: 0.14, map: makeBrickTexture() });
brickMat.userData.painterly.uStrength.value = 0.12;
export const goldMat = painterlyMaterial({ detail: "gold", vertexColors: true, roughness: 0.36, metalness: 0.92, scale: 1.2 });
brickMat.emissive = new THREE.Color("#7a5a44"); brickMat.emissiveIntensity = 0.35; // wall stays a readable warm tan even though the key light sits behind it
goldMat.envMapIntensity = 1.9;
goldMat.emissive = new THREE.Color("#4a2e04"); goldMat.emissiveIntensity = 0.22;
const matFor = (name: string, glow: boolean) => (glow ? glowMat : name === "court_wall" ? brickMat : name.startsWith("coin_mound") ? goldMat : envMat);
export const glowMat = new THREE.MeshStandardMaterial({ color: "#ffe2a0", emissive: new THREE.Color("#ffb454"), emissiveIntensity: 0.5, roughness: 0.5, name: "glow" });
/** Window / lantern glow strength: ~0.35 daytime (warm glass), 2+ at night (blooms). */
export function setGlow(intensity: number) { glowMat.emissiveIntensity = intensity; }

interface Part { geo: THREE.BufferGeometry; glow: boolean }
const cache = new Map<string, Part[]>();
function partsOf(name: string, scene: THREE.Object3D): Part[] {
  let p = cache.get(name);
  if (p) return p;
  p = [];
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    if (name === "court_wall") { // planar uv (x, y) / 4 m so the painted brick canvas tiles over the slab
      const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 4; uv[i * 2 + 1] = pos.getY(i) / 4; }
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    }
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    p!.push({ geo: g, glow: mats[0]?.name === "glow" });
  });
  cache.set(name, p);
  return p;
}

export function useEnv(name: EnvName) {
  const { scene } = useGLTF(url(name));
  return useMemo(() => partsOf(name, scene), [name, scene]);
}
export function preloadEnv(names: readonly string[] = ENV_NAMES) { names.forEach((n) => useGLTF.preload(url(n))); }

export interface Inst { p: Vec3; r?: number; s?: number | Vec3; tint?: string }
const tmpO = new THREE.Object3D();
const tmpC = new THREE.Color();

/**
 * Instanced placements of one asset. Items are bucketed into square cells (default 26 m) -> one InstancedMesh per cell per sub-mesh,
 * so frustum culling (camera + shadow camera) can drop whole cells; draw calls stay low because assets are still shared.
 */
export function Props({ name, items, cast = true, receive = true, cell = 26 }: { name: EnvName; items: Inst[]; cast?: boolean; receive?: boolean; cell?: number }) {
  const parts = useEnv(name);
  const group = useMemo(() => {
    const g = new THREE.Group();
    if (!items.length) return g;
    if (import.meta.env.DEV) { const w = window as unknown as { __envTris?: Record<string, number> }; (w.__envTris ??= {})[name] = items.length * parts.reduce((a, q) => a + (q.geo.index ? q.geo.index.count : q.geo.attributes.position.count) / 3, 0); }
    const cells = new Map<string, Inst[]>();
    for (const it of items) {
      const k = Math.floor(it.p[0] / cell) + "," + Math.floor(it.p[2] / cell);
      (cells.get(k) ?? cells.set(k, []).get(k)!).push(it);
    }
    for (const list of cells.values()) {
      for (const part of parts) {
        const m = new THREE.InstancedMesh(part.geo, matFor(name, part.glow), list.length);
        list.forEach((it, i) => {
          tmpO.position.set(...it.p);
          tmpO.rotation.set(0, it.r ?? 0, 0);
          if (typeof it.s === "object") tmpO.scale.set(...it.s); else tmpO.scale.setScalar(it.s ?? 1);
          tmpO.updateMatrix();
          m.setMatrixAt(i, tmpO.matrix);
          if (it.tint) { tmpC.set(it.tint); m.setColorAt(i, tmpC); }
        });
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
        m.castShadow = cast && !part.glow;
        m.receiveShadow = receive;
        m.computeBoundingSphere();
        g.add(m);
      }
    }
    return g;
  }, [parts, items, cast, receive, cell, name]);
  useEffect(() => () => { group.children.forEach((c) => (c as THREE.InstancedMesh).dispose?.()); }, [group]);
  return <primitive object={group} />;
}

/** Single placement (position/rotation/scale like a normal mesh group). */
export function Prop({ name, position = [0, 0, 0], rotation = 0, scale = 1, cast = true }: { name: EnvName; position?: Vec3; rotation?: number | Vec3; scale?: number | Vec3; cast?: boolean }) {
  const parts = useEnv(name);
  const grp = useMemo(() => {
    const g = new THREE.Group();
    for (const part of parts) {
      const m = new THREE.Mesh(part.geo, matFor(name, part.glow));
      m.castShadow = cast && !part.glow; m.receiveShadow = true;
      g.add(m);
    }
    return g;
  }, [parts, cast]);
  const rot: Vec3 = typeof rotation === "number" ? [0, rotation, 0] : rotation;
  return <primitive object={grp} position={position} rotation={rot} scale={scale} />;
}

/** Sandy path texture: light warm sand, soft dappled patches; side edges feather to transparent so the path melts into the grass. */
export function useSandTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = 512; c.height = 512;
    const g = c.getContext("2d")!;
    const r = rng(5);
    g.fillStyle = "#f4dba8"; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 110; i++) {
      const x = r() * 512, y = r() * 512, rad = 20 + r() * 60;
      const col = r() > 0.5 ? "rgba(255,240,200,0.5)" : "rgba(226,190,132,0.22)";
      for (const oy of [0, 512, -512]) {
        const gr = g.createRadialGradient(x, y + oy, 0, x, y + oy, rad);
        gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(x, y + oy, rad, 0, Math.PI * 2); g.fill();
      }
    }
    g.fillStyle = "rgba(170,130,80,0.22)";
    for (let i = 0; i < 700; i++) g.fillRect(r() * 512, r() * 512, 2, 2);
    g.fillStyle = "rgba(255,246,220,0.3)";
    for (let i = 0; i < 300; i++) g.fillRect(r() * 512, r() * 512, 3, 2);
    g.globalCompositeOperation = "destination-in";
    const gr = g.createLinearGradient(0, 0, 512, 0);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.1, "rgba(0,0,0,0.85)"); gr.addColorStop(0.18, "rgba(0,0,0,1)");
    gr.addColorStop(0.82, "rgba(0,0,0,1)"); gr.addColorStop(0.9, "rgba(0,0,0,0.85)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, []);
}

/** Memoised painterly material for React scenes. */
export function usePainterly(opts: PainterlyOpts, deps: unknown[] = []) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => painterlyMaterial(opts), deps);
}

/** Deterministic seeded RNG for layouts. */
export function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Dev tool: ?gallery=1 (all) or ?gallery=house (name prefix filter) renders every kit asset in a grid with orbit controls. */
export function Gallery({ filter = "" }: { filter?: string }) {
  const fs = filter.split(",");
  const names = ENV_NAMES.filter((n) => !filter || filter === "1" || fs.some((f) => n.startsWith(f)));
  const cols = Math.ceil(Math.sqrt(names.length * 1.4));
  const gap = 14;
  const { camera, size } = useThree();
  useEffect(() => {
    const rows = Math.ceil(names.length / cols);
    const cam = camera as THREE.PerspectiveCamera;
    cam.fov = 40; cam.near = 0.1; cam.far = 800;
    const t = Math.tan(THREE.MathUtils.degToRad(20));
    const ext = Math.max(rows * gap * 0.8, (cols * gap) / (size.width / size.height));
    const dist = ext / 2 / t + 6;
    cam.position.set(0, dist * 0.55, dist * 0.85);
    cam.lookAt(0, 2, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, names.length, cols]);
  return (
    <>
      <OrbitControls target={[0, 3, 0]} />
      <hemisphereLight args={["#cfe0ff", "#6a5a40", 0.9]} />
      <directionalLight position={[-20, 40, 30]} intensity={2.6} color="#ffe2b8" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}><planeGeometry args={[400, 400]} /><meshStandardMaterial color="#8cc84b" roughness={1} /></mesh>
      {names.map((n, i) => {
        const x = (i % cols - (cols - 1) / 2) * gap, z = (Math.floor(i / cols) - (Math.ceil(names.length / cols) - 1) / 2) * gap;
        const big = n === "castle" || n === "court_wall" || n === "gate_towers";
        return <Prop key={n} name={n} position={[x, 0, z]} scale={big ? 0.5 : 1} />;
      })}
    </>
  );
}
