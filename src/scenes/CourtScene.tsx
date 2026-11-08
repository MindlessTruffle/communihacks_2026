// Throne room, direct side view, to scale: big readable characters, few large elements.
// Layout (x right, y up, z toward the camera): brick back wall with 3 pointed windows on z=-1.4, throne on 5 limestone steps at left,
// big coin mound in the left foreground (sized by treasury), plum runner + plain tile floor on the right where visitors stand, owl perch by the stairs.
// Camera: fixed authored direction, safe-bound boxes that must stay on screen, a focus point pinned to a device-specific screen position
// (setViewOffset), dolly back until everything fits -> reframes per aspect instead of stretching.
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGame } from "../game/store.ts";
import { CARD_BY_ID } from "../game/content/cards.ts";
import { CHARACTERS } from "../game/content/characters.ts";
import { UNLOCKS } from "../game/content/economy.ts";
import { Character, Cloud, Owl, Sky, type Vec3 } from "./common.tsx";
import { KingdomDiorama } from "./Kingdom.tsx";
import { sfx } from "../audio/audio.ts";
import { useAnchors, intro, smoothProgress } from "./anchors.ts";
import { HIGH, Lighting, PostFX } from "./look.tsx";
import { Gallery, Prop, brickMat, setGlow } from "./env.tsx";
import { Flame, WindowShafts, useRugTexture } from "./fx.tsx";
import { painterlyMaterial } from "./painterly.ts";
import { Sparkles } from "@react-three/drei";
import { getDevice } from "../platform/device.ts";
import { vfx } from "../fx/vfx.ts";
import { Vfx3D } from "../fx/Vfx3D.tsx";

/** Kenney mini characters are ~0.37 units tall: x5 = ~1.9 m, to scale with the 7-10 m wall and 1.7 m dais. */
const CHAR = 5;
export const COURT = {
  throne: [-7.4, 0, 0.3] as Vec3,   // origin of the throne asset (floor under the seat)
  seat: [-0.1, 1.95, 0.0] as Vec3,   // ruler's origin relative to the throne group
  visitorStand: 2.9,
  visitorZ: 2.7,
  offstage: 15,
  owl: [-3.2, 0, 1.2] as Vec3,   // floor perch right of the stairs, in front of the plain wall between stairs and window 1; head ~ ruler-head height
  coins: [-8.4, 0, 3.7] as Vec3,
  wallZ: -1.5,
};

// ---------------------------------------------------------------------------------------------------- camera framing
const DIR = new THREE.Vector3(0, -0.012, -1).normalize();
const FOCUS = new THREE.Vector3(-6.8, 2.6, 0.3);
/** Boxes that must stay on screen: throne + ruler + coin mound, and the visitor lane (walk-in / stand). */
const SAFE: { min: [number, number, number]; max: [number, number, number] }[] = [
  { min: [-10.3, 0, -1.1], max: [-2.4, 5.2, 2.3] },   // throne, ruler, steps, owl
  { min: [-9.8, 0, 1.5], max: [-5.8, 2.4, 5.8] },     // coin mound + spill
  { min: [1.4, 0, 1.5], max: [4.5, 3.4, 3.9] },
];
interface Profile { ax: number; ay: number; u: [number, number]; v: [number, number] }
/** Where the ruler/focus sits on screen + the safe rectangle, per device, so the HUD (stats bottom-left, speech panel top-right) never covers characters. */
function profileFor(w: number, h: number): Profile {
  const d = getDevice();
  const aspect = w / h;
  if (aspect < 0.9) return { ax: 0.36, ay: 0.4, u: [0.04, 0.96], v: [0.07, 0.9] };            // portrait (rotate prompt shows anyway)
  if (d.form === "phone") return { ax: 0.25, ay: 0.5, u: [0.03, 0.97], v: [0.08, 0.86] };      // small landscape: roomy margins, bottom-left stats
  if (d.form === "tablet" || aspect < 1.5) return { ax: 0.24, ay: 0.5, u: [0.025, 0.975], v: [0.05, 0.91] };
  return { ax: 0.24, ay: 0.5, u: [0.02, 0.98], v: [0.04, 0.93] };
}
const OWL_HEAD_Y = 4.0; // world y of the owl's head (perch bar 2.7 + owl)
type ViewCam = THREE.PerspectiveCamera & { view: { offsetX: number; offsetY: number } };
/**
 * Brick continuing past the authored wall slab (x -16..16, y 0..10) so square / tall / ultrawide frames never see sky
 * above or beside the wall. Same painterly brick material + planar UVs (x/4, y/4) so the bricks line up.
 */
