// Night Market: first-person and WALKABLE (WASD/arrows + drag-to-look on desktop, joystick + drag on touch).
// Tap/click an item within reach to inspect it; the basket is a 3D viewmodel at the bottom of the view.
import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { create } from "zustand";
import { useGame } from "../game/store.ts";
import { MARKET_ITEMS, MARKET_BY_ID } from "../game/content/economy.ts";
import { Character, Model, Sky } from "./common.tsx";
import { Props, Prop, rng, setGlow, usePainterly, type EnvName, type Inst } from "./env.tsx";
import { Halos } from "./fx.tsx";
import { move, pollGamepadSticks } from "../platform/device.ts";
import { sfx } from "../audio/audio.ts";
import { vfx } from "../fx/vfx.ts";
import { Vfx3D, IdleSparkle } from "../fx/Vfx3D.tsx";
import { Grass, Lighting, PostFX, scatter, useGroundTexture } from "./look.tsx";

type MarketView = { selected: string | null; nearCashier: boolean; hasMoved: boolean; pointerLocked: boolean };
export const useMarket = create<MarketView & { set(p: Partial<MarketView>): void }>((set) => ({
  selected: null, nearCashier: false, hasMoved: false, pointerLocked: false, set: (p) => set(p),
}));
/** Joystick input written by the UI (−1..1). */
export const joy = { x: 0, y: 0 };

const BOUNDS = { x: 2.9, zMin: -21.3, zMax: 4 }; // zMin keeps you in front of the cashier counter
const CASHIER = new THREE.Vector3(0, 0, -24.2);

interface Slot { id: string; pos: THREE.Vector3; stall: number }

function layout(): { stalls: { pos: [number, number, number]; rot: number; kind: string; trap: boolean }[]; slots: Slot[] } {
  const needs = MARKET_ITEMS.filter((m) => m.kind !== "trap");
  const traps = MARKET_ITEMS.filter((m) => m.kind === "trap");
  const stalls: { pos: [number, number, number]; rot: number; kind: string; trap: boolean }[] = [];
  const slots: Slot[] = [];
  const queue = [...needs];
  let trapIdx = 0;
  for (let i = 0; i < 8; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = 1 - Math.floor(i / 2) * 6 - (side > 0 ? 3 : 0);
    const trap = i === 2 || i === 5 || i === 7;
    stalls.push({ pos: [side * 4.6, 0, z], rot: side * -Math.PI / 2, kind: trap ? "stall_pink" : (["stall_terra", "stall_teal", "stall_mustard"][i % 3]), trap });
    const items = trap ? traps.slice(trapIdx, trapIdx + 2) : queue.splice(0, 3);
    if (trap) trapIdx += 2;
    items.forEach((m, k) => slots.push({ id: m.id, pos: new THREE.Vector3(side * 3.75, 1.16, z - 0.9 + k * 0.9), stall: i }));
  }
  // leftovers (if any) on the last trap stall
  traps.slice(trapIdx).forEach((m, k) => slots.push({ id: m.id, pos: new THREE.Vector3(3.75, 1.16, -20 + k * 0.9), stall: 7 }));
  return { stalls, slots };
}

function PriceTag({ text, position, hot }: { text: string; position: THREE.Vector3; hot?: boolean }) {
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = 256; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = hot ? "#ff3d6e" : "#ecdcb6"; g.strokeStyle = "#2b2118"; g.lineWidth = 12;
    g.beginPath(); g.roundRect(8, 8, 240, 112, 22); g.fill(); g.stroke();
    g.fillStyle = hot ? "#fff" : "#2b2118"; g.font = "bold 64px 'Lilita One', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(text, 128, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, [text, hot]);
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(({ camera }) => { ref.current?.lookAt(camera.position); });
  return <mesh ref={ref} position={position}><planeGeometry args={[0.5, 0.25]} /><meshBasicMaterial map={tex} transparent /></mesh>;
}

