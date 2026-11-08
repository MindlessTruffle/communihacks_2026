// Evening Street: linear winding street (~20 s end to end), over-the-shoulder follow cam,
// advisor chat first, then townsfolk who block the path until you talk, optional minigame doors, market gate at the end.
// Set dressing = env kit (tools/blender/gen_env.py): timber-frame cottages, picket fences, flower beds, lamp posts, oaks; sandy path with feathered edges.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { create } from "zustand";
import { useGame } from "../game/store.ts";
import { CHARACTERS } from "../game/content/characters.ts";
import { AGENT_BY_CHAR } from "../game/content/talks.ts";
import { Character, Owl, Sky, Cloud } from "./common.tsx";
import { Props, Prop, rng, setGlow, useSandTexture, usePainterly, type EnvName, type Inst } from "./env.tsx";
import { Shaft, Halos } from "./fx.tsx";
import { painterlyMaterial } from "./painterly.ts";
import { move, pollGamepadSticks, getDevice } from "../platform/device.ts";
import { sfx } from "../audio/audio.ts";
import { Grass, HIGH, Lighting, PostFX, scatter, useGroundTexture } from "./look.tsx";

export const CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0), new THREE.Vector3(2, 0, -10), new THREE.Vector3(-5, 0, -20), new THREE.Vector3(-3, 0, -32),
  new THREE.Vector3(6, 0, -40), new THREE.Vector3(7, 0, -52), new THREE.Vector3(0, 0, -60),
], false, "catmullrom", 0.5);
const LEN = CURVE.getLength();
const SPEED = LEN / 20; // ~20 s end to end

export const STOPS = { advisor: 0.07, npc1: 0.4, npc2: 0.7 } as const;
export const DOORS = [
  { id: "coins", t: 0.24, side: 1, label: "Coin Counter", icon: "🪙" },
  { id: "compare", t: 0.55, side: -1, label: "Price Stall", icon: "⚖️" },
  { id: "bakery", t: 0.85, side: 1, label: "Bakery", icon: "🥖" },
];

/** Shared street state for the UI (proximity prompts). */
export const useStreet = create<{ t: number; nearDoor: string | null; atGate: boolean; set(p: Partial<{ t: number; nearDoor: string | null; atGate: boolean }>): void }>((set) => ({
  t: 0, nearDoor: null, atGate: false, set: (p) => set(p),
}));
export const walkInput = { hold: false };

function frameAt(t: number) {
  const p = CURVE.getPointAt(THREE.MathUtils.clamp(t, 0, 1));
  const tan = CURVE.getTangentAt(THREE.MathUtils.clamp(t, 0, 1)).normalize();
  const side = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
  return { p, tan, side };
}