function WallExtension({ z }: { z: number }) {
  const geo = useMemo(() => {
    const rects: [number, number, number, number][] = [[-80, 10, 80, 70], [-80, -1, -16, 10], [16, -1, 80, 10]]; // x0,y0,x1,y1
    const pos: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
    rects.forEach(([x0, y0, x1, y1], r) => {
      const b = r * 4;
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { pos.push(x, y, 0); uv.push(x / 4, y / 4); col.push(1, 1, 1); }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }, []);
  // Hidden on the title screen and during the cloud descent: from the sky camera this plane reads as a giant brick slab.
  const ref = useRef<THREE.Mesh>(null!);
  useFrame(() => {
    const phase = useGame.getState().phase;
    if (ref.current) ref.current.visible = phase !== "title" || intro.progress >= 1;
  });
  return <mesh ref={ref} geometry={geo} material={brickMat} position={[0, 0, z - 0.02]} receiveShadow />;
}

export function frameCourt(w: number, h: number) {
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 1800) as ViewCam;
  const P = profileFor(w, h);
  let used = 0;
  for (let dist = 14; dist < 400; dist *= 1.015) {
    used = dist;
    cam.position.copy(FOCUS).addScaledVector(DIR, -dist);
    cam.lookAt(cam.position.clone().add(DIR));
    cam.clearViewOffset(); cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    const pr = FOCUS.clone().project(cam);
    cam.setViewOffset(w, h, (pr.x - (2 * P.ax - 1)) * w / 2, -(pr.y - (1 - 2 * P.ay)) * h / 2, w, h);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
    let fits = true;
    for (const b of SAFE) for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const p = new THREE.Vector3(x, y, z).project(cam), u = (p.x + 1) / 2, v = (1 - p.y) / 2;
      if (u < P.u[0] || u > P.u[1] || v < P.v[0] || v > P.v[1]) fits = false;
    }
    if (fits) break;
  }
  if (import.meta.env.DEV) (window as unknown as { __courtFrame?: unknown }).__courtFrame = { w, h, dist: used, ...P, view: [cam.view.offsetX, cam.view.offsetY] };
  const head = new THREE.Vector3(COURT.throne[0] + 0.2, 4.35, COURT.throne[2]).project(cam);
  const owl = new THREE.Vector3(COURT.owl[0], OWL_HEAD_Y, COURT.owl[2]).project(cam);
  return { cam, view: { x: cam.view.offsetX, y: cam.view.offsetY }, owl: [(owl.x * 0.5 + 0.5) * 100, (1 - (owl.y * 0.5 + 0.5)) * 100] as [number, number], head: [(head.x * 0.5 + 0.5) * 100, (1 - (head.y * 0.5 + 0.5)) * 100] as [number, number] };
}
/** Title camera: high over the clouds looking at the three snowy peaks. */
const INTRO_POS = new THREE.Vector3(80, 70, 70);
const INTRO_TARGET = new THREE.Vector3(80, 74, -130);
const INTRO_FOV = 38;

