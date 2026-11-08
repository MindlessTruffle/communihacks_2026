// Multiplayer simulation, sections 4 + 5 (3D): the real night market (stalls, lamps, string lights, cashier) with ten players browsing,
// two getting tempted by the pink "SALE" stalls, and everyone ending at the counter. The end card reuses the same scene.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../game/store.ts";
import { Character, Sky } from "../scenes/common.tsx";
import { CASHIER, FOUNTAIN, PriceTag, ShopItem, Stars, StringLights, Moon, buildMarket, layout, useCobbleTexture } from "../scenes/MarketScene.tsx";
import { Props, Prop, setGlow, usePainterly, type EnvName } from "../scenes/env.tsx";
import { Halos } from "../scenes/fx.tsx";
import { Grass, Lighting, PostFX, scatter, useGroundTexture } from "../scenes/look.tsx";
import { Vfx3D, IdleSparkle } from "../fx/Vfx3D.tsx";
import { vfx } from "../fx/vfx.ts";
import { sfx } from "../audio/audio.ts";
import { N, T, mulberry, SIM_SEED } from "./simData.ts";
import { SimCrowd, SceneReady, type Pose, type PoseFn } from "./simActors.tsx";
import { simClock, simCam, useSim, type Section } from "./simStore.ts";

const PS = 2.5;
const Z_STOP = -16.9;
/** [time, z of the group front] keyframes (eased between): they browse, drift on, browse again, then queue */
const GK: [number, number][] = [[0, -2], [4, -3], [8, -6], [12, -9], [16, -12.8], [20, -15.6], [25, Z_STOP]];
const T_QUEUE = 19.5;           // everyone heads for the till
export const MARKET_PAY_AT = 21.0;
const T_PAY0 = MARKET_PAY_AT;            // first pair pays; later pairs follow every 0.55 s
const zGroup = (t: number) => {
  for (let k = 0; k < GK.length - 1; k++) if (t < GK[k + 1][0]) return GK[k][1] + (GK[k + 1][1] - GK[k][1]) * sm((t - GK[k][0]) / (GK[k + 1][0] - GK[k][0]));
  return GK[GK.length - 1][1];
};

const { stalls, slots } = layout();
const stallSide = (s: number) => (stalls[s].pos[0] < 0 ? -1 : 1);
const itemsAt = (s: number) => slots.filter((q) => q.stall === s);