function Road() {
  const geo = useMemo(() => {
    const segs = 160, w = 3.0;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const { p, side } = frameAt(i / segs);
      const a = p.clone().addScaledVector(side, -w), b = p.clone().addScaledVector(side, w);
      pos.push(a.x, 0.03, a.z, b.x, 0.03, b.z);
      const v = (i / segs) * LEN / (w * 2); // square texels: one tile = path width
      uv.push(0, v, 1, v);
      if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, []);
  const tex = useSandTexture();
  return (
    <mesh geometry={geo} receiveShadow renderOrder={1}>
      <meshStandardMaterial map={tex} roughness={1} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** Polyline of the road for fast distance tests (grass placement). */
const ROAD_PTS = CURVE.getSpacedPoints(240).map((v) => [v.x, v.z] as const);
function roadDist(x: number, z: number) {
  let best = Infinity;
  for (const [px, pz] of ROAD_PTS) { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < best) best = d; }
  return Math.sqrt(best);
}

// ---- street layout (houses, fences, planting) ------------------------------------------------------------------------
const SHOP = { name: "shop" as EnvName, w: 6.0, d: 4.6 };
const HOUSES: { name: EnvName; w: number; d: number }[] = [
  { name: "cottage_a", w: 5.0, d: 4.2 }, { name: "house_two", w: 5.8, d: 4.6 }, { name: "cottage_b", w: 5.6, d: 4.4 },
  { name: "cottage_c", w: 4.6, d: 4.0 }, { name: "house_tall", w: 4.4, d: 4.2 },
];
const Q = HIGH ? 1 : 0.4; // phones: far fewer scattered props (draw/shadow cost)
const NO_SHADOW = new Set<string>(["tuft", "flowers_pink", "flowers_yellow", "flowers_white", "flowers_purple", "path_stone", "rock_b", "fence"]);
const FLOWERS: EnvName[] = ["flowers_pink", "flowers_yellow", "flowers_white", "flowers_purple"];
interface Footprint { x: number; z: number; rot: number; w: number; d: number }
type Blocked = (x: number, z: number, pad?: number) => boolean;

function buildStreet() {
  const L: Partial<Record<EnvName, Inst[]>> = {};
  const put = (n: EnvName, x: number, z: number, r = 0, s = 1, tint?: string) => { (L[n] ??= []).push({ p: [x, 0, z], r, s, tint }); };
  const r = rng(11);
  const feet: Footprint[] = [];
  const doorsOut: { id: string; x: number; z: number; rot: number; w: number; d: number }[] = [];
  let i = 0;
  for (let t = 0.035; t < 0.975; t += 0.1) {
    for (const side of [-1, 1]) {
      i++;
      const door = DOORS.find((d) => Math.abs(d.t - t) < 0.05 && d.side === side);
      const k = door ? SHOP : HOUSES[(i * 2 + (side > 0 ? 1 : 0)) % HOUSES.length];
      const { p, side: sv, tan } = frameAt(door ? door.t : t);
      const off = 4.7 + k.d / 2;
      const pos = p.clone().addScaledVector(sv, side * off);
      const rot = Math.atan2(-sv.x * side, -sv.z * side);
      const cs = Math.cos(rot), sn = Math.sin(rot);
      const W = (lx: number, lz: number): [number, number] => [pos.x + lx * cs + lz * sn, pos.z - lx * sn + lz * cs];
      put(k.name, pos.x, pos.z, rot);
      feet.push({ x: pos.x, z: pos.z, rot, w: k.w, d: k.d });
      if (door) doorsOut.push({ id: door.id, x: pos.x, z: pos.z, rot, w: k.w, d: k.d });
      // front garden: picket fence either side of the entry path, flowers behind it, bushes at the corners
      for (const sg of [-1, 1]) {
        const [x, z] = W(sg * 2.45, k.d / 2 + 1.15);
        put("fence", x, z, rot);
        const [fx1, fz1] = W(sg * 1.9, k.d / 2 + 0.55); put(FLOWERS[(i + (sg > 0 ? 1 : 0)) % 4], fx1, fz1, r() * 6, 1.2 + r() * 0.3);
        const [fx2, fz2] = W(sg * 3.3, k.d / 2 + 0.5); put(FLOWERS[(i + 2 + (sg > 0 ? 1 : 0)) % 4], fx2, fz2, r() * 6, 1.1 + r() * 0.3);
        const [bx, bz] = W(sg * (k.w / 2 + 0.3), k.d / 2 + 0.2);
        put((["bush_a", "bush_pink", "bush_white", "bush_b"] as EnvName[])[(i + (sg > 0 ? 2 : 0)) % 4], bx, bz, r() * 6, 0.75 + r() * 0.3);
      }
      // trees behind and beside the house
      const [tx, tz] = W((r() - 0.5) * 3, -k.d / 2 - 2.6 - r() * 2.5);
      put((["tree_oak_a", "tree_olive", "tree_oak_b", "tree_round"] as EnvName[])[(i + 1) % 4], tx, tz, r() * 6, 1.05 + r() * 0.35);
      const [tx2, tz2] = W(k.w / 2 + 3 + r() * 2, -k.d / 2 + r() * 3);
      put((["tree_round", "tree_pine", "tree_small", "tree_olive"] as EnvName[])[i % 4], tx2, tz2, r() * 6, 0.95 + r() * 0.35);
      if (i % 2 === 0) {
        const lp = p.clone().addScaledVector(sv, side * 3.15).addScaledVector(tan, 2.4);
        put("lamp_post", lp.x, lp.z, side > 0 ? Math.PI : 0);
      }
      if (i % 3 === 0) { const rp = p.clone().addScaledVector(sv, side * 3.4).addScaledVector(tan, -2.2); put((["rock_a", "rock_b", "rock_c"] as EnvName[])[i % 3], rp.x, rp.z, r() * 6, 0.9 + r() * 0.5); }
    }
  }
  // a hero oak by the first bend + stones along both path edges
  const hp = frameAt(0.015);
  const hx = hp.p.clone().addScaledVector(hp.side, 8.5);
  put("tree_oak_a", hx.x, hx.z, 0.5, 1.5);
  for (let k = 0; k < 150; k += HIGH ? 1 : 2) {
    for (const sd of [-1, 1]) {
      const f = frameAt(k / 150);
      const q = f.p.clone().addScaledVector(f.side, sd * (2.8 + (r() - 0.5) * 0.4));
      put("path_stone", q.x, q.z, r() * 6, 0.7 + r() * 0.8);
    }
  }
  const blocked: Blocked = (x, z, pad = 0.6) => feet.some((f) => {
    const dx = x - f.x, dz = z - f.z, cs = Math.cos(f.rot), sn = Math.sin(f.rot);
    const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
    return Math.abs(lx) < f.w / 2 + pad + 1.2 && lz > -f.d / 2 - pad && lz < f.d / 2 + pad + 1.6;
  });
  const wood = scatter(Math.round(60 * Q), -45, 50, -95, 25, (x, z) => { const d = roadDist(x, z); return d > 15 && d < 45 && !blocked(x, z, 1); }, 31);
  const kinds: EnvName[] = ["tree_pine", "tree_round", "tree_oak_b", "tree_olive", "tree_pine", "tree_small"];
  for (let j = 0; j < wood.length / 2; j++) put(kinds[j % kinds.length], wood[j * 2], wood[j * 2 + 1], r() * 6, 1.1 + r() * 0.6);
  const bushes = scatter(Math.round(46 * Q), -30, 36, -75, 12, (x, z) => { const d = roadDist(x, z); return d > 3.4 && d < 22 && !blocked(x, z, 0.4); }, 41);
  for (let j = 0; j < bushes.length / 2; j++) put((["bush_a", "bush_b", "bush_pink", "bush_white"] as EnvName[])[j % 4], bushes[j * 2], bushes[j * 2 + 1], r() * 6, 0.8 + r() * 0.6);
  const rocks = scatter(34, -30, 36, -75, 12, (x, z) => { const d = roadDist(x, z); return d > 3.5 && d < 25 && !blocked(x, z, 0.4); }, 51);
  for (let j = 0; j < rocks.length / 2; j++) put((["rock_a", "rock_b", "rock_c"] as EnvName[])[j % 3], rocks[j * 2], rocks[j * 2 + 1], r() * 6, 0.7 + r() * 0.9);
  const flw = scatter(Math.round(32 * Q), -30, 36, -72, 10, (x, z) => { const d = roadDist(x, z); return d > 3.6 && d < 16 && !blocked(x, z, 0.3); }, 61);
  for (let j = 0; j < flw.length / 2; j++) put(FLOWERS[j % 4], flw[j * 2], flw[j * 2 + 1], r() * 6, 1.0 + r() * 0.5);
  const tufts = scatter(Math.round(360 * Q), -30, 36, -75, 12, (x, z) => { const d = roadDist(x, z); return d > 2.9 && d < 20 && !blocked(x, z, 0.2); }, 71);
  for (let j = 0; j < tufts.length / 2; j++) put("tuft", tufts[j * 2], tufts[j * 2 + 1], r() * 6, 0.9 + r() * 1.1);
  return { L, feet, doors: doorsOut, blocked };
}
let _street: ReturnType<typeof buildStreet> | null = null;
const getStreet = () => (_street ??= buildStreet());

/** Textured ground + lush wind grass in the verges (never on the road or under houses), soft layered hills in the haze. */
function Meadow() {
  const { blocked } = getStreet();
  const ground = useGroundTexture("#8ccb4d", "#62ad3e", "#b8e26a", 20, 3);
  const groundMat = usePainterly({ map: ground, detail: "ground", scale: 0.07, roughness: 1 }, [ground]);
  const grass = useMemo(() => scatter(18000, -26, 30, -72, 10, (x, z) => { const d = roadDist(x, z); return d > 3.0 && d < 17 && !blocked(x, z, 0.2); }, 11), [blocked]);
  const verge = useMemo(() => scatter(5000, -26, 30, -72, 10, (x, z) => { const d = roadDist(x, z); return d > 2.7 && d < 3.9 && !blocked(x, z, 0.1); }, 5), [blocked]);
  const hills = useMemo(() => {
    const out: { p: [number, number, number]; r: number; c: string }[] = [];
    const cols = ["#86c25e", "#93c768", "#a1ca78", "#8fb98c", "#a6b9a2"];
    const rr = rng(3);
    for (let n = 0; n < 16; n++) {
      const x = -110 + rr() * 220, z = -50 - rr() * 90;
      if (roadDist(x, z) < 40) continue;
      const r = 20 + rr() * 26;
      out.push({ p: [x, -r * 0.62, z], r, c: cols[Math.min(4, Math.floor((-z - 50) / 20))] });
    }
    for (const [x, z, r, c] of [[-60, 10, 26, "#7fbd55"], [64, 4, 28, "#86c25e"], [-80, -40, 30, "#8ec266"], [78, -36, 32, "#8fc36a"]] as [number, number, number, string][]) out.push({ p: [x, -r * 0.62, z], r, c });
    return out;
  }, []);
  const hillMats = useMemo(() => hills.map((h) => painterlyMaterial({ color: h.c, detail: "ground", scale: 0.025, roughness: 1 })), [hills]);
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -30]} receiveShadow>
        <planeGeometry args={[240, 240]} />
        <primitive object={groundMat} attach="material" />
      </mesh>
      {hills.map((h, k) => (
        <mesh key={k} position={h.p} scale={[1.5, 1, 1.1]} material={hillMats[k]}>
          <sphereGeometry args={[h.r, 24, 14]} />
        </mesh>
      ))}
      <Grass points={grass} base="#4d9a35" tip="#c6e56e" height={0.6} />
      <Grass points={verge} base="#69a83a" tip="#ecdc90" height={0.3} width={0.9} />
    </>
  );
}

