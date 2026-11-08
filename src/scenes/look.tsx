// Shared "game look": quality tier, lighting presets, post-processing, stylized grass + ground textures.
// Target (see HANDOFF / handoff-notes/environment.md): warm afternoon key, soft cool fill, pink-lilac haze, light AO, mild bloom.
// Readable SEPARATION between surface types (path / grass / timber / roof / foliage / stone) rather than punchy contrast.
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, N8AO, Bloom, HueSaturation, BrightnessContrast, ToneMapping, Vignette, SMAA } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { useGame } from "../game/store.ts";
import { getDevice } from "../platform/device.ts";

// ------------------------------------------------------------------ quality tier
export type Quality = "high" | "low";
function detectQuality(): Quality {
  try {
    const q = new URLSearchParams(location.search).get("q");
    if (q === "high" || q === "low") return q;
    // Graphics setting (Options → Display writes this key then reloads): "high" | "low" | "auto"
    const pref = localStorage.getItem("rc-quality");
    if (pref === "high" || pref === "low") return pref;
    // Auto: device profile (screen-based form factor, not window size) decides.
    return getDevice().recommendedQuality;
  } catch { return "high"; }
}
export const QUALITY: Quality = detectQuality();
export const HIGH = QUALITY === "high";

// ------------------------------------------------------------------ lighting presets
export type Preset = "day" | "dusk" | "sunset" | "night";
interface LookDef {
  sun: { pos: [number, number, number]; color: string; intensity: number };
  hemi: [string, string, number];
  fog: [string, number, number];
  env: { key: string; fill: string; intensity: number };
  post: { bloom: number; threshold: number; sat: number; contrast: number; bright: number; vignette: number; ao: number };
}
export const LOOKS: Record<Preset, LookDef> = {
  day: {
    sun: { pos: [-9, 10, 10], color: "#ffe2b4", intensity: 2.7 },
    hemi: ["#d3d0ff", "#b3bf72", 0.55],
    fog: ["#efd4e2", 45, 190],
    env: { key: "#fff0d8", fill: "#a9b8ff", intensity: 0.5 },
    post: { bloom: 0.25, threshold: 0.92, sat: 0.14, contrast: 0.05, bright: 0.0, vignette: 0.28, ao: 1.7 },
  },
  dusk: {
    sun: { pos: [-9, 8, 10], color: "#ffbf90", intensity: 2.0 },
    hemi: ["#b2b0f2", "#7c6a82", 0.8],
    fog: ["#9a86b4", 34, 110],
    env: { key: "#ffc59a", fill: "#8c92ff", intensity: 0.55 },
    post: { bloom: 0.4, threshold: 0.88, sat: 0.12, contrast: 0.05, bright: 0.0, vignette: 0.35, ao: 1.7 },
  },
  sunset: {
    sun: { pos: [-34, 12, -14], color: "#ffc18a", intensity: 3.0 },
    hemi: ["#dccdff", "#9db06a", 0.9],
    fog: ["#e7bccd", 36, 125],
    env: { key: "#ffc794", fill: "#8f98ec", intensity: 0.55 },
    post: { bloom: 0.38, threshold: 0.86, sat: 0.14, contrast: 0.06, bright: 0.0, vignette: 0.32, ao: 1.7 },
  },
  night: {
    sun: { pos: [8, 14, 6], color: "#b2c0ff", intensity: 1.2 },
    hemi: ["#8896ea", "#4a3c60", 0.95],
    fog: ["#2f2766", 16, 64],
    env: { key: "#ffbe80", fill: "#6068cc", intensity: 0.55 },
    post: { bloom: 0.85, threshold: 0.72, sat: 0.12, contrast: 0.04, bright: 0.02, vignette: 0.4, ao: 1.5 },
  },
};