function CourtCamera() {
  const { camera, size } = useThree();
  const phase = useGame((s) => s.phase);
  const [tick, setTick] = useState(0);
  useEffect(() => { const f = () => setTick((t) => t + 1); window.addEventListener("rc-device", f); return () => window.removeEventListener("rc-device", f); }, []);
  const framed = useMemo(() => frameCourt(size.width, size.height), [size.width, size.height, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = useMemo(() => {
    const c = new THREE.PerspectiveCamera(INTRO_FOV, size.width / size.height, 0.5, 1800);
    c.position.copy(INTRO_POS); c.lookAt(INTRO_TARGET); c.updateMatrixWorld(true);
    return c;
  }, [size.width, size.height]);
  const applied = useRef("");
  useEffect(() => { useAnchors.getState().set("ruler", framed.head); useAnchors.getState().set("owl", framed.owl); }, [framed]);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const p = phase === "title" ? smoothProgress(intro.progress) : 1;
    const key = `${p.toFixed(4)}|${size.width}x${size.height}|${tick}`;
    if (applied.current === key) return;
    applied.current = key;
    cam.position.lerpVectors(start.position, framed.cam.position, p);
    cam.quaternion.slerpQuaternions(start.quaternion, framed.cam.quaternion, p);
    cam.fov = THREE.MathUtils.lerp(INTRO_FOV, 30, p);
    cam.aspect = size.width / size.height;
    cam.near = 0.5; cam.far = 1800;
    cam.setViewOffset(size.width, size.height, framed.view.x * p, framed.view.y * p, size.width, size.height);
    cam.updateProjectionMatrix();
  });
  return null;
}

// ---------------------------------------------------------------------------------------------------- actors
/** Visitor walking in from the right, standing, reacting, walking out. */
function Visitor({ charId, mode, reaction, onArrive, onLeft }: {
  charId: string; mode: "enter" | "stand" | "leave"; reaction: "none" | "yes" | "no";
  onArrive: () => void; onLeft: () => void;
}) {
  const ch = CHARACTERS[charId];
  const ref = useRef<THREE.Group>(null!);
  const x = useRef(COURT.offstage);
  const [moving, setMoving] = useState(true);
  const arrived = useRef(false);
  const left = useRef(false);
  const wheel = ch?.aid?.includes("wheelchair");
  const reduce = useGame((s) => s.settings.reduceMotion);

  useEffect(() => { if (mode === "leave") { setMoving(true); sfx("doorClose", { volume: 0.4 }); } }, [mode]);
  useEffect(() => { sfx("door", { volume: 0.5 }); }, []);

  useFrame((_, dt) => {
    const speed = reduce ? 6 : 3.2;
    if (mode === "enter" || (mode === "stand" && !arrived.current)) {
      x.current = Math.max(COURT.visitorStand, x.current - dt * speed);
      if (x.current <= COURT.visitorStand && !arrived.current) { arrived.current = true; setMoving(false); onArrive(); vfx.burst("dust", { x: COURT.visitorStand, y: 0.1, z: COURT.visitorZ }, { n: 6, scale: 1.6 }); }
    } else if (mode === "leave") {
      x.current += dt * speed * 1.2;
      if (x.current >= COURT.offstage && !left.current) { left.current = true; onLeft(); }
    }
    if (ref.current) {
      ref.current.position.x = x.current;
      const facing = mode === "leave" ? Math.PI / 2 : moving ? -Math.PI / 2 : -1.15;
      ref.current.rotation.y = THREE.MathUtils.lerp(ref.current.rotation.y, facing, Math.min(1, dt * 10));
    }
  });

  if (!ch) return null;
  let anim = moving ? (wheel ? "wheelchair-move-forward" : "walk") : wheel ? "wheelchair-sit" : "idle";
  if (!moving && reaction === "yes") anim = wheel ? "wheelchair-look-left" : "emote-yes";
  if (!moving && reaction === "no") anim = wheel ? "wheelchair-look-right" : "emote-no";
  const scale = CHAR * (ch.scale ?? 1);
  return (
    <group ref={ref} position={[COURT.offstage, 0, COURT.visitorZ]} rotation={[0, -Math.PI / 2, 0]}>
      {charId === "advisor"
        ? <Owl scale={CHAR * 0.92} talking={!moving} />
        : <Character url={ch.model} aid={ch.aid} anim={anim} scale={scale} />}
    </group>
  );
}

