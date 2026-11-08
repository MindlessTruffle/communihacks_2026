// The kingdom as seen through the throne-room arch: sandy road winding to the castle, cottages (more as the people grow), hills in lilac haze.
// Built from the env kit (tools/blender/gen_env.py). Camera is fixed (see CourtScene), so composition is tuned for that view.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PopIn, type Vec3 } from "./common.tsx";
import { Prop, Props, rng, useSandTexture, usePainterly, type EnvName, type Inst } from "./env.tsx";
import { painterlyMaterial } from "./painterly.ts";
import { useGroundTexture } from "./look.tsx";

interface Placement { kind: string; p: Vec3; r?: number; s?: number }

// The camera is fixed in x (looks straight down -z from x=-6.8), so each of the 3 court windows frames a fixed slice of the kingdom.
// seen(w, z, off) = world position that appears (off m from the centre) in window w at depth z.
const CAMX = -6.8, CAMZ = 19.2, WALLZ = -1.5, WIN = [-0.4, 6.2, 12.8];
const seen = (w: number, z: number, off = 0): Vec3 => [CAMX + (WIN[w] - CAMX + off) * ((CAMZ - z) / (CAMZ - WALLZ)), 0, z];
const at = (kind: string, w: number, z: number, off = 0, r = 0, s?: number): Placement => ({ kind, p: seen(w, z, off), r, s });

// Ordered: index i appears when the kingdom has grown enough (see visibleCount).
const LAYOUT: Placement[] = [
  at("cottage_a", 0, -52, -0.2, 0.2, 0.3),
  at("cottage_b", 1, -56, -0.3, -0.2, 0.3),
  at("tree_pine", 0, -47, 0.55, 0, 0.34),
  at("cottage_c", 1, -49, 0.5, 0.1, 0.3),
  at("well", 0, -44, -0.1, 0, 0.26),
  at("house_two", 2, -58, 0, -0.2, 0.3),
  at("tree_pine", 1, -45, -0.6, 1, 0.36),
  at("stall_terra", 0, -50, -0.6, 0.2, 0.26),
  at("cottage_a", 2, -50, 0.4, 0, 0.3),
  at("house_tall", 0, -62, 0.3, 0, 0.3),
  at("windmill", 2, -72, -0.2, 0.3, 0.55),
  at("tree_round", 2, -46, -0.5, 2, 0.34),
  at("cottage_b", 0, -66, -0.5, 0.1, 0.32),
  at("house_two", 1, -64, 0.2, 0, 0.32),
  at("shop", 2, -60, -0.6, -0.2, 0.28),
  at("tree_pine", 0, -58, 0.7, 3, 0.4),
  at("cottage_c", 2, -66, 0.3, 0, 0.32),
  at("house_tall", 1, -70, -0.3, 0, 0.32),
  at("tower", 1, -84, 0.5, 0, 0.5),
  at("house_two", 0, -74, 0.1, 0.1, 0.34),
  at("fountain", 1, -52, 0.3, 0, 0.2),
  at("tower", 2, -88, 0, 0, 0.5),
  at("shop", 0, -80, -0.4, 0, 0.34),
  at("tree_pine", 1, -76, 0.6, 4, 0.45),
  at("banners", 1, -41, 0, 0, 0.25),
];
const HOUSE_KINDS = new Set(["cottage_a", "cottage_b", "cottage_c", "house_two", "house_tall", "shop"]);

/** Hand-placed core: fills fast (all 25 by ~300 people) so early growth is clearly visible day to day. */
export function visibleCount(people: number) {
  return Math.max(3, Math.min(LAYOUT.length, 3 + Math.floor((people - 100) / 9)));
}

/** Growth stage 0..1 across a typical reign (100 → ~800 people). Drives building size, castle size and the extra districts. */
const growth = (people: number) => THREE.MathUtils.clamp((people - 100) / 700, 0, 1);

