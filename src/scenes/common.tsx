import { useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { useGame } from "../game/store.ts";
import { painterlyMaterial, type PainterlyDetail } from "./painterly.ts";

export type Vec3 = [number, number, number];

/** Prepare any loaded scene: shadows on, Kenney colormap kept crisp. */
function prep(root: THREE.Object3D, shadows = true) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = shadows;
      m.receiveShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat && "roughness" in mat) {
        mat.roughness = Math.max(0.55, mat.roughness ?? 1);
        mat.metalness = Math.min(mat.metalness ?? 0, 0.4);
        if (mat.map) mat.map.anisotropy = 4;
      }
    }
  });
  return root;
}

/** Static model, cloned so the same GLB can be placed many times. */
export function Model({ url, position, rotation, scale = 1, shadows = true, tint, ...rest }: {
  url: string; position?: Vec3; rotation?: Vec3; scale?: number | Vec3; shadows?: boolean; tint?: string;
} & Record<string, unknown>) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => {
    const c = prep(scene.clone(true), shadows);
    if (url.startsWith("/models/food/")) paintFood(c, url);
    if (tint) c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.material = (m.material as THREE.MeshStandardMaterial).clone(); (m.material as THREE.MeshStandardMaterial).color.set(tint); }
    });
    return c;
  }, [scene, shadows, tint]);
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} {...rest} />;
}

// ───────────────────────────── Puppet characters ─────────────────────────────
// Mid-poly rigid-part characters from tools/blender/gen_characters.py (public/models/chars/*.glb).
// Parts: torso (root) > head(hair,hat,glasses,eye_l,eye_r,mouth), arm_l/arm_r > hand_l/hand_r, cape; leg_l, leg_r.
// All poses are procedural (see `targetPose`).

const CHAR_DIR = "/models/chars/";
/** Natural model height is ~0.9; old Kenney figures were ~0.38, and scenes were tuned for that. */
const NORM = 0.44;
const LEGACY_RULERS: Record<string, string> = {
  "character-female-c": "ruler-a", "character-male-e": "ruler-b", "character-female-e": "ruler-c",
  "character-male-a": "ruler-d", "character-raider": "ruler-e", "character-female-b": "ruler-f",
};

/** Accepts new ids/paths and the legacy Kenney paths scenes still build (`/kenney/mini-characters/${rulerModel}.glb`). */
export function resolveCharUrl(url: string): string {
  if (url.startsWith(CHAR_DIR)) return url;
  const base = url.split("/").pop()!.replace(/\.glb$/, "");
  if (/^ruler-[a-f]$/.test(base)) return `${CHAR_DIR}${base}.glb`;
  if (LEGACY_RULERS[base]) return `${CHAR_DIR}${LEGACY_RULERS[base]}.glb`;
  if (base.includes("ghost")) return `${CHAR_DIR}boo.glb`;
  if (base.startsWith("character-")) return `${CHAR_DIR}ruler-a.glb`;
  return url;
}
function resolveAidUrl(aid: string): { url: string; kind: "wheelchair" | "cane" } | null {
  if (aid.includes("wheelchair")) return { url: `${CHAR_DIR}${aid.includes("power") ? "wheelchair-power" : "wheelchair"}.glb`, kind: "wheelchair" };
  if (aid.includes("cane") || aid.includes("crutch")) return { url: `${CHAR_DIR}cane.glb`, kind: "cane" };
  return null;
}

/**
 * Painted finish (painterly.ts): one material per detail type, all sampling the shared palette atlas.
 * Part names decide the detail: skin (head, hands), hair, cloth (torso/arms/legs/cape/hats), gold (crowns, glasses), metal (armour, robot, chair).
 */