/** Sun + sky fill + image-based light + fog for a preset. Scene-specific point lights stay in the scene. */
export function Lighting({ preset, shadow = { size: 14, far: 60 }, target = [0, 0, 0] as [number, number, number], follow, sun: sunOverride }: {
  /** Replace the preset's key light (e.g. court: sun behind the windows so the wall casts window-shaped light). */
  sun?: { pos: [number, number, number]; color: string; intensity: number };
  preset: Preset; shadow?: { size: number; far: number; bottom?: number; top?: number }; target?: [number, number, number];
  /** Keep a tight, sharp shadow frustum centred on a moving point (player / camera). */
  follow?: () => THREE.Vector3 | null | undefined;
}) {
  const L0 = LOOKS[preset];
  const L = sunOverride ? { ...L0, sun: sunOverride } : L0;
  const sun = useRef<THREE.DirectionalLight>(null!);
  const tgt = useMemo(() => { const o = new THREE.Object3D(); o.position.set(...target); return o; }, [target[0], target[1], target[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  const s = shadow.size;
  useFrame(() => {
    const p = follow?.();
    if (!p || !sun.current) return;
    // snap to texel-ish steps to avoid shadow shimmer while walking
    const snap = (v: number) => Math.round(v * 2) / 2;
    tgt.position.set(snap(p.x), 0, snap(p.z));
    tgt.updateMatrixWorld();
    sun.current.position.set(tgt.position.x + L.sun.pos[0], L.sun.pos[1], tgt.position.z + L.sun.pos[2]);
  });
  return (
    <>
      <primitive object={tgt} />
      <directionalLight
        ref={sun}
        target={tgt}
        position={[target[0] + L.sun.pos[0], target[1] + L.sun.pos[1], target[2] + L.sun.pos[2]]}
        intensity={L.sun.intensity}
        color={L.sun.color}
        castShadow
        shadow-mapSize={HIGH ? [2048, 2048] : [1024, 1024]}
        shadow-camera-left={-s} shadow-camera-right={s}
        shadow-camera-top={shadow.top ?? s} shadow-camera-bottom={shadow.bottom ?? -s}
        shadow-camera-near={0.5} shadow-camera-far={shadow.far}
        shadow-bias={-0.0004} shadow-normalBias={0.03}
      />
      <hemisphereLight args={L.hemi} />
      <fog attach="fog" args={L.fog} />
      <Environment resolution={64} frames={1} environmentIntensity={L.env.intensity}>
        <Lightformer form="rect" intensity={2.2} color={L.env.key} position={[-5, 6, 5]} scale={[10, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.1} color={L.env.fill} position={[6, 4, -6]} scale={[10, 6, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 10, 0]} rotation-x={Math.PI / 2} scale={[20, 20, 1]} />
      </Environment>
    </>
  );
}

/** Post stack. High tier: AO + bloom + grade + SMAA. Low tier renders straight (renderer tone mapping). */
export function PostFX({ preset }: { preset: Preset }) {
  const p = LOOKS[preset].post;
  if (!HIGH) return null;
  return (
    <EffectComposer multisampling={0} frameBufferType={THREE.HalfFloatType}>
      {/* halfRes is broken on three r172+ (uses removed WebGLMultipleRenderTargets) → full res, performance quality */}
      <N8AO aoRadius={1.2} intensity={p.ao} distanceFalloff={0.6} quality="performance" color="#2a1c3a" />
      <Bloom intensity={p.bloom} luminanceThreshold={p.threshold} luminanceSmoothing={0.2} mipmapBlur radius={0.7} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <HueSaturation saturation={p.sat} />
      <BrightnessContrast brightness={p.bright} contrast={p.contrast} />
      <Vignette offset={0.32} darkness={p.vignette} eskil={false} />
      <SMAA />
    </EffectComposer>
  );
}

/** Renderer tone mapping: off when the post stack does it (avoids double tone mapping). */
export const RENDERER_TONEMAPPING = HIGH ? THREE.NoToneMapping : THREE.NeutralToneMapping;

// ------------------------------------------------------------------ textures
/** Painterly ground: base colour + soft blotches + speckle. Tiles seamlessly enough at large repeats. */
export function useGroundTexture(base: string, dark: string, light: string, repeat = 12, seed = 1) {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const g = c.getContext("2d")!;
    let s = seed * 9301 + 49297;
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    g.fillStyle = base; g.fillRect(0, 0, 512, 512);
    const blob = (col: string, n: number, rmin: number, rmax: number, a: number) => {
      for (let i = 0; i < n; i++) {
        const x = r() * 512, y = r() * 512, rad = rmin + r() * (rmax - rmin);
        for (const [ox, oy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          gr.addColorStop(0, col); gr.addColorStop(1, "rgba(0,0,0,0)");
          g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x + ox, y + oy, rad, 0, Math.PI * 2); g.fill();
        }
      }
    };
    blob(dark, 26, 40, 120, 0.5);
    blob(light, 22, 30, 90, 0.45);
    g.globalAlpha = 0.18;
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() > 0.5 ? dark : light; g.fillRect(r() * 512, r() * 512, 2, 2); }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, [base, dark, light, repeat, seed]);
}

// ------------------------------------------------------------------ grass
/** Scatter helper: rejection-sample points in a rectangle. */
export function scatter(count: number, minX: number, maxX: number, minZ: number, maxZ: number, accept: (x: number, z: number) => boolean, seed = 7) {
  let s = seed * 7919 + 13;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: number[] = [];
  let guard = count * 8;
  while (out.length / 2 < count && guard-- > 0) {
    const x = minX + r() * (maxX - minX), z = minZ + r() * (maxZ - minZ);
    if (accept(x, z)) out.push(x, z);
  }
  return out;
}

function bladeGeometry() {
  // 4-segment tapered blade, local height 0..1, normals straight up (soft "lawn" shading).
  const segs = 3, w = 0.05;
  const pos: number[] = [], nor: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const h = i / segs;
    const hw = w * (1 - h * 0.92);
    const bend = h * h * 0.12;
    pos.push(-hw, h, bend, hw, h, bend);
    nor.push(0, 1, 0, 0, 1, 0);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

/**
 * Instanced wind grass. `points` = flat [x, z, x, z, ...]. Lit + receives shadows (Lambert + shader patch).
 * Phones get a third of the blades.
 */
export function Grass({ points, base = "#3f7a2a", tip = "#b9e070", height = 0.55, width = 1, y = 0 }: {
  points: number[]; base?: string; tip?: string; height?: number; width?: number; y?: number;
}) {
  const reduce = useGame((s) => s.settings.reduceMotion);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uBase: { value: new THREE.Color(base) }, uTip: { value: new THREE.Color(tip) } }), [base, tip]);
  const { mesh } = useMemo(() => {
    const step = HIGH ? 1 : 3;
    const n = Math.floor(points.length / 2 / step);
    const geo = bladeGeometry();
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff", side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying float vH;")
        .replace("#include <begin_vertex>", `
          vec3 transformed = vec3(position);
          vH = position.y;
          vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float gust = sin(uTime * 0.6 + wp.x * 0.05 + wp.z * 0.04) * 0.5 + 0.5;
          float wv = sin(uTime * 1.8 + wp.x * 0.45 + wp.z * 0.3) * (0.4 + gust * 0.6) + sin(uTime * 3.1 + wp.x * 1.3) * 0.15;
          transformed.z += wv * position.y * position.y * 0.32;
          transformed.x += wv * position.y * position.y * 0.12;`);
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uBase;\nuniform vec3 uTip;\nvarying float vH;")
        .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= mix(uBase, uTip, smoothstep(0.0, 1.0, vH));")
        // both faces use the up-normal (no black back faces)
        .replace("#include <normal_fragment_begin>", "float faceDirection = 1.0;\nvec3 normal = normalize( vNormal );\nvec3 nonPerturbedNormal = normal;");
    };
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.receiveShadow = true; m.castShadow = false; m.frustumCulled = false;
    const d = new THREE.Object3D();
    const col = new THREE.Color();
    let s = 12345;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const j = i * step * 2;
      d.position.set(points[j], y, points[j + 1]);
      d.rotation.set((r() - 0.5) * 0.3, r() * Math.PI * 2, (r() - 0.5) * 0.3);
      const h = height * (0.6 + r() * 0.8);
      d.scale.set(width * (0.8 + r() * 0.6) * (HIGH ? 1 : 1.4), h, 1);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      const v = 0.85 + r() * 0.3;
      col.setRGB(v * (0.95 + r() * 0.1), v, v * (0.9 + r() * 0.1));
      m.setColorAt(i, col);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    return { mesh: m };
  }, [points, height, width, y, uniforms]);
  useFrame((_, dt) => { if (!reduce) uniforms.uTime.value += dt; });
  return <primitive object={mesh} />;
}

/** Small rocks / tufts dressing for a ground band (cheap, instanced). */
export function Pebbles({ points, color = "#9a9188", size = 0.18 }: { points: number[]; color?: string; size?: number }) {
  const mesh = useMemo(() => {
    const n = Math.floor(points.length / 2);
    const m = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true }), n);
    m.castShadow = true; m.receiveShadow = true;
    const d = new THREE.Object3D();
    let s = 999;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < n; i++) {
      const k = size * (0.5 + r());
      d.position.set(points[i * 2], k * 0.3, points[i * 2 + 1]);
      d.rotation.set(r() * 3, r() * 3, r() * 3);
      d.scale.set(k * (1 + r() * 0.6), k * 0.6, k);
      d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    }
    return m;
  }, [points, color, size]);
  return <primitive object={mesh} />;
}