/** Soft warm light-spill texture over a minigame door. */
function useGlowTex() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    gr.addColorStop(0, "rgba(255,226,150,0.95)"); gr.addColorStop(0.5, "rgba(255,190,90,0.45)"); gr.addColorStop(1, "rgba(255,170,60,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
}

function Scenery() {
  const street = getStreet();
  const glow = useGlowTex();
  return (
    <>
      {(Object.keys(street.L) as EnvName[]).map((n) => <Props key={n} name={n} items={street.L[n]!} cast={!NO_SHADOW.has(n)} />)}
      {street.doors.map((d) => (
        <group key={d.id} position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
          <mesh position={[0, 1.7, d.d / 2 + 0.55]}>
            <planeGeometry args={[2.6, 3.2]} />
            <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} fog={false} opacity={0.7} />
          </mesh>
          <pointLight position={[0, 1.8, d.d / 2 + 1.6]} intensity={7} distance={7} color="#ffb347" />
          <Sign label={DOORS.find((x) => x.id === d.id)!.icon} position={[0, 3.55, d.d / 2 + 0.55]} />
          <Prop name="banner_red" position={[2.0, 0, d.d / 2 + 0.7]} scale={0.9} />
        </group>
      ))}
    </>
  );
}

function Sign({ label, position }: { label: string; position: [number, number, number] }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f6ecd2"; g.strokeStyle = "#5c3a24"; g.lineWidth = 10;
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.fill(); g.stroke();
    g.font = "64px serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(label, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [label]);
  return <mesh position={position}><planeGeometry args={[1.2, 1.2]} /><meshBasicMaterial map={tex} transparent /></mesh>;
}