let PALETTE_MAP: THREE.Texture | null = null;
const PAINT_MATS = new Map<string, THREE.MeshStandardMaterial>();
function paletteMap(src: THREE.Material | THREE.Material[]) {
  if (!PALETTE_MAP) {
    const m = (Array.isArray(src) ? src[0] : src) as THREE.MeshStandardMaterial;
    if (m.map) {
      m.map.minFilter = THREE.NearestFilter; m.map.magFilter = THREE.NearestFilter; m.map.generateMipmaps = false; m.map.needsUpdate = true;
      PALETTE_MAP = m.map;
    }
  }
  return PALETTE_MAP;
}
function paintMat(detail: PainterlyDetail, map: THREE.Texture | null, key = detail as string, tweak?: (m: THREE.MeshStandardMaterial) => void) {
  let m = PAINT_MATS.get(key);
  if (!m) {
    m = painterlyMaterial({ map: map ?? undefined, color: 0xffffff, detail, ...(detail === "gold" ? { metalness: 0.5, roughness: 0.38 } : {}) });
    tweak?.(m);
    PAINT_MATS.set(key, m);
  }
  return m;
}
export type CharKind = "human" | "armor" | "owl" | "crown" | "chair" | "cane";
function detailFor(part: string, kind: CharKind): PainterlyDetail {
  if (kind === "crown") return "gold";
  if (kind === "chair") return part === "cushion" ? "cloth" : "metal";
  if (kind === "cane") return "wood";
  if (/^(head|hand_|eye_|mouth)/.test(part)) return kind === "owl" && part === "head" ? "hair" : (kind === "armor" && part !== "head" && !part.startsWith("hand") && !part.startsWith("eye") && !part.startsWith("mouth") ? "metal" : "skin");
  if (part.startsWith("hair")) return "hair";
  if (part.startsWith("glasses")) return "gold";
  if (kind === "owl") return part === "hat" ? "cloth" : "hair";
  if (kind === "armor") return "metal";
  return "cloth";
}
function prepChar(root: THREE.Object3D, kind: CharKind = "human") {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true; m.receiveShadow = true;
    const map = paletteMap(m.material);
    // armour covers everything but the face for knights; hats stay cloth/metal depending on the character
    const detail = detailFor(o.name || m.name, kind);
    m.material = paintMat(detail, map);
  });
  return root;
}

/** Market food: soft painted finish; traps get a glossy emissive variant so they look extra tempting. */
const TRAPS = ["cake", "sundae", "donuts", "candy", "wine"];
function paintFood(root: THREE.Object3D, url: string) {
  const id = url.split("/").pop()!.replace(".glb", "");
  const trap = TRAPS.includes(id);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const map = paletteMap(m.material);
    m.material = trap
      ? paintMat("skin", map, "food-trap", (mm) => { mm.roughness = 0.22; mm.metalness = 0.1; mm.emissive = new THREE.Color(0xffffff); mm.emissiveMap = map; mm.emissiveIntensity = 0.32; })
      : paintMat("skin", map, "food");
  });
}

const ONE_SHOT: Record<string, number> = {
  "emote-yes": 1.15, "emote-no": 1.15, "pick-up": 1.25, "interact-right": 1.7, "interact-left": 1.7, jump: 0.75, die: 1.3,
};
const SEATED = (a: string) => a === "sit" || a.startsWith("wheelchair");
/** How far the hips drop/rise (model units) when seated on the throne. Tuned against throne.glb in CourtScene. */
const SIT_Y = -0.19;

interface Pose {
  by: number; bx: number; bz: number; ty: number; tx: number; hx: number; hy: number; hz: number;
  alx: number; alz: number; arx: number; arz: number; llx: number; lrx: number; slx: number; srx: number; breathe: number; capeX: number;
}
const POSE_KEYS = ["by", "bx", "bz", "ty", "tx", "hx", "hy", "hz", "alx", "alz", "arx", "arz", "llx", "lrx", "slx", "srx", "breathe", "capeX"] as const;
const zeroPose = (): Pose => ({ by: 0, bx: 0, bz: 0, ty: 0, tx: 0, hx: 0, hy: 0, hz: 0, alx: 0, alz: 0.1, arx: 0, arz: -0.1, llx: 0, lrx: 0, slx: 0, srx: 0, breathe: 0, capeX: 0 });

const ease = (x: number) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
/** 0→1 ramp-in, hold, ramp-out envelope over u in [0,1]. */
const env = (u: number, a = 0.15, b = 0.2) => ease(u / a) * ease((1 - u) / b);

interface Ctx { cane: boolean; wheel: boolean; ghost: boolean; ph: number; rm: number; }

