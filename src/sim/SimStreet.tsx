// Multiplayer simulation, section 3 (3D): the real evening street (Meadow / Road / Scenery / Gate) with ten players strolling it in two
// small clusters: waving, chatting with townsfolk, popping into a minigame door and back out with a reward. The bird's-eye camera drifts slowly.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Character, Cloud, Sky } from "../scenes/common.tsx";
import { CURVE, DOORS, Gate, Meadow, Road, Scenery, SunShafts, frameAt, roadDist } from "../scenes/StreetScene.tsx";
import type { EnvName, Inst } from "../scenes/env.tsx";
import { Lighting, PostFX } from "../scenes/look.tsx";
import { setGlow } from "../scenes/env.tsx";
import { Vfx3D } from "../fx/Vfx3D.tsx";
import { CHARACTERS } from "../game/content/characters.ts";
import { useGame } from "../game/store.ts";
import { vfx } from "../fx/vfx.ts";
import { sfx } from "../audio/audio.ts";
import { N, STREET_DOOR_PLAYERS, mulberry, SIM_SEED, T } from "./simData.ts";
import { SimCrowd, SceneReady, heads, type Pose, type PoseFn } from "./simActors.tsx";
import { simClock, simCam, useSim } from "./simStore.ts";

const LEN = CURVE.getLength();
/** bird's-eye camera: leave out canopy trees close to the path (they would sit between the lens and the players) */
const keepProp = (n: EnvName, it: Inst) => !(n.startsWith("tree_") && roadDist(it.p[0], it.p[2]) < 11);
const PS = 2.5; // player scale (0.4 m per unit => ~1 m tall)
const DOOR = DOORS[0]; // "Coin Counter"
const S_DOOR = DOOR.t * LEN;
const L_DOOR = 3.95 * DOOR.side;
const NPC_END = { id: "hazel", s: 0.4 * LEN, l: 0.4, tag: N }; // Farmer Hazel at the end of the stretch
const NPC_MID = { id: "marlo", s: 13.2, l: -3.5, tag: N + 1 }; // Marlo the Merchant by a garden fence, early on
const S_END = 27.2;
// street timeline (seconds). The group front follows GK (eased keyframes), so they walk, stop, walk.
const TM = { wave: 3.0, waveEnd: 4.8, mid: 7.0, midEnd: 15.0, doorArrive: 7.4, doorIn: 7.4, doorOut: 9.8, doorBack: 12.2, pair: 12.6, npc: 19.0 };
export const STREET_POP_AT = TM.doorOut;
const GK: [number, number][] = [[0, 8], [5, 14.5], [7.5, 16.4], [12, 20.2], [16, 21.4], [21, 27], [25, S_END]];

const SLOT = (() => {
  const r = mulberry(SIM_SEED + 40);
  const slots = Array.from({ length: N }, (_, i) => ({ l: (i % 5 - 2) * 1.15 + (r() - 0.5) * 0.3, f: (i < 5 ? 0.9 : -1.3) + (r() - 0.5) * 0.7 }));
  for (let i = slots.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [slots[i], slots[j]] = [slots[j], slots[i]]; }
  return slots;
})();
const WAVERS = [0, 6];
const HOPPERS = [3, 9];
const DOORERS = STREET_DOOR_PLAYERS;
const MARLO_CHAT = [2, 7];
const PAIR = [5, 9];

const sm = (k: number) => { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); };
const v3 = new THREE.Vector3();
function world(s: number, l: number): [number, number] {
  const f = frameAt(Math.min(1, Math.max(0, s / LEN)));
  return [f.p.x + f.side.x * l, f.p.z + f.side.z * l];
}
function group(t: number) {
  for (let k = 0; k < GK.length - 1; k++) if (t < GK[k + 1][0]) return GK[k][1] + (GK[k + 1][1] - GK[k][1]) * sm((t - GK[k][0]) / (GK[k + 1][0] - GK[k][0]));
  return GK[GK.length - 1][1];
}
const moving = (t: number) => Math.abs(group(t + 0.1) - group(t - 0.1)) > 0.05;