function Gate() {
  const { p, tan } = frameAt(1);
  const rot = Math.atan2(tan.x, tan.z) + Math.PI; // gate front faces the approaching player
  const k = 1.35;
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, rot, 0]}>
      <Prop name="gate_towers" scale={k} />
      <Prop name="banner_green" position={[-3.4 * k, 0, 1.6 * k]} scale={1.1} />
      <Prop name="banner_green" position={[3.4 * k, 0, 1.6 * k]} scale={1.1} />
      <pointLight position={[0, 3.2, 2.2]} intensity={12} distance={11} color="#ffcf7a" />
      <Sign label="🏮" position={[0, 5.0 * k, 0.95 * k + 0.12]} />
    </group>
  );
}

/** Low golden-hour shafts slanting across the street (additive, noise-softened). */
function SunShafts() {
  const spots: [number, number, number][] = [[-16, 14, -10], [-14, 14, -30], [-12, 14, -48]];
  const dir: [number, number, number] = [0.9, -0.42, 0.28];
  return (
    <>
      {spots.map(([x, y, z], i) => (
        <Shaft key={i} top={[[x - 2.2, y, z - 3], [x + 2.2, y, z - 3], [x + 2.2, y, z + 3], [x - 2.2, y, z + 3]]} dir={dir} floorY={0.1} color="#ffc27a" intensity={0.13} fade={0.8} />
      ))}
    </>
  );
}