function ShopItem({ slot, onPick }: { slot: Slot; onPick: (id: string, dist: number) => void }) {
  const m = MARKET_BY_ID[slot.id];
  const ref = useRef<THREE.Group>(null!);
  const trap = m.kind === "trap";
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.rotation.y = clock.elapsedTime * (trap ? 1.2 : 0.4) + slot.pos.z;
    ref.current.position.y = slot.pos.y + (trap ? Math.sin(clock.elapsedTime * 3 + slot.pos.z) * 0.05 : 0);
  });
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return;
    onPick(slot.id, e.distance);
  };
  return (
    <group>
      <group ref={ref} position={slot.pos.toArray()} onClick={click} onPointerOver={() => (document.body.style.cursor = "pointer")} onPointerOut={() => (document.body.style.cursor = "")}>
        <Model url={m.model} scale={(m.scale ?? 1) * 1.5} />
        {/* generous invisible hit box for small items / fingers */}
        <mesh visible={false}><boxGeometry args={[0.7, 0.7, 0.7]} /></mesh>
      </group>
      <PriceTag text={`${m.price}🪙`} position={slot.pos.clone().add(new THREE.Vector3(0, 0.55, 0))} hot={trap} />
      {trap && <Sparkles position={slot.pos.toArray()} count={14} scale={1} size={5} speed={0.6} color="#fff3a0" />}
    </group>
  );
}

function Basket() {
  const basket = useGame((s) => s.market.basket);
  const winning = useGame((s) => !!s.win);
  const ref = useRef<THREE.Group>(null!);
  const { camera } = useThree();
  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), down: new THREE.Vector3(), right: new THREE.Vector3(), q: new THREE.Quaternion() }), []);
  const bump = useRef(0);
  const prevLen = useRef(basket.length);
  useEffect(() => { if (basket.length > prevLen.current) bump.current = 1; prevLen.current = basket.length; }, [basket.length]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || winning) return;
    bump.current = Math.max(0, bump.current - dt * 3);
    camera.getWorldDirection(tmp.fwd);
    tmp.down.set(0, -1, 0).applyQuaternion(camera.quaternion);
    tmp.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    // held low at the bottom-right of the view, like a carried item in a first-person game
    g.position.copy(camera.position).addScaledVector(tmp.fwd, 0.95).addScaledVector(tmp.down, 0.56 - bump.current * 0.06).addScaledVector(tmp.right, 0.48);
    g.quaternion.copy(camera.quaternion);
  });
  return (
    <group ref={ref} visible={!winning}>
      <group rotation={[0.7, -0.35, 0.08]}>
        <Model url="/models/basket.glb" scale={0.38} shadows={false} />
        {basket.slice(-9).map((id, i) => (
          <Model key={i} url={MARKET_BY_ID[id].model} shadows={false}
            position={[((i % 3) - 1) * 0.1, 0.06 + Math.floor(i / 3) * 0.04, ((Math.floor(i / 3) % 2) - 0.5) * 0.07]}
            scale={(MARKET_BY_ID[id].scale ?? 1) * 0.3} />
        ))}
      </group>
    </group>
  );
}

/** Rounded cobblestones on mortar (canvas). */
function useCobbleTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6b5b4d"; g.fillRect(0, 0, 256, 256);
    let s = 77;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) {
      const o = y % 2 ? 21 : 0;
      const v = 128 + Math.floor(r() * 40);
      g.fillStyle = `rgb(${v + 14},${v + 4},${v - 12})`;
      g.beginPath(); g.roundRect(x * 43 + o - 20 + 3, y * 32 + 3, 37, 26, 9); g.fill();
      g.fillStyle = "rgba(255,240,210,.12)";
      g.beginPath(); g.roundRect(x * 43 + o - 20 + 7, y * 32 + 5, 22, 8, 4); g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 16); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, []);
}

/** Twinkle-free star field on a big sphere shell (fog-immune). */
function Stars() {
  const geo = useMemo(() => {
    const n = 500, p: number[] = [];
    let s = 5;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, y = 0.15 + r() * 0.85, rr = Math.sqrt(1 - y * y);
      p.push(Math.cos(th) * rr * 150, y * 150, Math.sin(th) * rr * 150);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3)); return g;
  }, []);
  return <points geometry={geo}><pointsMaterial color={[2, 2, 2.4]} size={1.3} sizeAttenuation={false} fog={false} toneMapped={false} /></points>;
}

function StringLights({ z }: { z: number }) {
  const bulbs = useMemo(() => Array.from({ length: 9 }, (_, i) => {
    const x = -4.4 + i * 1.1;
    return [x, 4.2 - Math.cos(((i - 4) / 4) * 1.2) * 0.6 + 0.6, z] as [number, number, number];
  }), [z]);
  // HDR colours (>1) so bulbs bloom
  const colors: [number, number, number][] = [[3, 2.1, 0.8], [3, 1.2, 1.2], [1.2, 2.2, 3], [1.8, 3, 1.2]];
  const wire = useMemo(() => new THREE.CatmullRomCurve3(bulbs.map((b) => new THREE.Vector3(b[0], b[1] + 0.08, b[2]))), [bulbs]);
  return (
    <group>
      <mesh><tubeGeometry args={[wire, 40, 0.012, 4, false]} /><meshBasicMaterial color="#1a1410" /></mesh>
      {bulbs.map((p, i) => (
        <mesh key={i} position={p}><sphereGeometry args={[0.09, 10, 8]} /><meshBasicMaterial color={colors[i % 4]} toneMapped={false} /></mesh>
      ))}
    </group>
  );
}