/** Target pose for an animation at local time t (seconds, speed-scaled). `done` = one-shot already finished. */
function targetPose(name: string, t: number, done: boolean, c: Ctx, out: Pose): Pose {
  const P = Object.assign(out, zeroPose());
  const k = c.rm; // reduce-motion amplitude
  const I = t + c.ph;
  // always-on breathing / micro sway
  P.breathe = Math.sin(I * 1.9);
  P.hz = Math.sin(I * 0.7) * 0.035 * k;
  P.hx = Math.sin(I * 1.1) * 0.025 * k;
  P.alz = 0.1 + Math.sin(I * 1.9) * 0.025 * k; P.arz = -0.1 - Math.sin(I * 1.9 + 1) * 0.025 * k;
  P.capeX = 0.05;
  if (c.ghost) P.by = (0.045 + Math.sin(I * 2.2) * 0.03 * k);
  const seated = SEATED(name);
  if (name === "sit") {
    P.by = SIT_Y; P.llx = -1.5; P.lrx = -1.5; P.slx = 1.5; P.srx = 1.5; P.alx = -0.55; P.arx = -0.55; P.alz = 0.22; P.arz = -0.22; P.hx += 0.04;
  } else if (name.startsWith("wheelchair")) {
    P.by = 0.0; P.llx = -1.35; P.lrx = -1.35; P.slx = 0.95; P.srx = 0.95; P.alx = -0.62; P.arx = -0.62; P.alz = 0.12; P.arz = -0.12;
    if (name === "wheelchair-move-forward") {
      const s = Math.sin(t * 6);
      P.alx = -0.7 + s * 0.38 * k; P.arx = -0.7 + s * 0.38 * k; P.bx = 0.05; P.hx += 0.04;
    } else if (name === "wheelchair-look-left") { // "yes": nod with a friendly turn
      P.hx = 0.14 + Math.sin(t * 8) * 0.22 * k; P.hy = 0.35; P.by = Math.abs(Math.sin(t * 8)) * 0.015 * k;
    } else if (name === "wheelchair-look-right") { // "no": shake
      P.hy = Math.sin(t * 9) * 0.5 * k; P.hz = Math.sin(t * 9) * 0.05 * k; P.hx = 0.05;
    }
  } else if (name === "walk") {
    const ph = t * 10, s = Math.sin(ph);
    P.llx = -s * 0.75 * k; P.lrx = s * 0.75 * k;
    P.slx = 0.08 + 0.7 * Math.max(0, Math.cos(ph)) * k; P.srx = 0.08 + 0.7 * Math.max(0, -Math.cos(ph)) * k;
    P.alx = s * 0.65 * k; P.arx = -s * 0.65 * k;
    P.by = Math.abs(Math.sin(ph)) * 0.028 * k; P.bx = 0.09 * k; P.ty = s * 0.12 * k; P.hy = -s * 0.08 * k; P.hx -= 0.03;
    P.capeX = 0.2 + Math.abs(s) * 0.12 * k;
    P.alz = 0.14; P.arz = -0.14; P.hz = Math.sin(ph) * 0.03 * k;
  } else if (!done && ONE_SHOT[name]) {
    const u = Math.min(1, t / ONE_SHOT[name]);
    if (name === "emote-yes") {
      P.hx = 0.45 * Math.sin(u * Math.PI * 4) * env(u, 0.1, 0.12) * k + 0.08;
      P.by = Math.abs(Math.sin(u * Math.PI * 2)) * 0.07 * k;
      P.alx = -0.35 * env(u) * k; P.arx = -0.35 * env(u) * k; P.alz = 0.25; P.arz = -0.25;
      P.llx = Math.sin(u * Math.PI * 2) * 0.1 * k; P.lrx = P.llx;
    } else if (name === "emote-no") {
      P.hy = 0.6 * Math.sin(u * Math.PI * 6) * env(u, 0.08, 0.15) * k;
      P.ty = 0.12 * Math.sin(u * Math.PI * 6) * env(u) * k; P.hx = 0.05;
      P.alz = 0.35 * env(u) * k + 0.1; P.arz = -0.35 * env(u) * k - 0.1; P.hz = 0.05 * Math.sin(u * Math.PI * 6) * k;
    } else if (name === "interact-right" || name === "interact-left") {
      const e = env(u, 0.14, 0.2), left = name === "interact-left";
      const g = Math.sin(t * 9) * 0.28 * k;
      const arm = -1.15 * e + g * e, out = 0.45 * e;
      if (left) { P.alx = arm; P.alz = 0.1 + out; } else { P.arx = arm; P.arz = -0.1 - out; }
      P.ty = (left ? 0.14 : -0.14) * e * k; P.hz = (left ? -1 : 1) * 0.1 * e * k; P.hx = 0.05 + Math.sin(t * 7) * 0.05 * e * k;
      P.by = Math.abs(Math.sin(t * 9)) * 0.012 * e * k;
    } else if (name === "pick-up") {
      const e = u < 0.3 ? ease(u / 0.3) : u < 0.62 ? 1 : ease((1 - u) / 0.38);
      P.bx = 0.85 * e; P.hx = -0.45 * e + 0.05; P.by = -0.1 * e; P.llx = -0.95 * e; P.lrx = -0.95 * e; P.slx = 1.3 * e; P.srx = 1.3 * e;
      P.alx = -1.1 * e; P.arx = -1.1 * e; P.alz = 0.12; P.arz = -0.12;
      if (u > 0.5) { const l = ease((u - 0.5) / 0.3) * (1 - ease((u - 0.82) / 0.18)); P.alx -= 0.5 * l; P.arx -= 0.5 * l; }
    } else if (name === "jump") {
      P.by = Math.sin(u * Math.PI) * 0.2 * k; P.alx = -2.4 * Math.sin(u * Math.PI); P.arx = P.alx; P.alz = 0.3; P.arz = -0.3;
      P.llx = -0.3 * Math.sin(u * Math.PI); P.lrx = P.llx; P.slx = 0.6 * Math.sin(u * Math.PI); P.srx = P.slx;
    } else if (name === "die") {
      const e = ease(u);
      P.bx = -1.45 * e; P.by = -0.22 * e; P.hx = -0.2 * e; P.alx = -0.2 * e; P.arx = -0.2 * e; P.alz = 0.9 * e; P.arz = -0.9 * e;
    }
  } else if (name === "die") {
    P.bx = -1.45; P.by = -0.22; P.alz = 0.9; P.arz = -0.9; P.hx = -0.2;
  } else if (done && (name === "interact-right" || name === "interact-left")) {
    // settled "chatting" pose: hand half-raised, gentle bob
    const left = name === "interact-left", e = 0.55, g = Math.sin(I * 3.1) * 0.12 * k;
    if (left) { P.alx = -0.85 * e + g; P.alz = 0.25; } else { P.arx = -0.85 * e + g; P.arz = -0.25; }
    P.hx = 0.05 + Math.sin(I * 3.1) * 0.035 * k; P.by = Math.abs(Math.sin(I * 3.1)) * 0.006 * k;
  } else {
    // idle: weight shift + sway
    P.ty = Math.sin(I * 0.8) * 0.04 * k; P.hy = Math.sin(I * 0.55) * 0.12 * k;
    P.alx = Math.sin(I * 1.9) * 0.035 * k; P.arx = -P.alx;
  }
  if (c.cane && !seated) { // right hand holds the cane out front
    P.arx = -0.68 + (name === "walk" ? Math.sin(t * 10) * 0.08 * k : 0); P.arz = -0.16;
    if (name === "walk") { P.llx *= 0.6; P.lrx *= 0.6; P.slx *= 0.7; P.srx *= 0.7; P.by *= 0.7; }
  }
  return P;
}

