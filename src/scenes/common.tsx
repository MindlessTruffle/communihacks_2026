import { useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GUMMY_URL } from "../characters/gummy/profiles.ts";
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

// ───────────────────────────── Gummy characters ─────────────────────────────
// Characters share one small gummy library. The existing scene-facing API is preserved.
export { GummyCharacter as Character, GummyAdvisor as Owl } from "../characters/gummy/GummyCharacter.tsx";
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
export function Sky({ top = "#5fb6f0", bottom = "#cdeeff", nightProgress }: { top?: string; bottom?: string; nightProgress?: () => number }) {
  const colors = useMemo(() => [new THREE.Color(top), new THREE.Color(bottom), new THREE.Color('#171b50'), new THREE.Color('#7a4f96')], [top, bottom]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: "varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP;\nvoid main(){\n float h = clamp(vP.y*1.6+0.25,0.0,1.0);\n gl_FragColor = vec4(mix(bottom,top,h),1.0);\n #include <colorspace_fragment>\n}",
    fog: false,
  }), [top, bottom]);
  useFrame(() => { const t = nightProgress?.() ?? 0; mat.uniforms.top.value.copy(colors[0]).lerp(colors[2], t); mat.uniforms.bottom.value.copy(colors[1]).lerp(colors[3], t); });
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
  [GUMMY_URL, "/models/coinpile_s.glb", "/models/coinpile_m.glb", "/models/coinpile_l.glb"].forEach((url) => useGLTF.preload(url));
}