type SL = { s: number; l: number };
function base(i: number, t: number): SL {
  const sl = SLOT[i];
  return { s: group(t) + sl.f, l: sl.l + Math.sin(t * 1.1 + i * 1.3) * 0.25 * (moving(t) ? 1 : 0.3) };
}
/** leave the group for `spot` (a..b), stay (b..c), walk back to the group (c..d). phase: 0 none, 1 going, 2 there, 3 returning */
function detour(i: number, t: number, a: number, b: number, c: number, d: number, spot: SL): { p: SL; phase: number } {
  const bs = base(i, t);
  if (t < a || t >= d) return { p: bs, phase: 0 };
  if (t < b) { const k = sm((t - a) / (b - a)); return { p: { s: bs.s + (spot.s - bs.s) * k, l: bs.l + (spot.l - bs.l) * k }, phase: 1 }; }
  if (t < c) return { p: spot, phase: 2 };
  const k = sm((t - c) / (d - c));
  return { p: { s: spot.s + (bs.s - spot.s) * k, l: spot.l + (bs.l - spot.l) * k }, phase: 3 };
}

const streetPose: PoseFn = (i, t): Pose => {
  let p: SL = base(i, t);
  let anim = "auto", y = 0, scale = 1, icon: Pose["icon"] = null, speed: number | undefined, rot: number | undefined;
  const toward = (tx: number, tz: number, at: SL) => { const [px, pz] = world(at.s, at.l); return Math.atan2(tx - px, tz - pz); };
  const di = DOORERS.indexOf(i);
  if (di >= 0) {
    const lead = di * 0.45, door = { s: S_DOOR - 0.3 + di * 0.35, l: L_DOOR };
    const d = detour(i, t, TM.doorArrive - 1.3 + lead, TM.doorIn + lead, TM.doorOut + lead, TM.doorBack + lead, door);
    p = d.p;
    if (d.phase === 1) speed = 1.4;
    if (d.phase === 2) { const k = sm((t - TM.doorIn - lead) / 0.35); scale = Math.max(0, 1 - k); p = { s: door.s, l: door.l + 0.3 * k }; }
    if (d.phase === 3) { const k = t - TM.doorOut - lead; scale = sm(k / 0.3); if (k < 1.2) { icon = { name: "coin", k: k / 1.2 }; anim = k < 0.8 ? "emote-yes" : "auto"; } speed = 1.2; }
  }
  const wi = WAVERS.indexOf(i);
  if (wi >= 0) {
    const a = TM.wave + wi * 0.4, stand = base(i, a);
    const d = detour(i, t, a - 0.01, a, TM.waveEnd + wi * 0.4, TM.waveEnd + 1.6 + wi * 0.4, stand);
    p = d.p;
    if (d.phase === 2) { anim = "interact-right"; y = Math.abs(Math.sin((t - a) * 5)) * 0.06; rot = toward(simCam.x, simCam.z, p); }
    if (d.phase === 3) speed = 1.3;
  }
  const mi = MARLO_CHAT.indexOf(i);
  if (mi >= 0) {
    const spot = { s: NPC_MID.s - 1.6 + mi * 2.2, l: NPC_MID.l + 1.3 };
    const d = detour(i, t, TM.mid + mi * 0.5, TM.mid + 1.5 + mi * 0.5, TM.midEnd - 1.6 + mi * 0.6, TM.midEnd + mi * 0.6, spot);
    p = d.p;
    if (d.phase === 1 || d.phase === 3) speed = 1.2;
    if (d.phase === 2) { const [mx, mz] = world(NPC_MID.s, NPC_MID.l); rot = toward(mx, mz, p); anim = Math.floor(t * 0.8 + mi) % 2 ? "interact-right" : "idle"; }
  }
  const pi = PAIR.indexOf(i);
  if (pi >= 0 && t >= TM.pair && t < 16.5) {
    const o = base(PAIR[1 - pi], t), [ox, oz] = world(o.s, o.l);
    rot = toward(ox, oz, p);
    const w = t - (TM.pair + 0.8 + pi * 1.4);
    anim = w > 0 && w < 1.2 ? "interact-right" : w > 1.4 && w < 2.1 ? "emote-yes" : "auto";
  }
  if (HOPPERS.includes(i) && ((t > 1 && t < 3) || (t > 17 && t < 19))) y = Math.abs(Math.sin(t * 6.5 + i)) * 0.13;
  const [x, z] = world(p.s, p.l);
  if (t > TM.npc - 0.5 && rot === undefined) { const [nx, nz] = world(NPC_END.s, NPC_END.l); rot = toward(nx, nz, p); }
  if (t > 21 && anim === "auto" && !moving(t)) {
    if (i % 4 === 0 && t < 22.6) anim = "interact-right";
    if (i % 5 === 1 && t > 23 && t < 23.8) anim = "jump";
    if (i % 3 === 2 && t > 22 && t < 23.2) anim = "emote-yes";
  }
  return { x, z, y, anim, scale, icon, speed, rot };
};