/** Wheelchair/cane prop (cloned per instance, wheels spin from the character's motion). */
function Aid({ url, kind, spin }: { url: string; kind: "wheelchair" | "cane"; spin: MutableRefObject<number> }) {
  const { scene } = useGLTF(url);
  const obj = useMemo(() => prepChar(scene.clone(true), kind === "cane" ? "cane" : "chair"), [scene, kind]);
  const wheels = useMemo(() => [obj.getObjectByName("wheel_l"), obj.getObjectByName("wheel_r")].filter(Boolean) as THREE.Object3D[], [obj]);
  useFrame(() => { for (const w of wheels) w.rotation.x = spin.current; });
  return <primitive object={obj} position={kind === "cane" ? [-0.2, 0, 0.14] : [0, 0, 0]} />;
}

/** Procedurally animated puppet character. Same props API as the old Kenney skinned version. */
export function Character(props: {
  url: string; anim?: string; position?: Vec3; rotationY?: number; scale?: number; aid?: string; crown?: boolean; speed?: number;
  children?: ReactNode; onOneShotEnd?: () => void;
}) {
  const { anim = "idle", position, rotationY = 0, scale = 1, crown, speed = 1, children, onOneShotEnd } = props;
  let { url, aid } = props;
  // DEV only: ?forceVisitor=maya swaps every non-ruler character for that cast member (to screenshot e.g. the wheelchair visitor in the court)
  if (import.meta.env.DEV && !crown) {
    const fv = new URLSearchParams(location.search).get("forceVisitor");
    if (fv && /^[a-z-]+$/.test(fv)) { url = `${CHAR_DIR}${fv}.glb`; aid = fv === "maya" ? `${CHAR_DIR}wheelchair-power.glb` : fv === "rosa" ? `${CHAR_DIR}cane.glb` : undefined; }
  }
  const gltf = useGLTF(resolveCharUrl(url));
  const scene = useMemo(() => prepChar(gltf.scene.clone(true), /clank|cogs/.test(url) ? "armor" : "human"), [gltf.scene, url]);
  const crownGltf = useGLTF("/models/crown.glb");
  const crownObj = useMemo(() => prepChar(crownGltf.scene.clone(true), "crown"), [crownGltf.scene]);
  const rig = useRef<THREE.Group>(null!);
  const aidInfo = aid ? resolveAidUrl(aid) : null;
  const parts = useMemo(() => {
    const g = (n: string) => scene.getObjectByName(n) ?? null;
    const torso = g("torso");
    const ud = (torso?.userData ?? {}) as { crownY?: number; float?: number; noLegs?: number };
    return {
      torso, head: g("head"), arm_l: g("arm_l"), arm_r: g("arm_r"), leg_l: g("leg_l"), leg_r: g("leg_r"), shin_l: g("shin_l"), shin_r: g("shin_r"), eye_l: g("eye_l"), eye_r: g("eye_r"), cape: g("cape"),
      crownY: ud.crownY ?? 0.36, ghost: !!ud.float,
    };
  }, [scene]);
  const st = useRef({
    cur: zeroPose(), tgt: zeroPose(), anim, t: 0, done: false, fired: false, spin: 0,
    ph: Math.random() * 20, nextBlink: 1 + Math.random() * 3, blink: -1, onEnd: onOneShotEnd, init: false,
  });
  st.current.onEnd = onOneShotEnd;

  useEffect(() => {
    if (!crown || !parts.head) return;
    crownObj.position.set(0, parts.crownY - 0.045, -0.01);
    crownObj.rotation.set(-0.06, 0, 0.1);
    crownObj.scale.setScalar(1.3);
    parts.head.add(crownObj);
    return () => { parts.head?.remove(crownObj); };
  }, [crown, parts, crownObj]);

  useEffect(() => {
    const s = st.current;
    s.anim = anim; s.t = 0; s.done = false; s.fired = false;
  }, [anim]);

  const ctx = useMemo<Ctx>(() => ({ cane: aidInfo?.kind === "cane", wheel: aidInfo?.kind === "wheelchair", ghost: parts.ghost, ph: 0, rm: 1 }), [aidInfo?.kind, parts.ghost]);

  useFrame((_, dtRaw) => {
    const s = st.current;
    const dt = Math.min(dtRaw, 0.05);
    const rmOn = useGame.getState().settings.reduceMotion;
    ctx.rm = rmOn ? 0.45 : 1; ctx.ph = s.ph;
    s.t += dt * speed;
    let name = s.anim;
    if (ctx.wheel && !name.startsWith("wheelchair") && !ONE_SHOT[name]) name = name === "walk" ? "wheelchair-move-forward" : "wheelchair-sit";
    const dur = ONE_SHOT[name];
    if (dur && !s.done && s.t >= dur) {
      s.done = true;
      if (!s.fired) { s.fired = true; s.onEnd?.(); }
    }
    if (name === "wheelchair-move-forward") s.spin += dt * speed * 19;
    targetPose(name, s.t, s.done, ctx, s.tgt);
    const kk = s.init ? 1 - Math.exp(-dt * 16) : 1; s.init = true;
    const c = s.cur, tg = s.tgt;
    for (const key of POSE_KEYS) c[key] += (tg[key] - c[key]) * kk;
    if (rig.current) rig.current.position.y = c.by;
    const { torso, head, arm_l, arm_r, leg_l, leg_r, shin_l, shin_r, eye_l, eye_r, cape } = parts;
    if (torso) { torso.rotation.set(c.bx, c.ty, c.bz); torso.scale.set(1 + c.breathe * 0.006, 1 + c.breathe * 0.014, 1 + c.breathe * 0.006); }
    if (head) head.rotation.set(c.hx - c.bx * 0.5, c.hy - c.ty * 0.6, c.hz);
    if (arm_l) arm_l.rotation.set(c.alx, 0, c.alz);
    if (arm_r) arm_r.rotation.set(c.arx, 0, c.arz);
    if (leg_l) leg_l.rotation.set(c.llx, 0, 0.0);
    if (leg_r) leg_r.rotation.set(c.lrx, 0, 0.0);
    if (shin_l) shin_l.rotation.set(c.slx, 0, 0);
    if (shin_r) shin_r.rotation.set(c.srx, 0, 0);
    if (cape) cape.rotation.x = c.capeX;
    // blink
    s.nextBlink -= dt;
    if (s.nextBlink <= 0) { s.blink = 0; s.nextBlink = 2.2 + Math.random() * 3.8; }
    let ey = 1;
    if (s.blink >= 0) { s.blink += dt; const b = s.blink / 0.16; ey = b < 1 ? 1 - Math.sin(b * Math.PI) * 0.92 : 1; if (b >= 1) s.blink = -1; }
    if (eye_l) eye_l.scale.y = ey;
    if (eye_r) eye_r.scale.y = ey;
    if (aidInfo?.kind === "wheelchair" || !aidInfo) { /* spin handled in Aid via ref */ }
  });

  const spinRef = useMemo(() => ({ get current() { return st.current.spin; }, set current(v: number) { st.current.spin = v; } }), []) as MutableRefObject<number>;

  return (
    <group position={position} rotation={[0, rotationY, 0]} scale={scale}>
      <group scale={NORM}>
        <group ref={rig}><primitive object={scene} /></group>
        {aidInfo && <Aid url={aidInfo.url} kind={aidInfo.kind} spin={spinRef} />}
      </group>
      {children}
    </group>
  );
}