function FirstPerson({ onMoveTick }: { onMoveTick: (pos: THREE.Vector3) => void }) {
  const { camera, gl, events, setEvents } = useThree();
  const yaw = useRef(0);
  const pitch = useRef(-0.12);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const frozen = useGame((s) => s.phase !== "market");
  const bob = useRef(0);
  const stepAcc = useRef(0);

  useEffect(() => {
    const pc = camera as THREE.PerspectiveCamera;
    pc.clearViewOffset(); pc.fov = 68; pc.near = 0.1; pc.far = 1800;
    pc.updateProjectionMatrix();
    camera.position.set(0, 1.55, 3.4);
    yaw.current = 0;
    const el = gl.domElement;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') {
        if (useGame.getState().phase === 'market' && !useMarket.getState().selected && !document.querySelector('[data-modal]')) el.requestPointerLock?.()?.catch(() => {});
        return;
      }
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    };
    const mv = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const s = 0.0042;
      yaw.current -= (e.clientX - d.x) * s;
      pitch.current = THREE.MathUtils.clamp(pitch.current - (e.clientY - d.y) * s, -0.9, 0.6);
      d.x = e.clientX; d.y = e.clientY;
    };
    const up = (e: PointerEvent) => { if (drag.current?.id === e.pointerId) drag.current = null; };
    const mouse = (e: MouseEvent) => {
      if (document.pointerLockElement !== el || useMarket.getState().selected || document.querySelector('[data-modal]')) return;
      yaw.current -= e.movementX * .0025;
      pitch.current = THREE.MathUtils.clamp(pitch.current - e.movementY * .0025, -.9, .6);
    };
    const lockChanged = () => useMarket.getState().set({ pointerLocked: document.pointerLockElement === el });
    const compute = events.compute;
    setEvents({ compute: (event, state, previous) => {
      if (document.pointerLockElement === el) { state.pointer.set(0, 0); state.raycaster.setFromCamera(state.pointer, state.camera); }
      else compute?.(event, state, previous);
    } });
    document.addEventListener('mousemove', mouse);
    document.addEventListener('pointerlockchange', lockChanged);
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", mv);
    window.addEventListener("pointerup", up);
    return () => {
      if (document.pointerLockElement === el) document.exitPointerLock();
      setEvents({ compute });
      document.removeEventListener('mousemove', mouse); document.removeEventListener('pointerlockchange', lockChanged);
      el.removeEventListener("pointerdown", down); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up);
    };
  }, [camera, gl]);

  useFrame((_, dt) => {
    if (useGame.getState().win) return; // budget-win cutscene owns the camera
    pollGamepadSticks();
    const blocked = frozen || !!useMarket.getState().selected || !!document.querySelector('[data-modal]');
    if (blocked && document.pointerLockElement === gl.domElement) document.exitPointerLock();
    if (!blocked) { yaw.current -= move.lookX * dt * 2.2; pitch.current = THREE.MathUtils.clamp(pitch.current - move.lookY * dt * 1.6, -0.9, 0.6); }
    const f = blocked ? 0 : THREE.MathUtils.clamp(move.y + joy.y, -1, 1);
    const s = blocked ? 0 : THREE.MathUtils.clamp(move.x + joy.x, -1, 1);
    const speed = 3.0;
    const fwd = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const p = camera.position;
    const mvx = (fwd.x * f + right.x * s) * speed * dt, mvz = (fwd.z * f + right.z * s) * speed * dt;
    p.x += mvx; p.z += mvz;
    p.x = THREE.MathUtils.clamp(p.x, -BOUNDS.x, BOUNDS.x);
    p.z = THREE.MathUtils.clamp(p.z, BOUNDS.zMin, BOUNDS.zMax);
    {
      // the fountain is solid: slide around it instead of walking through the basin
      const dx = p.x - FOUNTAIN.x, dz = p.z - FOUNTAIN.z, d = Math.hypot(dx, dz), min = FOUNTAIN.r + 0.3;
      if (d < min) {
        const nx = d > 1e-4 ? dx / d : 0, nz = d > 1e-4 ? dz / d : 1;
        // walking straight at the basin used to pin you against it (radial push-out has no sideways part): turn the blocked
        // push into a slide round the rim, towards whichever side you are already on (right if dead centre)
        const into = -(mvx * nx + mvz * nz);
        if (into > 0) { const tx = -nz, tz = nx, side = Math.sign(mvx * tx + mvz * tz) || Math.sign(dx) || 1; p.x += tx * side * into * 1.1; p.z += tz * side * into * 1.1; }
        const d2 = Math.hypot(p.x - FOUNTAIN.x, p.z - FOUNTAIN.z) || 1;
        p.x = FOUNTAIN.x + ((p.x - FOUNTAIN.x) / d2) * min; p.z = FOUNTAIN.z + ((p.z - FOUNTAIN.z) / d2) * min;
      }
    }
    const moving = Math.abs(f) + Math.abs(s) > 0.05;
    if (moving && !useMarket.getState().hasMoved) useMarket.getState().set({ hasMoved: true });
    if (moving) {
      bob.current += dt * 9;
      stepAcc.current += dt;
      if (stepAcc.current > 0.38) { stepAcc.current = 0; sfx("step", { volume: 0.3, rate: 0.9 + Math.random() * 0.2 }); {
          // First person never sees its own feet, and the hint pill covers the ground closer than ~4 m. Kick the puffs up just beyond the pill's top
          // edge (4.3-5 m ahead, either side of the aisle) so every step visibly stirs the cobbles.
          const ahead = 4.3 + Math.random() * 0.7, sd = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.1);
          vfx.burst("dust", { x: p.x + fwd.x * ahead + right.x * sd, y: 0.12, z: p.z + fwd.z * ahead + right.z * sd }, { n: 5, scale: 1.0 });
        } }
    }
    p.y = 1.55 + (reduce ? 0 : Math.sin(bob.current) * 0.035);
    camera.rotation.set(pitch.current, yaw.current, 0, "YXZ");
    onMoveTick(p);
  });
  return null;
}