function StreetCamera({ playerRef, convoTarget }: { playerRef: React.RefObject<THREE.Group>; convoTarget: THREE.Vector3 | null }) {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  useEffect(() => { const c = camera as THREE.PerspectiveCamera; c.clearViewOffset(); c.fov = 55; c.near = 0.1; c.far = 1800; c.updateProjectionMatrix(); }, [camera]); // clearViewOffset: the court camera pins its focus with setViewOffset and the camera object is shared
  useFrame((_, dt) => {
    const pl = playerRef.current;
    if (!pl) return;
    const t = useStreet.getState().t;
    const { tan, side } = frameAt(t);
    let desired: THREE.Vector3, target: THREE.Vector3;
    if (convoTarget) {
      // conversation close-up: ~1.5x further back than before, NPC head-and-shoulders in the middle third, slight upward look at the face.
      const d = getDevice(), portrait = d.orientation === "portrait";
      const dist = (portrait ? 3.2 : d.form === "phone" ? 2.7 : d.size === "s" ? 2.7 : 2.45) * (convoTarget.y < 1.3 ? 1.45 : 1); // the owl advisor is much bigger than townsfolk
      desired = new THREE.Vector3(convoTarget.x, convoTarget.y - (portrait ? 0.3 : 0.38), convoTarget.z).addScaledVector(side, 0.4).addScaledVector(tan, -dist);
      target = convoTarget.clone().add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(side, 0.4);
    } else {
      desired = pl.position.clone().addScaledVector(tan, -4.6).addScaledVector(side, 1.1).add(new THREE.Vector3(0, 2.6, 0));
      target = pl.position.clone().addScaledVector(tan, 4).add(new THREE.Vector3(0, 1.1, 0));
    }
    if (import.meta.env.DEV && convoTarget) (window as unknown as { __convo?: unknown }).__convo = { desired: desired.toArray(), target: target.toArray(), cam: camera.position.toArray(), look: look.current.toArray(), tan: tan.toArray(), side: side.toArray(), t };
    const k = 1 - Math.exp(-dt * (convoTarget ? 3.5 : 4));
    camera.position.lerp(desired, k);
    look.current.lerp(target, k);
    camera.lookAt(look.current);
  });
  return null;
}

function Npc({ charId, t, done, talking }: { charId: string; t: number; done: boolean; talking: boolean }) {
  const ch = CHARACTERS[charId];
  const { p, tan, side } = frameAt(t);
  const pos = p.clone().addScaledVector(side, done ? 2.6 : 0.4);
  const face = Math.atan2(-tan.x, -tan.z);
  if (import.meta.env.DEV && charId === "advisor") (window as unknown as { __owl?: unknown }).__owl = { pos: pos.toArray(), t, done };
  const wheel = ch.aid?.includes("wheelchair");
  if (charId === "advisor") return <Owl position={[pos.x, 0, pos.z]} rotationY={face} scale={1.7} talking={talking} />;
  return <Character url={ch.model} aid={ch.aid} position={[pos.x, 0, pos.z]} rotationY={face} scale={2 * (ch.scale ?? 1)}
    anim={wheel ? "wheelchair-sit" : talking ? "interact-right" : done ? "idle" : "idle"} />;
}