const OWL_V = new THREE.Vector3();
/** Sage Ollie: rigid-part owl animated in code (bob, blink-tilt, wing flap while talking). */
export function Owl({ position, rotationY = 0, scale = 1, talking = false, happy = false }: {
  position?: Vec3; rotationY?: number; scale?: number; talking?: boolean; happy?: boolean;
}) {
  const { scene } = useGLTF("/models/owl.glb");
  const obj = useMemo(() => prepChar(scene.clone(true), "owl"), [scene]);
  const blink = useRef({ next: 1.5 + Math.random() * 2, t: -1 });
  const parts = useMemo(() => ({
    el: obj.getObjectByName("eye_l"), er: obj.getObjectByName("eye_r"), head: obj.getObjectByName("head"), wl: obj.getObjectByName("wing_l"), wr: obj.getObjectByName("wing_r"), body: obj.getObjectByName("body"),
  }), [obj]);
  const ref = useRef<THREE.Group>(null!);
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    const g = ref.current;
    if (!g) return;
    // face the camera (3/4): the scene's rotationY is only honoured within ~23 degrees of the camera direction
    g.getWorldPosition(OWL_V);
    const yawCam = Math.atan2(state.camera.position.x - OWL_V.x, state.camera.position.z - OWL_V.z);
    let diff = rotationY - yawCam; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    g.rotation.y = yawCam + Math.max(-0.4, Math.min(0.4, diff));
    const bk = blink.current;
    bk.next -= Math.min(dt, 0.05);
    if (bk.next <= 0) { bk.t = 0; bk.next = 2 + Math.random() * 3.5; }
    let ey = 1;
    if (bk.t >= 0) { bk.t += Math.min(dt, 0.05); const b = bk.t / 0.18; if (b >= 1) bk.t = -1; else ey = 1 - Math.sin(b * Math.PI) * 0.92; }
    if (parts.el) parts.el.scale.y = ey;
    if (parts.er) parts.er.scale.y = ey;
    if (parts.body) parts.body.scale.set(1 + Math.sin(t * 1.9) * 0.006, 1 + Math.sin(t * 1.9) * 0.014, 1 + Math.sin(t * 1.9) * 0.006);
    g.position.y = (position?.[1] ?? 0) + Math.abs(Math.sin(t * (happy ? 6 : 1.6))) * (happy ? 0.12 : 0.03) * scale;
    if (parts.head) {
      parts.head.rotation.z = Math.sin(t * 0.9) * 0.08 + (talking ? Math.sin(t * 9) * 0.05 : 0);
      parts.head.rotation.x = talking ? Math.sin(t * 7) * 0.06 : 0;
    }
    const flap = talking || happy ? Math.sin(t * (happy ? 18 : 6)) * 0.35 + 0.2 : Math.sin(t * 1.2) * 0.04;
    if (parts.wl) parts.wl.rotation.y = flap;
    if (parts.wr) parts.wr.rotation.y = -flap;
  });
  return <group ref={ref} position={position} rotation={[0, rotationY, 0]} scale={scale}><primitive object={obj} /></group>;
}