const FOUNTAIN = { x: 0, z: -12, r: 1.5, scale: 0.7 };

/** Static dressing for the plaza: houses around the edge, hedges/trees as a night backdrop, lamp posts, crates. Built once. */
function buildMarket(stalls: ReturnType<typeof layout>["stalls"]) {
  const L: Partial<Record<EnvName, Inst[]>> = {};
  const put = (n: EnvName, x: number, z: number, r = 0, s = 1) => { (L[n] ??= []).push({ p: [x, 0, z], r, s }); };
  const r = rng(21);
  // stalls (front faces the aisle), a lamp post in every gap between stalls on each side
  stalls.forEach((st) => put(st.kind as EnvName, st.pos[0], st.pos[2], st.rot));
  for (const side of [-1, 1]) for (const z of [-0.5, -6.5, -12.5, -18.5, 3.2]) put("lamp_post", side * 3.35, z - (side > 0 ? 3 : 0), side > 0 ? Math.PI / 2 : -Math.PI / 2);
  // crates / barrels beside the stalls
  stalls.forEach((st, i) => {
    const side = st.pos[0] < 0 ? -1 : 1;
    put(i % 2 ? "crate" : "barrel", st.pos[0] + side * 1.9, st.pos[2] + 1.3, r() * 6, 1.1);
    if (i % 3 === 0) put("crate", st.pos[0] + side * 2.2, st.pos[2] + 0.55, r() * 6, 0.9);
  });
  // houses around the plaza, fronts facing the aisle
  const kinds: EnvName[] = ["cottage_a", "house_two", "cottage_b", "cottage_c", "house_tall", "cottage_a"];
  let i = 0;
  for (const side of [-1, 1]) for (const z of [2, -6.5, -15, -23]) {
    const k = kinds[i++ % kinds.length];
    put(k, side * 10.4, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
    put((["bush_a", "bush_pink", "bush_white"] as EnvName[])[i % 3], side * 7.8, z + 2.2, r() * 6, 0.9);
    put((["flowers_pink", "flowers_yellow", "flowers_white", "flowers_purple"] as EnvName[])[i % 4], side * 7.9, z - 1.8, r() * 6, 1.2);
    put("fence", side * 7.5, z - 3.2, Math.PI / 2, 1);
  }
  // end-of-street houses behind the cashier + trees as a dark backdrop
  put("house_two", -5.8, -30.5, 0); put("cottage_b", 5.8, -30.5, 0);
  for (let k = 0; k < 34; k++) {
    const side = k % 2 ? 1 : -1;
    put((["tree_oak_a", "tree_pine", "tree_round", "tree_oak_b", "tree_olive"] as EnvName[])[k % 5], side * (15 + r() * 14), 8 - k * 1.9 + r() * 4, r() * 6, 1.1 + r() * 0.5);
  }
  for (let k = 0; k < 8; k++) put(k % 2 ? "tree_pine" : "tree_oak_a", -16 + k * 4.6 + r() * 2, -37 - r() * 5, r() * 6, 1.2 + r() * 0.4);
  [[-3.2, 3.6], [3.4, 3.2], [-3.4, -22.8], [3.4, -22.8]].forEach(([x, z]) => put("lamp_post", x, z, 0));
  return L;
}

/** Low moon + soft halo (HDR so it blooms), fog-immune. */
function Moon() {
  const halo = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,244,214,0.55)"); gr.addColorStop(0.35, "rgba(200,210,255,0.18)"); gr.addColorStop(1, "rgba(160,170,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }, []);
  return (
    <group position={[-34, 46, -92]}>
      <mesh><sphereGeometry args={[4.2, 24, 16]} /><meshBasicMaterial color={[2.6, 2.4, 1.9]} toneMapped={false} fog={false} /></mesh>
      <mesh position={[0, 0, 0.5]}><planeGeometry args={[34, 34]} /><meshBasicMaterial map={halo} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} /></mesh>
    </group>
  );
}