/** Happy decision -> confetti / hearts over the visitor (reads the store's fx bus). Quiet on a "no". */
function CourtFx() {
  useEffect(() => useGame.subscribe((s, p) => {
    if (!s.fx || s.fx === p.fx || s.fx.kind !== "decision") return;
    const d = s.fx.data as { choice?: string; outcome?: { delta?: { people: number; happiness: number; gold: number } } } | undefined;
    const dl = d?.outcome?.delta;
    if (d?.choice !== "yes" || !dl || dl.people + dl.happiness + dl.gold < 0) return;
    const head = { x: COURT.visitorStand, y: 1.5, z: COURT.visitorZ };
    vfx.burst("confetti", head, { scale: 2.2, n: 34, size: 1.55 });
    vfx.burst("sparkle", head, { scale: 2.2, n: 8, size: 1.4 });
    if (dl.happiness > 0) vfx.burst("hearts", { ...head, y: head.y + 0.4 }, { scale: 2, n: 5, size: 1.55 });
  }), []);
  return null;
}

const TIER = { coin_mound_s: 1.0, coin_mound_m: 1.5, coin_mound_l: 2.1 } as const;
const tierOf = (gold: number) => (gold <= 0 ? null : gold < 150 ? "coin_mound_s" : gold < 400 ? "coin_mound_m" : "coin_mound_l") as keyof typeof TIER | null;

function useCoinAssets() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(100, 90, 10, 128, 128, 128);
    gr.addColorStop(0, "#fff0a8"); gr.addColorStop(0.55, "#f0b52c"); gr.addColorStop(1, "#b9801f");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "#8a5a12"; g.lineWidth = 10; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = "#ffe48a"; g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 98, 0, Math.PI * 2); g.stroke();
    const crown = (ctx: CanvasRenderingContext2D) => { ctx.beginPath(); ctx.moveTo(70, 168); ctx.lineTo(70, 104); ctx.lineTo(100, 138); ctx.lineTo(128, 84); ctx.lineTo(156, 138); ctx.lineTo(186, 104); ctx.lineTo(186, 168); ctx.closePath(); };
    g.fillStyle = "#ffe9a0"; crown(g); g.fill(); g.strokeStyle = "#8a5a12"; g.lineWidth = 6; crown(g); g.stroke();
    g.fillStyle = "#c98a20"; g.fillRect(70, 172, 116, 12);
    const face = new THREE.CanvasTexture(c); face.colorSpace = THREE.SRGBColorSpace; face.anisotropy = 8;
    const b = document.createElement("canvas"); b.width = b.height = 256;
    const bg = b.getContext("2d")!; bg.fillStyle = "#505050"; bg.fillRect(0, 0, 256, 256);
    bg.strokeStyle = "#fff"; bg.lineWidth = 10; bg.beginPath(); bg.arc(128, 128, 112, 0, Math.PI * 2); bg.stroke();
    bg.fillStyle = "#ddd"; crown(bg); bg.fill();
    const bump = new THREE.CanvasTexture(b);
    const side = new THREE.MeshStandardMaterial({ color: "#e8ae2c", metalness: 0.92, roughness: 0.3, emissive: "#4a2e04", emissiveIntensity: 0.5, envMapIntensity: 3 });
    const cap = new THREE.MeshStandardMaterial({ map: face, bumpMap: bump, bumpScale: 1.6, metalness: 0.92, roughness: 0.32, color: "#ffffff", emissive: "#4a2e04", emissiveIntensity: 0.5, envMapIntensity: 3 });
    return { geo: new THREE.CylinderGeometry(0.3, 0.3, 0.07, 24, 1), mats: [side, cap, cap] };
  }, []);
}