// Extra districts beyond the hand-placed core: deterministic slots spread over all three windows, near → far,
// revealed in order as the kingdom grows (up to ~100 more buildings). Instanced, so cheap.
const EXTRA_KINDS: EnvName[] = ["cottage_a", "cottage_b", "cottage_c", "house_two", "house_tall", "shop", "cottage_a", "house_two", "tower", "cottage_b", "house_tall", "stall_terra"];
type Slot = { kind: EnvName; p: Vec3; r: number; s: number };
let SLOTS: Slot[] | null = null; // built lazily (needs ROAD, defined further down)
const extraSlots = (): Slot[] => (SLOTS ??= buildSlots());
const buildSlots = (): Slot[] => {
  const r = rng(42);
  const out: Slot[] = [];
  for (let i = 0; i < 100; i++) {
    const w = i % 3;
    const z = -39 - (i / 100) * 46 - r() * 6;          // fills outward from near the windows to the castle
    const off = (r() - 0.5) * 2.1;                      // spread across the window's width
    const p = seen(w, z, off);
    // keep the road clear
    const t = THREE.MathUtils.clamp((-34 - z) / 78, 0, 1), rp = ROAD_PTS[Math.round(t * (ROAD_PTS.length - 1))];
    if (Math.abs(p[0] - rp.x) < 1.6) p[0] += p[0] < rp.x ? -1.6 : 1.6;
    const kind = EXTRA_KINDS[i % EXTRA_KINDS.length];
    out.push({ kind, p, r: (r() - 0.5) * 0.8, s: (kind === "tower" ? 0.42 : 0.3) + r() * 0.06 });
  }
  return out;
};
const extraCount = (people: number) => Math.max(0, Math.min(100, Math.floor((people - 280) / 5)));

function Districts({ people }: { people: number }) {
  const n = extraCount(people), k = 1 + growth(people) * 0.9;
  const byKind = useMemo(() => {
    const m: Partial<Record<EnvName, Inst[]>> = {};
    extraSlots().slice(0, n).forEach((sl) => { (m[sl.kind] ??= []).push({ p: sl.p, r: sl.r, s: sl.s * k }); });
    return m;
  }, [n, k]);
  return <>{(Object.keys(byKind) as EnvName[]).map((nm) => <Props key={nm + n} name={nm} items={byKind[nm]!} cell={400} cast={false} />)}</>;
}

/** The castle on the horizon grows with the kingdom: bigger keep, then flanking towers, then an outer wall of towers + banners. */
function Castle({ people }: { people: number }) {
  const g = growth(people);
  const base = seen(1, -112);
  const s = 0.55 + g * 0.5;
  return (
    <group position={[base[0], 0, -112]}>
      <group scale={s}><Prop name="castle" /></group>
      {people >= 300 && [-1, 1].map((d) => <group key={d} position={[d * 9 * s, 0, 2]} scale={0.6 * s}><Prop name="tower" /></group>)}
      {people >= 500 && [-2, -1, 1, 2].map((d) => <group key={"w" + d} position={[d * 7 * s, 0, 10 * s]} scale={0.45 * s}><Prop name="tower" /></group>)}
      {people >= 650 && [-6, 6].map((x, i) => <Prop key={"b" + i} name={i ? "banner_red" : "banner_green"} position={[x * s, 0, 6 * s]} scale={1.2 * s} />)}
    </group>
  );
}

function Windmill({ scale = 1 }: { scale?: number }) {
  const blades = useRef<THREE.Group>(null!);
  useFrame((_, dt) => { if (blades.current) blades.current.rotation.z -= dt * 0.35; });
  return (
    <group scale={scale}>
      <Prop name="windmill" />
      <group ref={blades} position={[0, 4.6, 2.25]}><Prop name="windmill_blades" /></group>
    </group>
  );
}

function Piece({ pl }: { pl: Placement }) {
  const r = pl.r ?? 0, s = pl.s ?? 1;
  switch (pl.kind) {
    case "windmill": return <group rotation={[0, r, 0]}><Windmill scale={s} /></group>;
    case "banners":
      return (
        <group>
          {[-6, -2.5, 4.5, 8].map((x, i) => <Prop key={i} name={i % 2 ? "banner_red" : "banner_green"} position={[x, 0, (i % 2) * 1.5]} scale={0.8} />)}
        </group>
      );
    default: return <Prop name={pl.kind as EnvName} rotation={r} scale={s} />;
  }
}

// the road: control points from the castle gate down to the viewer's window
const ROAD = new THREE.CatmullRomCurve3([
  seen(1, -34, 0.1), seen(0, -45, 0.3), seen(1, -56, -0.1), seen(0, -68, 0.2), seen(2, -80, -0.2), seen(1, -96, 0.1), seen(1, -112, 0),
].map((p) => new THREE.Vector3(...p)));
const ROAD_PTS = ROAD.getSpacedPoints(60);

function Road() {
  const tex = useSandTexture();
  const geo = useMemo(() => {
    const segs = 120, w = 0.55;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const len = ROAD.getLength();
    for (let i = 0; i <= segs; i++) {
      const t = i / segs, p = ROAD.getPointAt(t), tan = ROAD.getTangentAt(t);
      const sx = -tan.z, sz = tan.x, n = Math.hypot(sx, sz) || 1;
      const ww = w * (1 - t * 0.35);
      pos.push(p.x - (sx / n) * ww, 0.03, p.z - (sz / n) * ww, p.x + (sx / n) * ww, 0.03, p.z + (sz / n) * ww);
      const v = (t * len) / (w * 2);
      uv.push(0, v, 1, v);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }, []);
  return <mesh geometry={geo} receiveShadow renderOrder={1}><meshStandardMaterial map={tex} roughness={1} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} /></mesh>;
}