/** Budget-win cutscene, 3D part: the ruler walks out of the market toward the camera carrying the basket, in warm lantern light.
 *  Framing: the ruler grows from ~22% to ~40% of the screen height (dolly in + walk), basket hangs from the right hand part (hand_r). */
const WIN_WALK_S = 2.6;
const WIN_SCALE = 2.4;
const BASKET_WORLD = 0.46; // world size of one basket model unit
function WinShot() {
  const win = useGame((s) => s.win);
  const ruler = useGame((s) => s.run?.rulerModel) ?? "character-female-c";
  const reduce = useGame((s) => s.settings.reduceMotion);
  const { camera } = useThree();
  const t0 = useRef(0);
  const who = useRef<THREE.Group>(null!);
  const light = useRef<THREE.PointLight>(null!);
  useEffect(() => {
    t0.current = performance.now();
    if (win) { const pc = camera as THREE.PerspectiveCamera; pc.fov = 52; pc.updateProjectionMatrix(); }
  }, [win, camera]);
  useFrame(() => {
    if (!win) return;
    const t = Math.min(1, (performance.now() - t0.current) / 1000 / WIN_WALK_S);
    const e = reduce ? 1 : 1 - Math.pow(1 - t, 2);
    const z = -22.4 + e * 2.9;
    if (who.current) who.current.position.set(0, 0, z);
    if (light.current) light.current.position.set(0.6, 2.6, z + 1.2);
    camera.position.set(0.05, 0.95, -17.1 + e * 0.9);
    camera.lookAt(0, 0.66, z - 0.4);
  });
  if (!win) return null;
  const items = win.basket.slice(-6);
  const ls = BASKET_WORLD / (0.44 * WIN_SCALE); // basket model unit -> hand_r local unit
  return (
    <>
      <pointLight ref={light} intensity={16} distance={9} decay={1.5} color="#ffc27a" />
      <group ref={who} position={[0, 0, -22.4]}>
        <Character url={`/kenney/mini-characters/${ruler}.glb`} anim="walk" scale={WIN_SCALE} crown speed={0.9} carry
          handChildren={
            // grip = the handle's top (y 0.71 in the basket model); the group counter-rotates the raised forearm so the basket hangs level
            <group position={[0, -0.05, 0.02]} rotation={[0.95, 0, -0.18]} scale={ls}>
              <group position={[0, -0.71, 0]}>
                <Model url="/models/basket.glb" shadows={false} />
                {items.map((id, i) => (
                  <Model key={i} url={MARKET_BY_ID[id].model} shadows={false}
                    position={[((i % 3) - 1) * 0.25, 0.35 + Math.floor(i / 3) * 0.2, (Math.floor(i / 3) % 2 - 0.5) * 0.2]}
                    scale={(MARKET_BY_ID[id].scale ?? 1) * 0.75} />
                ))}
              </group>
            </group>
          } />
        <Sparkles count={26} scale={[2.4, 2.6, 2]} position={[0, 1.2, 0]} size={5} speed={0.5} color="#ffe9a0" />
      </group>
    </>
  );
}