interface RainCoin { delay: number; t: number; pos: THREE.Vector3; vy: number; rest: THREE.Vector3; q: THREE.Quaternion; spin: THREE.Vector3; bounces: number; mode: "wait" | "fall" | "rest" | "lift"; lift: boolean; clink: boolean; fade: number }
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** New coins fall from the ceiling one by one onto the mound (ease, bounce, settle, clink); spending lifts coins off. Rest spots come from the mound's own surface. */
function CoinRain({ gold }: { gold: number }) {
  const { geo, mats } = useCoinAssets();
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const coins = useRef<RainCoin[]>([]);
  const prev = useRef(gold);
  const tmp = useMemo(() => ({ o: new THREE.Object3D(), up: new THREE.Vector3(0, 1, 0), e: new THREE.Euler() }), []);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const restSpot = (tier: keyof typeof TIER) => {
    const R = TIER[tier], rx = R, ry = R * 0.74, rz = R * 0.92;
    for (let k = 0; k < 20; k++) {
      const a = Math.random() * Math.PI, rho = 0.2 + Math.random() * 0.6;
      const dx = Math.cos(a) * rho * rx, dz = Math.abs(Math.sin(a)) * rho * rz + 0.05;
      const q = 1 - (dx / rx) ** 2 - (dz / rz) ** 2;
      if (q <= 0.05) continue;
      const y = ry * Math.sqrt(q);
      const n = new THREE.Vector3(dx / (rx * rx), y / (ry * ry), dz / (rz * rz)).normalize();
      const axis = n.clone().multiplyScalar(0.5).add(new THREE.Vector3(0, 0.25, 1).normalize().multiplyScalar(0.5)).normalize();
      const pos = new THREE.Vector3(COURT.coins[0] + dx, COURT.coins[1] + y, COURT.coins[2] + dz).addScaledVector(n, 0.13); // clear of the baked coin layer (flat discs ~0.1 proud)
      return { pos, axis };
    }
    return { pos: new THREE.Vector3(COURT.coins[0], COURT.coins[1] + TIER[tier] * 0.74 + 0.2, COURT.coins[2] + 0.2), axis: new THREE.Vector3(0, 0.3, 1).normalize() };
  };
  useEffect(() => {
    const d = gold - prev.current; prev.current = gold;
    const tier = tierOf(gold) ?? tierOf(gold - d);
    if (!d || !tier) return;
    const make = (lift: boolean, i: number): RainCoin => {
      const { pos, axis } = restSpot(tier);
      return {
        delay: i * (lift ? 0.07 : reduce ? 0.03 : 0.11), t: 0, pos: lift ? pos.clone() : pos.clone().setY(10.5), vy: lift ? 4.5 : 0, rest: pos,
        q: new THREE.Quaternion().setFromUnitVectors(tmp.up, axis), spin: new THREE.Vector3(Math.random() * 9 - 4.5, Math.random() * 9 - 4.5, Math.random() * 9 - 4.5),
        bounces: 0, mode: "wait", lift, clink: lift, fade: 1,
      };
    };
    const n = d > 0 ? Math.min(20, Math.ceil(d / 5)) : Math.min(10, Math.ceil(-d / 5));
    for (let i = 0; i < n; i++) coins.current.push(make(d < 0, i));
  }, [gold]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05), m = mesh.current;
    if (!m) return;
    const list = coins.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const c = list[i];
      if (c.mode === "wait") {
        c.delay -= dt; if (c.delay <= 0) c.mode = c.lift ? "lift" : "fall";
        tmp.o.position.set(0, -50, 0); tmp.o.scale.setScalar(0); tmp.o.quaternion.identity();
      } else if (c.mode === "fall") {
        c.vy -= 19 * dt; c.pos.y += c.vy * dt;
        c.pos.x += (c.rest.x - c.pos.x) * Math.min(1, dt * 3);
        c.pos.z += (c.rest.z - c.pos.z) * Math.min(1, dt * 3);
        const near = Math.max(0, 1 - (c.pos.y - c.rest.y) / 2.2); // ease the tumble into the resting orientation as it lands
        tmp.e.set(c.spin.x * c.t, c.spin.y * c.t, c.spin.z * c.t); c.t += dt;
        tmp.o.quaternion.setFromEuler(tmp.e).slerp(c.q, Math.min(1, near * near + (c.bounces ? 1 : 0)));
        if (c.pos.y <= c.rest.y) {
          c.pos.y = c.rest.y;
          if (c.bounces < 2) { c.vy = -c.vy * 0.34; c.bounces++; if (!c.clink) { c.clink = true; sfx("coinIn", { volume: 0.32, rate: 0.9 + Math.random() * 0.3 }); } }
          else { c.mode = "rest"; c.t = 0; c.vy = 0; }
        }
        tmp.o.position.copy(c.pos); tmp.o.scale.setScalar(1);
      } else if (c.mode === "rest") {
        c.t += dt; c.fade = Math.max(0, 1 - Math.max(0, c.t - 1.1) / 0.35);
        tmp.o.position.copy(c.pos); tmp.o.quaternion.copy(c.q); tmp.o.scale.setScalar(c.fade);
        if (c.fade <= 0) { list.splice(i, 1); continue; }
      } else {
        c.vy -= 3 * dt; c.pos.y += c.vy * dt; c.t += dt; c.fade = Math.max(0, 1 - c.t / 0.7);
        tmp.e.set(c.spin.x * c.t, c.spin.y * c.t, 0); tmp.o.quaternion.setFromEuler(tmp.e).multiply(c.q);
        tmp.o.position.copy(c.pos); tmp.o.scale.setScalar(c.fade);
        if (c.fade <= 0) { list.splice(i, 1); continue; }
      }
      tmp.o.updateMatrix(); m.setMatrixAt(i, tmp.o.matrix);
    }
    for (let i = list.length; i < 32; i++) m.setMatrixAt(i, ZERO);
    m.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={mesh} args={[geo, mats as unknown as THREE.Material[], 32]} frustumCulled={false} castShadow />;
}