/** Stylized cloud built from spheres (cheap, chunky, CoC-like). */
export function Cloud({ position, scale = 1, speed = 0.15, span = 40 }: { position: Vec3; scale?: number; speed?: number; span?: number }) {
  const ref = useRef<THREE.Group>(null!);
  const puffs = useMemo(() => [[0, 0, 0, 1], [1.1, 0.2, 0, 0.8], [-1.1, 0.1, 0, 0.75], [0.4, 0.6, 0.1, 0.7], [-0.5, 0.5, 0, 0.6]], []);
  useFrame((_, dt) => {
    const g = ref.current;
    g.position.x += dt * speed;
    if (g.position.x > span / 2) g.position.x = -span / 2;
  });
  return (
    <group ref={ref} position={position} scale={scale}>
      {puffs.map(([x, y, z, r], i) => (
        <mesh key={i} position={[x, y, z]}>
          <sphereGeometry args={[r, 14, 10]} />
          <meshLambertMaterial color="#ffffff" emissive="#e8f4ff" emissiveIntensity={0.55} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Gradient sky dome. */
export function Sky({ top = "#5fb6f0", bottom = "#cdeeff" }: { top?: string; bottom?: string }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP;\nvoid main(){\n float h = clamp(vP.y*1.6+0.25,0.0,1.0);\n gl_FragColor = vec4(mix(bottom,top,h),1.0);\n #include <colorspace_fragment>\n}",
    fog: false,
  }), [top, bottom]);
  return <mesh material={mat} scale={180} renderOrder={-1} frustumCulled={false}><sphereGeometry args={[1, 24, 16]} /></mesh>;
}

/** Smoothly animate a group toward a target (used for pop-in growth). */
export function PopIn({ children, delay = 0, position }: { children: ReactNode; delay?: number; position?: Vec3 }) {
  const ref = useRef<THREE.Group>(null!);
  const start = useRef<number | null>(null);
  useFrame(({ clock }) => {
    if (start.current === null) start.current = clock.elapsedTime + delay;
    const k = Math.min(1, Math.max(0, (clock.elapsedTime - start.current) / 0.5));
    const s = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 6) : 1;
    ref.current.scale.setScalar(Math.max(0.001, s));
  });
  return <group ref={ref} position={position} scale={0.001}>{children}</group>;
}

export function preloadCore() {
  [
    "/models/owl.glb", "/models/crown.glb",
    ...["a", "b", "c", "d", "e", "f"].map((k) => `/models/chars/ruler-${k}.glb`),
    "/models/coinpile_s.glb", "/models/coinpile_m.glb", "/models/coinpile_l.glb",
  ].forEach((u) => useGLTF.preload(u));
}