// formation in the aisle (5 lateral slots x 2 rows)
const SLOT = (() => {
  const r = mulberry(SIM_SEED + 70);
  const out = Array.from({ length: N }, (_, i) => ({ x: (i % 5 - 2) * 1.05 + (r() - 0.5) * 0.25, f: (i < 5 ? 0 : 1.5) + (r() - 0.5) * 0.35 }));
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
})();
// queue at the till: two files, in a shuffled order
const QUEUE = (() => {
  const r = mulberry(SIM_SEED + 71), order = Array.from({ length: N }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const pos = new Array<{ x: number; z: number; k: number }>(N);
  order.forEach((p, k) => { pos[p] = { x: (k % 2 ? 1 : -1) * 1.45, z: Z_STOP + Math.floor(k / 2) * 1.05, k }; });
  return pos;
})();

/** One stop at a stall. `tempted`: stares at the shiny SALE item, picks it up, hesitates and puts it back. */
type Stop = { stall: number; item: number; t0: number; tempted?: boolean };
const STOP_MOVE = 1.1, STOP_BACK = 1.1;
const dwell = (s: Stop) => (s.tempted ? 4.2 : 2.0);
// (only stalls 0,1,3,4 sell "needs" and 2,5,7 are the pink SALE stalls; stall 1 / 2 / 3 / 4 / 5 sit at z = -2 / -5 / -8 / -11 / -14)
const PLAN: Record<number, Stop[]> = {
  1: [{ stall: 1, item: 0, t0: 1.0 }, { stall: 3, item: 2, t0: 8.5 }],
  5: [{ stall: 1, item: 2, t0: 2.2 }, { stall: 4, item: 0, t0: 12.5 }],
  3: [{ stall: 2, item: 0, t0: 4.2, tempted: true }, { stall: 4, item: 0, t0: 11.5 }],
  7: [{ stall: 5, item: 1, t0: 13.2, tempted: true }],
  0: [{ stall: 3, item: 1, t0: 6.2 }, { stall: 4, item: 0, t0: 15.0 }],
  8: [{ stall: 3, item: 2, t0: 6.8 }],
  2: [{ stall: 4, item: 0, t0: 10.6 }],
  6: [{ stall: 1, item: 1, t0: 1.6 }, { stall: 4, item: 0, t0: 10.9 }],
  4: [{ stall: 1, item: 1, t0: 3.2 }, { stall: 3, item: 0, t0: 7.4 }],
  9: [{ stall: 3, item: 0, t0: 7.9 }],
};
export const MARKET_PICKS = Object.entries(PLAN).flatMap(([p, list]) => list.map((s) => ({ p: Number(p), ...s })));

const iconFor = (id: string) => (id === "wine" ? "juice" : id);

/** the fountain is solid: players split around it */
function avoid(x: number, z: number) {
  const dz = z - FOUNTAIN.z, min = 2.15;
  if (Math.abs(dz) >= min) return x;
  const xm = Math.sqrt(min * min - dz * dz);
  return Math.abs(x) < xm ? (x < 0 ? -xm : xm) : x;
}
function baseAt(i: number, t: number) {
  const sl = SLOT[i], z = zGroup(t) + sl.f;
  const walking = Math.abs(zGroup(t + 0.1) - zGroup(t - 0.1)) > 0.03 ? 1 : 0.25;
  return { x: sl.x + Math.sin(t * 1.5 + i * 1.1) * 0.22 * walking, z };
}
function sm(k: number) { const c = Math.min(1, Math.max(0, k)); return c * c * (3 - 2 * c); }

export const marketPose: PoseFn = (i, t): Pose => {
  let b = baseAt(i, t);
  let anim = "auto", icon: Pose["icon"] = null, rot: number | undefined, speed: number | undefined, y = 0;
  // heading for the till (queue) from T_QUEUE
  const q = QUEUE[i];
  const qk = sm((t - (T_QUEUE + (q.k % 5) * 0.25)) / 2.4);
  if (qk > 0) b = { x: b.x + (q.x - b.x) * qk, z: b.z + (q.z - b.z) * qk };
  let { x, z } = b;
  for (const st of PLAN[i] ?? []) {
    const side = stallSide(st.stall), item = itemsAt(st.stall)[st.item];
    const spot = { x: side * 2.3, z: item.pos.z };
    const t1 = st.t0 + STOP_MOVE, t2 = t1 + dwell(st), t3 = t2 + STOP_BACK;
    if (t < st.t0 || t >= t3) continue;
    const bs = baseAt(i, t);
    if (t < t1) { const k = sm((t - st.t0) / STOP_MOVE); x = bs.x + (spot.x - bs.x) * k; z = bs.z + (spot.z - bs.z) * k; speed = 1.4; }
    else if (t < t2) {
      x = spot.x; z = spot.z; rot = side * Math.PI / 2;
      const w = t - t1;
      if (st.tempted) {
        // 0-1.1 stares (heart), 1.1-2.2 picks it up, 2.2-3.5 shakes head (cross) and puts it back
        if (w < 1.1) { anim = "idle"; icon = { name: "heart", k: w / 1.1 }; y = Math.abs(Math.sin(w * 9)) * 0.05; }
        else if (w < 2.2) { anim = "pick-up"; icon = { name: iconFor(item.id), k: (w - 1.1) / 1.1 }; }
        else if (w < 3.5) { anim = "emote-no"; icon = { name: "cross", k: (w - 2.2) / 1.3 }; }
        else anim = "idle";
      } else {
        anim = w < 0.3 ? "idle" : "pick-up";
        if (w > 0.35) icon = { name: iconFor(item.id), k: Math.min(0.99, (w - 0.35) / 1.4) };
      }
    } else { const k = sm((t - t2) / STOP_BACK); x = spot.x + (bs.x - spot.x) * k; z = spot.z + (bs.z - spot.z) * k; speed = 1.3; }
  }
  // at the till: face the cashier, pay in turn (coin pop), cheer
  if (qk >= 1 && rot === undefined && anim === "auto") rot = Math.PI;
  const pay = T_PAY0 + Math.floor(q.k / 2) * 0.55;
  if (qk >= 1 && anim === "auto") {
    const k = (t - pay) / 1.1;
    if (k > 0 && k < 1) icon = { name: "coin", k };
    if (k > 0.1) anim = "emote-yes";
  }
  return { x: avoid(x, z), z, y, anim, icon, rot, speed };
};

/** End card: the class celebrates in front of the cashier (same spots as the queue, so the cut is seamless). */
export const endPose: PoseFn = (i, t): Pose => {
  const q = QUEUE[i];
  const j = Math.abs(Math.sin(t * 4.2 + i * 1.9)) * 0.12;
  return { x: avoid(q.x, q.z), z: q.z, y: j, rot: Math.PI + (i % 2 ? 0.2 : -0.2), anim: i % 3 === 0 ? "emote-yes" : "idle" };
};

const cen = new THREE.Vector3();
function MarketCamera({ ending }: { ending: boolean }) {
  const { camera, size } = useThree();
  const reduce = useGame((s) => s.settings.reduceMotion);
  const look = useRef(new THREE.Vector3());
  const first = useRef(true);
  useEffect(() => { const c = camera as THREE.PerspectiveCamera; c.clearViewOffset(); c.fov = 44; c.near = 0.1; c.far = 1800; c.updateProjectionMatrix(); first.current = true; }, [camera]);
  useFrame((_, dt) => {
    const t = simClock.t, aspect = size.width / size.height;
    // follow the average position of the players (they spread out over stalls), damped so it drifts
    let zs = 0, xs = 0;
    for (let i = 0; i < N; i++) { const p = (ending ? endPose : marketPose)(i, t); zs += p.z; xs += p.x; }
    cen.set(xs / N * 0.5, 0.4, zs / N);
    const k = ending ? Math.min(1, t / 6) : Math.min(1, t / T.market);
    const yaw = reduce ? 0.2 : ending ? -0.55 + k * 0.7 : -0.55 + k * 0.95 + Math.sin(t * 0.3) * 0.15;
    const el = THREE.MathUtils.degToRad(reduce ? 50 : ending ? 52 : 54 - Math.sin(k * Math.PI * 2) * 4);
    const D = (aspect < 1.6 ? 11.5 : 9.8) - (reduce || ending ? 0 : Math.sin(k * Math.PI) * 0.8);
    const dir = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    const want = new THREE.Vector3().copy(cen).addScaledVector(dir, D * Math.cos(el)); want.y = D * Math.sin(el);
    if (first.current) { camera.position.copy(want); look.current.copy(cen); first.current = false; }
    camera.position.lerp(want, 1 - Math.exp(-dt * 2.2));
    look.current.lerp(cen, 1 - Math.exp(-dt * 2.4));
    camera.lookAt(look.current);
    simCam.x = camera.position.x; simCam.y = camera.position.y; simCam.z = camera.position.z;
  });
  return null;
}

function MarketFx({ ending }: { ending: boolean }) {
  const fired = useRef<Record<string, boolean>>({});
  useEffect(() => { fired.current = {}; }, [ending]);
  useFrame(() => {
    const t = simClock.t, f = fired.current;
    const once = (k: string, at: number, fn: () => void) => { if (t >= at && !f[k]) { f[k] = true; fn(); } };
    if (ending) {
      once("fan", 0.15, () => { vfx.burst("confetti", { x: 0, y: 2.6, z: Z_STOP + 0.5 }, { scale: 3.4, n: 40, size: 1.4 }); });
      for (let k = 1; k < 5; k++) once("c" + k, 0.15 + k * 1.1, () => vfx.burst("confetti", { x: (k % 2 ? -1 : 1) * 1.6, y: 2.4, z: Z_STOP + 0.2 }, { scale: 2.6, n: 22, size: 1.3 }));
      return;
    }
    // each pick: a tiny pop at the item + a soft sound
    MARKET_PICKS.forEach((pk, n) => {
      const item = itemsAt(pk.stall)[pk.item], t1 = pk.t0 + STOP_MOVE;
      if (pk.tempted) {
        once("tm" + n, t1 + 0.1, () => { sfx("sparkle", { volume: 0.4 }); vfx.burst("sparkle", item.pos, { n: 8, scale: 0.8 }); });
        once("tp" + n, t1 + 2.3, () => sfx("hmm", { volume: 0.45 }));
      } else once("pk" + n, t1 + 0.4, () => { sfx("pop", { volume: 0.55, rate: 0.9 + (n % 7) * 0.04 }); vfx.burst("sparkle", item.pos, { n: 6, scale: 0.7 }); });
    });
    once("queue", T_QUEUE, () => useSim.getState().patch({ caption: "Time to pay at the counter" }));
    once("pay", T_PAY0, () => { vfx.burst("coins", { x: 0, y: 1.6, z: Z_STOP - 0.5 }, { n: 12, scale: 1.8 }); sfx("coinIn", { volume: 0.7 }); });
    once("pay2", T_PAY0 + 1.1, () => { vfx.burst("coins", { x: 0, y: 1.6, z: Z_STOP - 0.5 }, { n: 12, scale: 1.8 }); sfx("coinIn", { volume: 0.7 }); });
    once("pay3", T_PAY0 + 2.2, () => { vfx.burst("coins", { x: 0, y: 1.6, z: Z_STOP - 0.5 }, { n: 12, scale: 1.8 }); sfx("coinIn", { volume: 0.7 }); });
    once("done", T.market - 0.4, () => sfx("stars", { volume: 0.5 }));
  });
  return null;
}

export function SimMarketScene({ section }: { section: Section }) {
  const ending = section === "end";
  const dressing = useMemo(() => buildMarket(stalls), []);
  const dirt = useGroundTexture("#8f7a5e", "#6a5843", "#b39d7c", 10, 4);
  const cobble = useCobbleTexture();
  const dirtMat = usePainterly({ map: dirt, detail: "ground", scale: 0.1, roughness: 1 }, [dirt]);
  const cobbleMat = usePainterly({ map: cobble, detail: "stone", scale: 0.35, roughness: 0.8 }, [cobble]);
  const haze = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (const it of dressing.lamp_post ?? []) pts.push([it.p[0] + 0.7 * Math.cos(it.r ?? 0), 2.95, it.p[2] - 0.7 * Math.sin(it.r ?? 0)]);
    for (const z of [-1, -7, -13, -19]) for (let i = 0; i < 9; i++) { const x = -4.4 + i * 1.1; pts.push([x, 4.2 - Math.cos(((i - 4) / 4) * 1.2) * 0.6 + 0.6, z]); }
    return pts;
  }, [dressing]);
  const grass = useMemo(() => scatter(7000, -16, 16, -33, 8, (x) => Math.abs(x) > 6.1 && Math.abs(x) < 8.0 || Math.abs(x) > 13, 9), []);
  const follow = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => { follow.set(0, 0, ending ? Z_STOP : zGroup(simClock.t)); });
  useEffect(() => { setGlow(3.2); if (!ending) useSim.getState().patch({ caption: "Night market: the class goes shopping!", bubbles: {} }); }, [ending]);
  return (
    <>
      <SceneReady />
      <MarketCamera ending={ending} />
      <Vfx3D slotPos={(id) => slots.find((q) => q.id === id)?.pos} />
      <MarketFx ending={ending} />
      <Sky top="#171b50" bottom="#7a4f96" />
      <Lighting preset="night" shadow={{ size: 14, far: 50 }} target={[0, 0, -10]} follow={() => follow} />
      <PostFX preset="night" />
      {[-2, -9, -16, -22].map((z) => <pointLight key={z} position={[0, 3.6, z]} intensity={26} distance={12} decay={1.6} color="#ffb766" />)}
      <Stars />
      <Moon />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -10]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <primitive object={dirtMat} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -10]} receiveShadow>
        <planeGeometry args={[6.2, 34]} />
        <primitive object={cobbleMat} attach="material" />
      </mesh>
      <Grass points={grass} base="#2f6a3a" tip="#8fc86a" height={0.5} />
      {(Object.keys(dressing) as EnvName[]).map((n) => <Props key={n} name={n} items={dressing[n]!} cell={40} />)}
      {stalls.filter((s) => s.trap).map((s, i) => <pointLight key={i} position={[s.pos[0] + (s.pos[0] < 0 ? 1.4 : -1.4), 2.2, s.pos[2]]} intensity={7} distance={5.5} color="#ff6bb5" />)}
      {slots.map((s) => <ShopItem key={s.id} slot={s} onPick={() => {}} />)}
      {[-1, -7, -13, -19].map((z) => <StringLights key={z} z={z} />)}
      <group position={CASHIER.toArray()}>
        <Prop name="stall_teal" scale={1.1} />
        <group name="MarketShopkeeper"><Character url="/models/chars/marlo.glb" anim="idle" position={[0, 0, 1.4]} scale={3.2} /></group>
        <PriceTag text="PAY" position={new THREE.Vector3(0, 3.5, 0.6)} />
      </group>
      <IdleSparkle at={[0, 2.6, CASHIER.z + 1.2]} every={2.2} spread={1.1} scale={1.3} size={1.3} />
      <Prop name="fountain" position={[FOUNTAIN.x, 0, FOUNTAIN.z]} scale={FOUNTAIN.scale} />
      <pointLight position={[0, 2.4, FOUNTAIN.z]} intensity={6} distance={7} color="#9fd8ff" />
      <Halos points={haze} size={4.2} color="#ffb766" opacity={0.5} />
      <SimCrowd pose={ending ? endPose : marketPose} scale={PS} headY={0.5} />
    </>
  );
}