/** Gold coin mound: grounded, coins face the camera, a few spilled, metallic with env reflections + sparkle glints. Tier by treasury. */
function CoinPile({ gold }: { gold: number }) {
  const name = tierOf(gold);
  const ref = useRef<THREE.Group>(null!);
  const prev = useRef(gold);
  const bump = useRef(0);
  useEffect(() => { if (gold !== prev.current) { bump.current = 1; prev.current = gold; } }, [gold]);
  useFrame((_, dt) => {
    bump.current = Math.max(0, bump.current - dt * 3);
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(bump.current * Math.PI) * 0.045);
  });
  const R = name ? TIER[name] : 1;
  return (
    <>
      <group ref={ref} position={COURT.coins}>{name && <Prop name={name} />}</group>
      {name && HIGH && <Sparkles position={[COURT.coins[0] + 0.2, 0.9 + R * 0.3, COURT.coins[2] + 0.6]} scale={[R * 2.2, R * 1.1, R * 1.4]} count={16} size={5} speed={0.35} opacity={0.9} color="#fff6c0" noise={0.6} />}
      <CoinRain gold={gold} />
    </>
  );
}

function Floor() {
  // Big hand-painted tiles: warm tan fields with soft value gradients, painted top/left highlights, dark bottom/right edges, uneven painted grout, a few broad strokes.
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 1024;
    const g = c.getContext("2d")!;
    let sd = 5;
    const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    g.fillStyle = "#8f755f"; g.fillRect(0, 0, 1024, 1024); // grout
    const cols = ["#dcc19c", "#d3b48c", "#e0c7a4", "#cfae86"];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
      const X = x * 512 + 14 + (r() - 0.5) * 6, Y = y * 512 + 14 + (r() - 0.5) * 6, W = 484 - r() * 6, H = 484 - r() * 6;
      g.fillStyle = cols[(x + y * 2 + Math.floor(r() * 2)) % 4]; g.beginPath(); g.roundRect(X, Y, W, H, 34); g.fill();
      const gr = g.createLinearGradient(X, Y, X + W * 0.6, Y + H);
      gr.addColorStop(0, "rgba(255,246,226,.45)"); gr.addColorStop(0.5, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(96,62,44,.28)");
      g.fillStyle = gr; g.beginPath(); g.roundRect(X, Y, W, H, 34); g.fill();
      for (let k = 0; k < 4; k++) { g.strokeStyle = r() > 0.5 ? "rgba(255,240,214,.16)" : "rgba(120,84,60,.13)"; g.lineWidth = 16 + r() * 22; g.lineCap = "round"; const yy = Y + 50 + r() * (H - 100), xx = X + 40 + r() * 80; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 160 + r() * (W - 320), yy + (r() - 0.5) * 30); g.stroke(); }
      g.strokeStyle = "rgba(255,248,230,.7)"; g.lineWidth = 7; g.lineCap = "round"; g.beginPath(); g.moveTo(X + 34, Y + 5); g.lineTo(X + W - 34, Y + 5); g.stroke();
      g.beginPath(); g.moveTo(X + 5, Y + 34); g.lineTo(X + 5, Y + H - 34); g.stroke();
      g.strokeStyle = "rgba(92,60,44,.5)"; g.lineWidth = 8; g.beginPath(); g.moveTo(X + 34, Y + H - 4); g.lineTo(X + W - 34, Y + H - 4); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(260 / 4.6, 160 / 4.6); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, []);
  const floorMat = useMemo(() => painterlyMaterial({ map: tex, detail: "stone", scale: 0.08, roughness: 0.8 }), [tex]);
  const shade = useMemo(() => { // value structure: floor falls away to dark toward the camera
    const c = document.createElement("canvas"); c.width = 4; c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createLinearGradient(0, 0, 0, 128); // top of the canvas = far side (z small)
    gr.addColorStop(0, "rgba(30,18,24,0)"); gr.addColorStop(0.2, "rgba(30,18,24,0.06)"); gr.addColorStop(0.6, "rgba(24,14,22,0.34)"); gr.addColorStop(1, "rgba(24,14,22,0.5)");
    g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  const rug = useRugTexture();
  const rugTex = useMemo(() => { const t = rug.clone(); t.repeat.set(21 / 7.6, 1); t.needsUpdate = true; return t; }, [rug]);
  return (
    <group>
      {/* floor reaches far forward + outward so no aspect ratio (4:3 ... 21:9) ever frames past it */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, 0, 78]} receiveShadow material={floorMat}>
        <planeGeometry args={[260, 160]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[20, 0.02, 30]} renderOrder={2}>
        <planeGeometry args={[260, 52]} />
        <meshBasicMaterial map={shade} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
      {/* patterned rug where visitors stand; lifted + polygonOffset so it never z-fights the tiles */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[7, 0.014, COURT.visitorZ]} receiveShadow renderOrder={1}>
        <planeGeometry args={[21, 1.9]} />
        <meshStandardMaterial roughness={0.92} map={rugTex} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
    </group>
  );
}