/** Distant dressing: small pines / round trees dotted over the hills, a few bushes. Everything far and small (view out of a hilltop castle). */
function Filler() {
  const L = useMemo(() => {
    const out: Partial<Record<EnvName, Inst[]>> = {};
    const put = (n: EnvName, x: number, z: number, rot = 0, s = 1) => { (out[n] ??= []).push({ p: [x, 0, z], r: rot, s }); };
    const r = rng(17);
    const kinds: EnvName[] = ["tree_pine", "tree_pine", "tree_round", "tree_olive", "tree_pine", "tree_small"];
    for (let k = 0; k < 70; k++) {
      const w = k % 3, z = -42 - r() * 70;
      const x = seen(w, z, (r() - 0.5) * 2.4)[0];
      put(kinds[k % kinds.length], x, z, r() * 6, 0.28 + r() * 0.22);
    }
    for (let k = 0; k < 40; k++) { const z = -40 - r() * 60; put((["bush_a", "bush_b", "bush_pink"] as EnvName[])[k % 3], seen(k % 3, z, (r() - 0.5) * 2.2)[0], z, r() * 6, 0.22 + r() * 0.2); }
    return out;
  }, []);
  return <>{(Object.keys(L) as EnvName[]).map((n) => <Props key={n} name={n} items={L[n]!} cell={400} cast={false} />)}</>;
}

/** Three misty snowy peaks far behind the village (own geometry: jittered cones, vertex-coloured snow line, haze baked into the colours, no fog). */
function Peaks({ night }: { night: boolean }) {
  const geo = useMemo(() => {
    const rr = rng(9);
    const defs: [number, number, number, number, number][] = [[36, -120, 62, 50, 1], [80, -128, 74, 56, 2], [125, -120, 66, 50, 3], [-6, -128, 52, 44, 4], [170, -126, 56, 46, 5]];
    const haze = new THREE.Color(night ? "#6f7aa6" : "#d3e3f0");
    const rock = [new THREE.Color(night ? "#44507a" : "#566a86"), new THREE.Color(night ? "#5b6890" : "#7f93ad")];
    const snowC = new THREE.Color(night ? "#c0c8e4" : "#ffffff"), snowShade = new THREE.Color(night ? "#8f9ac0" : "#b9cfe6");
    const P: number[] = [], Cc: number[] = [];
    const parts: THREE.BufferGeometry[] = [];
    const lump = (x: number, y: number, z: number, sd: number) => 0.62 * Math.sin(x * 0.19 + sd) * Math.cos(z * 0.23 + sd * 1.3) + 0.38 * Math.sin(x * 0.47 + z * 0.41 + sd * 2.1);
    for (const [x, z, h, r, sd] of defs) {
      for (let k = 0; k < 3; k++) {
        const hh = k === 0 ? h : h * (0.5 + rr() * 0.22), rad = k === 0 ? r : r * 0.6;
        const g = new THREE.ConeGeometry(rad, hh, 11, 12, true).toNonIndexed();
        const pos = g.attributes.position;
        const off = k === 0 ? [0, 0] : [(rr() - 0.5) * r * 1.2, (rr() - 0.5) * 10];
        const col: number[] = [];
        for (let i = 0; i < pos.count; i++) {
          const y01 = (pos.getY(i) + hh / 2) / hh;
          const px = pos.getX(i), pz = pos.getZ(i);
          const ridge = 1 + 0.3 * lump(px, 0, pz, sd + k) * (1 - y01 * 0.5);
          pos.setXYZ(i, px * ridge + x + off[0], pos.getY(i) + hh / 2 - 8 + 5 * lump(px * 1.7, 0, pz * 1.7, sd) * y01, pz * ridge + z + off[1]);
        }
        // painted look: per-face flat colour, lit planes white / pale, shadow planes soft blue-violet, jagged snow line, haze toward the base. No texture.
        const LIGHT = new THREE.Vector3(-0.45, 0.65, 0.6).normalize();
        const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3(), nn = new THREE.Vector3();
        const snowLit = new THREE.Color(night ? "#d8defa" : "#ffffff"), snowShade = new THREE.Color(night ? "#7f86c4" : "#a9a8e6");
        const rockLit = new THREE.Color(night ? "#6c78b0" : "#8fa2cf"), rockShade = new THREE.Color(night ? "#3f4a86" : "#5c64a8");
        for (let f = 0; f < pos.count; f += 3) {
          va.fromBufferAttribute(pos, f); vb.fromBufferAttribute(pos, f + 1); vc.fromBufferAttribute(pos, f + 2);
          nn.copy(vb).sub(va).cross(vc.clone().sub(va)).normalize();
          if (nn.y < 0) nn.negate();
          const lit = THREE.MathUtils.clamp(nn.dot(LIGHT) * 0.5 + 0.55, 0, 1), cy = (va.y + vb.y + vc.y) / 3, cx = (va.x + vb.x + vc.x) / 3, cz = (va.z + vb.z + vc.z) / 3;
          const y01 = (cy + 8) / hh;
          const line = 0.3 + 0.08 * Math.sin(cx * 0.55 + sd) + 0.05 * Math.cos(cz * 0.7) + 0.04 * Math.sin(f * 1.7);
          const c = (y01 > line ? snowShade.clone().lerp(snowLit, lit) : rockShade.clone().lerp(rockLit, lit));
          c.lerp(haze, THREE.MathUtils.clamp(0.08 + (1 - y01) * 0.5, 0, 0.75));
          for (let v = 0; v < 3; v++) col.push(c.r, c.g, c.b);
        }
        g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
        g.computeVertexNormals();
        parts.push(g);
      }
    }
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const Pp = new Float32Array(n * 3), Cp = new Float32Array(n * 3), Np = new Float32Array(n * 3);
    let o = 0;
    for (const g of parts) { Pp.set(g.attributes.position.array as Float32Array, o * 3); Cp.set(g.attributes.color.array as Float32Array, o * 3); Np.set(g.attributes.normal.array as Float32Array, o * 3); o += g.attributes.position.count; }
    void P; void Cc;
    const m = new THREE.BufferGeometry();
    m.setAttribute("position", new THREE.BufferAttribute(Pp, 3)); m.setAttribute("color", new THREE.BufferAttribute(Cp, 3)); m.setAttribute("normal", new THREE.BufferAttribute(Np, 3));
    return m;
  }, [night]);
  return <mesh geometry={geo}><meshBasicMaterial vertexColors fog={false} /></mesh>;
}