export default function MarketScene() {
  const { stalls, slots } = useMemo(layout, []);
  const dressing = useMemo(() => buildMarket(stalls), [stalls]);
  const setM = useMarket((s) => s.set);
  const phase = useGame((s) => s.phase);
  const camera = useThree((s) => s.camera);
  const dirt = useGroundTexture("#8f7a5e", "#6a5843", "#b39d7c", 10, 4);
  const cobble = useCobbleTexture();
  const dirtMat = usePainterly({ map: dirt, detail: "ground", scale: 0.1, roughness: 1 }, [dirt]);
  const cobbleMat = usePainterly({ map: cobble, detail: "stone", scale: 0.35, roughness: 0.8 }, [cobble]);
  // lantern haze: glow points at every lamp post lantern + string-light bulb
  const haze = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (const it of dressing.lamp_post ?? []) pts.push([it.p[0] + 0.7 * Math.cos(it.r ?? 0), 2.95, it.p[2] - 0.7 * Math.sin(it.r ?? 0)]);
    for (const z of [-1, -7, -13, -19]) for (let i = 0; i < 9; i++) { const x = -4.4 + i * 1.1; pts.push([x, 4.2 - Math.cos(((i - 4) / 4) * 1.2) * 0.6 + 0.6, z]); }
    return pts;
  }, [dressing]);
  // grass tufts in the strips beside the stalls and behind the houses
  const grass = useMemo(() => scatter(7000, -16, 16, -33, 8, (x) => Math.abs(x) > 6.1 && Math.abs(x) < 8.0 || Math.abs(x) > 13, 9), []);

  useEffect(() => { setM({ selected: null, nearCashier: false, hasMoved: false, pointerLocked: document.pointerLockElement === document.querySelector('canvas') }); setGlow(3.2); }, [setM]);

  const pick = (id: string, dist: number) => {
    if (phase !== "market") return;
    if (dist > 6.5) { sfx("hmm", { volume: 0.4 }); return; } // generous reach: tapping what you can see should work
    sfx("pop");
    const sp = slots.find((q) => q.id === id)?.pos; if (sp) vfx.burst("sparkle", sp, { n: 10, scale: 0.8 });
    if (document.pointerLockElement) document.exitPointerLock();
    setM({ selected: id });
  };

  return (
    <>
      <FirstPerson onMoveTick={(p) => {
        const near = p.distanceTo(new THREE.Vector3(CASHIER.x, p.y, CASHIER.z)) < 4.4; // whole end of the aisle counts (zMin keeps you ~2.9 m from the counter)
        if (near !== useMarket.getState().nearCashier) setM({ nearCashier: near });
      }} />
      <Sky top="#171b50" bottom="#7a4f96" />
      <Lighting preset="night" shadow={{ size: 14, far: 50 }} target={[0, 0, -10]} follow={() => camera.position} />
      <PostFX preset="night" />
      {[-2, -9, -16, -22].map((z) => <pointLight key={z} position={[0, 3.6, z]} intensity={26} distance={12} decay={1.6} color="#ffb766" />)}
      <Stars />
      <Moon />

      {/* ground: packed earth, a lighter cobbled aisle down the middle */}
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
      {slots.map((s) => <ShopItem key={s.id} slot={s} onPick={pick} />)}
      {[-1, -7, -13, -19].map((z) => <StringLights key={z} z={z} />)}

      {/* cashier at the end */}
      <group position={CASHIER.toArray()}>
        <Prop name="stall_teal" scale={1.1} />
        <group name="MarketShopkeeper"><Character url="/models/chars/marlo.glb" anim="idle" position={[0, 0, 1.4]} scale={3.2} /></group>
        <PriceTag text="PAY" position={new THREE.Vector3(0, 3.5, 0.6)} />
      </group>
      <IdleSparkle at={[0, 2.6, CASHIER.z + 1.2]} every={2.2} spread={1.1} scale={1.3} size={1.3} />
      <Prop name="fountain" position={[FOUNTAIN.x, 0, FOUNTAIN.z]} scale={FOUNTAIN.scale} />
      <pointLight position={[0, 2.4, FOUNTAIN.z]} intensity={6} distance={7} color="#9fd8ff" />

      <Halos points={haze} size={4.2} color="#ffb766" opacity={0.5} />
      <Basket />
      <Vfx3D slotPos={(id) => slots.find((q) => q.id === id)?.pos} />
      <WinShot />
    </>
  );
}