export default function StreetScene() {
  const run = useGame((s) => s.run)!;
  const street = useGame((s) => s.street);
  const convo = useGame((s) => s.convo);
  const minigame = useGame((s) => s.minigame);
  const phase = useGame((s) => s.phase);
  const openConvo = useGame((s) => s.openConvo);
  const settings = useGame((s) => s.settings);
  const player = useRef<THREE.Group>(null!);
  const tRef = useRef(0);
  const lat = useRef(0);
  const [anim, setAnim] = useAnimState();
  const stepAcc = useRef(0);

  useEffect(() => { tRef.current = 0; useStreet.getState().set({ t: 0, nearDoor: null, atGate: false }); }, [run.day]);
  useEffect(() => { setGlow(1.7); }, []);

  const npcs = street.npcs;
  const stopsFor = [STOPS.advisor, STOPS.npc1, STOPS.npc2];
  const nextBlock = npcs.findIndex((n) => !street.done.includes(n));
  const blockT = nextBlock >= 0 ? stopsFor[nextBlock] - 0.025 : 1;
  const convoNpcIdx = convo ? npcs.indexOf(convo.npc) : -1;
  const convoTarget = useMemo(() => {
    if (convoNpcIdx < 0) return null;
    const { p } = frameAt(stopsFor[convoNpcIdx]);
    return p.clone().add(new THREE.Vector3(0, npcs[convoNpcIdx] === "advisor" ? 1.25 : 1.35, 0));
  }, [convoNpcIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    pollGamepadSticks();
    const frozen = !!convo || !!minigame || phase !== "street";
    const fwd = frozen ? 0 : Math.max(-1, Math.min(1, move.y + (walkInput.hold ? 1 : 0)));
    let t = tRef.current;
    if (fwd) t = THREE.MathUtils.clamp(t + (fwd * SPEED * dt) / LEN, 0, Math.min(1, blockT));
    lat.current = THREE.MathUtils.clamp(lat.current + (frozen ? 0 : move.x) * dt * 3, -1.6, 1.6);
    const moving = Math.abs(t - tRef.current) > 1e-5;
    tRef.current = t;
    const { p, tan, side } = frameAt(t);
    const pl = player.current;
    if (pl) {
      pl.position.copy(p).addScaledVector(side, lat.current);
      const yaw = Math.atan2(tan.x, tan.z) + (fwd < 0 ? Math.PI : 0);
      pl.rotation.y = THREE.MathUtils.lerp(pl.rotation.y, yaw, Math.min(1, dt * 8));
      pl.visible = !convo;
    }
    if (moving !== (anim === "walk")) setAnim(moving ? "walk" : "idle");
    if (moving) { stepAcc.current += dt; if (stepAcc.current > 0.32) { stepAcc.current = 0; sfx("step", { volume: 0.35, rate: 0.9 + Math.random() * 0.2 }); } }

    // reached a blocking NPC → start the conversation
    if (!frozen && nextBlock >= 0 && t >= blockT - 0.001) {
      const npc = npcs[nextBlock];
      const agent = npc === "advisor" ? "advisor_evening" : AGENT_BY_CHAR[npc] ?? npc;
      openConvo({ npc, agent, mode: npc === "advisor" ? "advisor" : "npc" });
    }
    const near = DOORS.find((d) => Math.abs(d.t - t) < 0.035 && !street.games.includes(d.id))?.id ?? null;
    const st = useStreet.getState();
    if (st.nearDoor !== near || st.atGate !== t >= 0.985 || Math.abs(st.t - t) > 0.01) st.set({ t, nearDoor: near, atGate: t >= 0.985 });
  });

  const ruler = run.rulerModel;
  return (
    <>
      <StreetCamera playerRef={player} convoTarget={convoTarget} />
      <Sky top="#8a82d4" bottom="#ffd2aa" />
      <Lighting preset="sunset" shadow={{ size: 18, far: 90 }} target={[0, 0, 0]} follow={() => player.current?.position} />
      <PostFX preset="sunset" />
      <Cloud position={[-20, 22, -40]} scale={3} />
      <Cloud position={[15, 26, -55]} scale={3.6} speed={0.08} />
      <Meadow />
      <SunShafts />
      <Road />
      <Scenery />
      <Gate />
      {npcs.map((n, i) => <Npc key={n} charId={n} t={stopsFor[i]} done={street.done.includes(n)} talking={convo?.npc === n} />)}
      <group ref={player}>
        <Character url={`/kenney/mini-characters/${ruler}.glb`} anim={anim} scale={2} crown speed={settings.reduceMotion ? 0.8 : 1.1} />
      </group>
    </>
  );
}

function useAnimState(): [string, (a: string) => void] {
  const [a, setA] = useState("idle");
  return [a, setA];
}