/** The kingdom as seen through the throne room window. Ground, hills, and buildings by population. */
export function KingdomDiorama({ people, origin = [0, 0, 0] as Vec3, night = false }: { people: number; origin?: Vec3; night?: boolean }) {
  const n = visibleCount(people);
  const ground = useGroundTexture(night ? "#5a8c46" : "#8dcc4f", night ? "#3d6b36" : "#62ad3e", night ? "#74a45c" : "#b9e26b", 14, 8);
  const groundMat = usePainterly({ map: ground, detail: "ground", scale: 0.07, roughness: 1 }, [ground]);
  const hills = useMemo(() => [
    [10, -44, 4.5, "#84bd5c"], [50, -50, 5.5, "#88c060"], [90, -46, 5, "#84bd5c"], [-10, -60, 7, "#8cc066"], [30, -72, 8, "#90c26c"], [75, -76, 9, "#94c270"],
    [120, -70, 8, "#8cbc70"], [0, -94, 12, "#9cc088"], [55, -104, 14, "#a4c096"], [105, -98, 12, "#a8c0a0"], [150, -90, 10, "#a2bd98"],
  ] as [number, number, number, string][], []);
  const hillMats = useMemo(() => hills.map(([, , , c]) => painterlyMaterial({ color: night ? "#3a5a52" : c, detail: "ground", scale: 0.02, roughness: 1 })), [hills, night]);
  return (
    <group position={origin}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[40, -0.02, -72]} receiveShadow>
        <planeGeometry args={[320, 160]} />
        <primitive object={groundMat} attach="material" />
      </mesh>
      <Road />
      {hills.map(([x, z, r, c], i) => (
        <mesh key={i} position={[x, -r * 0.62, z]} scale={[2.6, 1, 1.4]} material={hillMats[i]}>
          <sphereGeometry args={[r, 24, 14]} />
        </mesh>
      ))}
      <Peaks night={night} />
      <Filler />
      <Castle people={people} />
      {LAYOUT.slice(0, n).map((pl, i) => (
        <PopIn key={i} position={pl.p} delay={i >= n - 1 ? 0.3 : 0}>
          <Piece pl={{ ...pl, s: (pl.s ?? 1) * (1 + growth(people) * 0.9) }} />
        </PopIn>
      ))}
      <Districts people={people} />
    </group>
  );
}