export function CourtScene() {
  const run = useGame((s) => s.run);
  const phase = useGame((s) => s.phase);
  const step = useGame((s) => s.courtStep);
  const outcome = useGame((s) => s.outcome);
  const unlockIntro = useGame((s) => s.unlockIntro);
  const setStep = useGame((s) => s.setCourtStep);
  const visitorLeft = useGame((s) => s.visitorLeft);

  const cardId = run?.queue[0] ?? outcome?.cardId;
  const presenter = phase === "morning" && unlockIntro ? UNLOCKS.find((u) => u.id === unlockIntro)?.presenter : null;
  const who = presenter ?? (phase === "court" && step !== "done" ? (outcome ? CARD_BY_ID[outcome.cardId]?.who : cardId ? CARD_BY_ID[cardId]?.who : null) : null);
  // Stable per visit: after a decision the log grows by 1 but the same visitor stays until they leave.
  const visitKey = presenter ? "unlock-" + unlockIntro : (outcome?.cardId ?? cardId ?? "none") + "-" + ((run?.log.length ?? 0) - (outcome ? 1 : 0));

  const mode: "enter" | "stand" | "leave" = presenter ? "stand" : step === "enter" ? "enter" : step === "leave" ? "leave" : "stand";
  const reaction = step === "reply" && outcome ? (outcome.choice === "yes" ? "yes" : "no") : "none";
  const preview = useGame((s) => s.previewRuler);
  const ruler = (phase === "setup" || phase === "title" ? preview : null) ?? run?.rulerModel ?? preview ?? "character-female-c";
  const happyPulse = useGame((s) => s.fx?.kind === "decision");
  const night = phase === "reign-review" || phase === "reign-end";
  useEffect(() => { setGlow(night ? 2.2 : 0.9); }, [night]);
  const gallery = new URLSearchParams(location.search).get("gallery");
  if (gallery) return <Gallery filter={gallery} />;

  return (
    <>
      <CourtCamera />
      <Vfx3D />
      <CourtFx />
      <Sky top={night ? "#2a3470" : "#a7cfe9"} bottom={night ? "#f0a070" : "#e8f0f4"} />
      {/* key = sun BEHIND the windows (wall casts window-shaped light on floor + rug), cool unshadowed fill from the front-left */}
      <Lighting preset={night ? "dusk" : "day"} target={[-2, 0, 1]} shadow={{ size: 22, top: 22, bottom: -22, far: 90 }}
        sun={night ? undefined : { pos: [-9, 11, -21.6], color: "#ffd9a0", intensity: 7.5 }} />
      <directionalLight position={[-10, 7, 18]} intensity={night ? 0.5 : 0.7} color="#ece4ee" />
      {/* warm light from the two wall sconces */}
      {[2.9, 9.5].map((x) => <pointLight key={x} position={[x, 4.2, 0.4]} intensity={night ? 12 : 2.2} distance={6} decay={2} color="#ffb05a" />)}
      <PostFX preset={night ? "dusk" : "day"} />

      <Prop name="court_wall" position={[0, 0, COURT.wallZ]} />
      <WallExtension z={COURT.wallZ} />
      <Prop name="court_trim" position={[0, 0, COURT.wallZ]} />
      {[2.9, 9.5].map((x) => <Prop key={x} name="sconce" position={[x, 4.4, COURT.wallZ + 0.1]} scale={1.5} cast={false} />)}
      {[2.9, 9.5].map((x) => <Flame key={x} position={[x, 4.95, COURT.wallZ + 1.0]} size={1.15} />)}
      <Prop name="banner_hang" position={[-7.7, 4.2, COURT.wallZ + 0.22]} scale={1.3} cast={false} />
      <WindowShafts xs={[-0.4, 6.2, 12.8]} wallZ={COURT.wallZ} night={night} />
      <KingdomDiorama people={run?.people ?? 100} night={night} />
      <Cloud position={[-30, 40, -150]} scale={7} />
      <Cloud position={[50, 52, -170]} scale={8} speed={0.1} />
      <Floor />

      {/* dais + steps; the chair is turned ~3/4 toward the camera so the ruler (the hero) reads: full face, crown, torso */}
      <group position={COURT.throne}>
        <Prop name="throne_dais" />
        <group position={[-0.3, 0, 0]} rotation={[0, -0.6, 0]}>
          <Prop name="throne_chair" />
          <group position={[0.2, 1.95, 0]} rotation={[0, 1.2, 0]}>
            <Character url={`/kenney/mini-characters/${ruler}.glb`} anim="sit" scale={CHAR * 1.12} crown />
          </group>
        </group>
      </group>

      {/* owl advisor: floor perch in front of the plain wall between the stairs and window 1 (never behind the ruler's bubble) */}
      <group position={[COURT.owl[0], COURT.owl[1], COURT.owl[2]]}>
        <Prop name="perch" scale={[1, 1.4, 1]} />
        <Owl position={[0, 2.7, 0.02]} scale={1.5} rotationY={0.7} talking={step === "advisor"} happy={happyPulse && outcome?.lesson?.wise === true && step === "advisor"} />
      </group>

      <CoinPile gold={run?.gold ?? 0} />

      {who && (
        <Visitor
          key={visitKey}
          charId={who}
          mode={mode}
          reaction={reaction}
          onArrive={() => { if (!presenter && step === "enter") setStep("ask"); }}
          onLeft={() => visitorLeft()}
        />
      )}
    </>
  );
}