/** Townsfolk the class stops to chat with. */
function Npc({ n }: { n: typeof NPC_END }) {
  const ch = CHARACTERS[n.id];
  const ref = useRef<THREE.Group>(null!);
  const pos = useMemo(() => { const [x, z] = world(n.s, n.l); return new THREE.Vector3(x, 0, z); }, [n]);
  useFrame(() => {
    const f = frameAt(n.s / LEN), sg = Math.sign(n.l) || 1;
    if (ref.current) ref.current.rotation.y = n.tag === N + 1 ? Math.atan2(-f.side.x * sg, -f.side.z * sg) : Math.atan2(-f.tan.x, -f.tan.z);
    heads[n.tag].pos.set(pos.x, 1.35, pos.z); heads[n.tag].vis = simClock.t > 0.2;
  });
  return (
    <group ref={ref} position={[pos.x, 0, pos.z]}>
      <Character url={ch.model} anim="idle" scale={2 * (ch.scale ?? 1)} />
    </group>
  );
}

const cen = new THREE.Vector3();
function centroid(out: THREE.Vector3, t: number) {
  let n = 0; out.set(0, 0, 0);
  for (let i = 0; i < N; i++) { const p = streetPose(i, t); if (p.scale !== undefined && p.scale < 0.2) continue; out.x += p.x; out.z += p.z; n++; }
  if (n) out.multiplyScalar(1 / n);
  return out;
}

function StreetCamera() {
  const { camera, size } = useThree();
  const reduce = useGame((s) => s.settings.reduceMotion);
  const look = useRef(new THREE.Vector3());
  const first = useRef(true);
  useEffect(() => { const c = camera as THREE.PerspectiveCamera; c.clearViewOffset(); c.fov = 42; c.near = 0.1; c.far = 1800; c.updateProjectionMatrix(); first.current = true; }, [camera]);
  useFrame((_, dt) => {
    const t = simClock.t, aspect = size.width / size.height;
    centroid(cen, t); // slow damping below: the camera drifts between the clusters instead of snapping to them
    cen.y = 0.5;
    const f = frameAt(Math.min(1, Math.max(0, (group(t) - 0.8) / LEN)));
    const k = reduce ? 0.5 : Math.min(1, t / T.street);
    const yaw = reduce ? 0.35 : -0.7 + k * 1.2 + Math.sin(t * 0.35) * 0.18;
    const el = THREE.MathUtils.degToRad(reduce ? 58 : 62 - Math.sin(k * Math.PI * 2) * 4);
    const D = (aspect < 1.6 ? 13.5 : 11.5) - (reduce ? 0 : Math.sin(k * Math.PI) * 1.0);
    const dir = v3.set(-f.tan.x, 0, -f.tan.z).multiplyScalar(Math.cos(yaw)).addScaledVector(new THREE.Vector3(f.side.x, 0, f.side.z), Math.sin(yaw));
    const want = new THREE.Vector3().copy(cen).addScaledVector(dir, D * Math.cos(el)); want.y = D * Math.sin(el);
    if (first.current) { camera.position.copy(want); look.current.copy(cen); first.current = false; }
    camera.position.lerp(want, 1 - Math.exp(-dt * 2.2));
    look.current.lerp(cen, 1 - Math.exp(-dt * 2.4));
    camera.lookAt(look.current);
    simCam.x = camera.position.x; simCam.y = camera.position.y; simCam.z = camera.position.z;
  });
  return null;
}

function StreetFx() {
  const fired = useRef<Record<string, boolean>>({});
  useEffect(() => { fired.current = {}; }, []);
  useFrame(() => {
    const t = simClock.t, f = fired.current;
    const once = (k: string, at: number, fn: () => void) => { if (t >= at && !f[k]) { f[k] = true; fn(); } };
    const patch = useSim.getState().patch;
    const door = () => { const [x, z] = world(S_DOOR - 0.3, L_DOOR); return { x, y: 1.6, z }; };
    once("wave", TM.wave, () => { sfx("boing", { volume: 0.45 }); patch({ caption: "Friends wave hello" }); });
    once("door", TM.doorIn - 0.4, () => patch({ caption: "A few try the Coin Counter minigame" }));
    once("in", TM.doorIn, () => { sfx("door", { volume: 0.5 }); vfx.burst("sparkle", door(), { n: 8, scale: 1.1 }); });
    once("pop", TM.doorOut, () => {
      sfx("coinIn", { volume: 0.7 }); sfx("good", { volume: 0.5 });
      vfx.burst("coins", door(), { n: 10, scale: 1.2 }); vfx.burst("sparkle", door(), { n: 10, scale: 1.4 });
      patch({ caption: "Minigame coins for the whole class!" });
    });
    once("marlo1", TM.mid + 1.2, () => { sfx("pop", { volume: 0.5 }); patch({ caption: "Chatting with Marlo the Merchant", bubbles: { [NPC_MID.tag]: "Fresh bread, friends! Careful with your coins!" } }); });
    once("marlo2", TM.midEnd - 3, () => patch({ bubbles: { [NPC_MID.tag]: "Come back any time!" } }));
    once("marlo3", TM.midEnd - 0.6, () => patch({ bubbles: {} }));
    once("pair", TM.pair + 0.8, () => sfx("tick", { volume: 0.5 }));
    once("hazel1", TM.npc, () => { sfx("pop", { volume: 0.6 }); sfx("sparkle", { volume: 0.4 }); patch({ caption: "Say hello to Farmer Hazel!", bubbles: { [NPC_END.tag]: "Hi, class! Come and say hello!" } }); });
    once("hazel2", TM.npc + 3.6, () => patch({ bubbles: { [NPC_END.tag]: "Welcome to the street!" } }));
  });
  return null;
}

export function SimStreetScene() {
  useEffect(() => { setGlow(1.7); useSim.getState().patch({ caption: "Evening: the class heads out into the street!", bubbles: {} }); }, []);
  const follow = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => { centroid(follow, simClock.t); });
  return (
    <>
      <SceneReady />
      <StreetCamera />
      <Vfx3D />
      <StreetFx />
      <Sky top="#8a82d4" bottom="#ffd2aa" />
      <Lighting preset="sunset" shadow={{ size: 18, far: 90 }} target={[0, 0, -12]} follow={() => follow} />
      <PostFX preset="sunset" />
      <Cloud position={[-20, 22, -40]} scale={3} />
      <Cloud position={[15, 26, -55]} scale={3.6} speed={0.08} />
      <Meadow />
      <SunShafts />
      <Road />
      <Scenery keep={keepProp} />
      <Gate />
      <Npc n={NPC_END} />
      <Npc n={NPC_MID} />
      <SimCrowd pose={streetPose} scale={PS} headY={0.5} />
    </>
  );
}
