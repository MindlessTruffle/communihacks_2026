// Volumetric-looking light + small effects: additive light shafts (soft noise shader), animated shader flames with a glow halo,
// additive halo points (lantern haze), pattern-rug texture. Cheap enough for the low tier (static shafts, no dust).
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Sparkles } from "@react-three/drei";
import { HIGH } from "./look.tsx";
import { useGame } from "../game/store.ts";
import type { Vec3 } from "./common.tsx";

const NOISE = `
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }
`;

/** A light shaft: prism from four top corners along `dir` down to `floorY`, soft noisy additive shading. */
export function Shaft({ top, dir, floorY = 0, color = "#ffe2a8", intensity = 0.18, animated = HIGH, fade = 1.1 }: {
  top: [Vec3, Vec3, Vec3, Vec3]; dir: Vec3; floorY?: number; color?: string; intensity?: number; animated?: boolean; fade?: number;
}) {
  const geo = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize();
    const T = top.map((p) => new THREE.Vector3(...p));
    const B = T.map((p) => p.clone().addScaledVector(d, (p.y - floorY) / -d.y));
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4, k = pos.length / 3;
      pos.push(...T[i].toArray(), ...T[j].toArray(), ...B[j].toArray(), ...B[i].toArray());
      uv.push(0, 0, 1, 0, 1, 1, 0, 1);
      idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }, [top, dir, floorY]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uFade: { value: fade } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec3 uColor; uniform float uI; uniform float uFade;\n${NOISE}
      void main(){
        float edge = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float along = pow(clamp(1.0 - vUv.y, 0.0, 1.0), uFade);
        float n = 0.65 + 0.35 * vn(vec2(vUv.x * 3.0 + uTime * 0.05, vUv.y * 5.0 - uTime * 0.12));
        float a = edge * along * n * uI;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  }), [color, intensity, fade]);
  useFrame((_, dt) => { if (animated) mat.uniforms.uTime.value += dt; });
  return <mesh geometry={geo} material={mat} renderOrder={5} frustumCulled={false} />;
}

/** Soft additive window-shaped light patch on the floor (the window outline projected along the sun direction). */
function FloorPatch({ x0, x1, y0, y1, z, dir, night }: { x0: number; x1: number; y0: number; y1: number; z: number; dir: Vec3; night: boolean }) {
  const geo = useMemo(() => {
    const d = new THREE.Vector3(...dir).normalize();
    const pr = (x: number, y: number) => new THREE.Vector3(x, y, z).addScaledVector(d, y / -d.y).setY(0.035);
    const A = pr(x0, y0), B = pr(x1, y0), C = pr(x1, y1), D = pr(x0, y1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([...A.toArray(), ...B.toArray(), ...C.toArray(), ...D.toArray()], 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, [x0, x1, y0, y1, z, dir]);
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { uColor: { value: new THREE.Color(night ? "#8fa0ff" : "#ffd48a") }, uI: { value: night ? 0.12 : 0.42 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "varying vec2 vUv; uniform vec3 uColor; uniform float uI; void main(){ float e = smoothstep(0.0, 0.16, vUv.x) * smoothstep(1.0, 0.84, vUv.x) * smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.8, vUv.y); gl_FragColor = vec4(uColor * e * uI, e * uI); }",
  }), [night]);
  return <mesh geometry={geo} material={mat} renderOrder={3} frustumCulled={false} />;
}

/** Warm shafts through the court's pointed windows onto the floor + floating dust motes (high tier). */
export function WindowShafts({ xs, wallZ, y0 = 1.7, y1 = 4.6, halfW = 1.05, night = false }: { xs: number[]; wallZ: number; y0?: number; y1?: number; halfW?: number; night?: boolean }) {
  const dir: Vec3 = [0.27, -0.42, 0.87]; // matches the court key light (sun behind the windows)
  const z = wallZ + 0.12;
  const reduce = useGame((s) => s.settings.reduceMotion);
  return (
    <>
      {xs.map((cx) => {
        const top: [Vec3, Vec3, Vec3, Vec3] = [[cx - halfW, y1, z], [cx + halfW, y1, z], [cx + halfW, y0, z], [cx - halfW, y0, z]];
        return (
          <group key={cx}>
            <FloorPatch x0={cx - halfW} x1={cx + halfW} y0={y0} y1={y1} z={z} dir={dir} night={night} />
            <Shaft top={top} dir={dir} floorY={0.03} color={night ? "#9fb0ff" : "#ffe0a0"} intensity={night ? 0.2 : 0.6} animated={HIGH && !reduce} />
            {HIGH && !reduce && <Sparkles position={[cx + 1.2, 2.4, wallZ + 3.4]} scale={[2.6, 3.0, 5.2]} count={26} size={2.6} speed={0.12} opacity={0.55} color="#fff1c4" noise={0.4} />}
          </group>
        );
      })}
    </>
  );
}

/** Animated shader flame (+ soft glow halo) billboard-free: faces +z (the camera looks down -z). */
export function Flame({ position, size = 1 }: { position: Vec3; size?: number }) {
  const flame = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false,
    uniforms: { uTime: { value: Math.random() * 10 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `varying vec2 vUv; uniform float uTime;\n${NOISE}
      void main(){
        float y = vUv.y, x = vUv.x * 2.0 - 1.0;
        float n = vn(vec2(x * 2.2, y * 3.5 - uTime * 3.2)) - 0.5;
        float n2 = vn(vec2(x * 5.0 + 7.0, y * 6.0 - uTime * 5.5)) - 0.5;
        float sway = n * 0.55 * y + n2 * 0.18 * y;
        float w = mix(0.46, 0.03, pow(y, 0.85));
        float d = abs(x - sway) / w;
        float body = smoothstep(1.0, 0.15, d) * smoothstep(0.0, 0.07, y) * smoothstep(1.0, 0.72, y + n2 * 0.1);
        vec3 col = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.92, 0.55), pow(1.0 - y, 1.6) * smoothstep(1.0, 0.25, d));
        gl_FragColor = vec4(col * body * 1.7, body);
      }`,
  }), []);
  const halo = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,196,110,0.9)"); gr.addColorStop(0.35, "rgba(255,150,60,0.28)"); gr.addColorStop(1, "rgba(255,120,40,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.55 });
  }, []);
  useFrame((_, dt) => { flame.uniforms.uTime.value += dt; });
  return (
    <group position={position} scale={size}>
      <mesh material={halo} position={[0, 0.1, -0.02]} renderOrder={6}><planeGeometry args={[2.6, 2.6]} /></mesh>
      <mesh material={flame} position={[0, 0.12, 0]} renderOrder={7}><planeGeometry args={[0.55, 0.95]} /></mesh>
    </group>
  );
}

/** Additive glow points (lantern haze, sconce glow). One draw call for any number of lights. */
export function Halos({ points, size = 3, color = "#ffb766", opacity = 0.55 }: { points: Vec3[]; size?: number; color?: string; opacity?: number }) {
  const geo = useMemo(() => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(points.flat(), 3)); return g; }, [points]);
  const tex = useMemo(() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,0.35)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <points geometry={geo} frustumCulled={false} renderOrder={6}>
      <pointsMaterial map={tex} size={size} sizeAttenuation color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} fog={false} />
    </points>
  );
}

/** Plum rug with a gold pattern border (tile along x). */
export function useRugTexture() {
  return useMemo(() => {
    const c = document.createElement("canvas"); c.width = 512; c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#5b2a52"; g.fillRect(0, 0, 512, 128);
    g.fillStyle = "#6e3763";
    for (let i = 0; i < 40; i++) g.fillRect(Math.random() * 512, Math.random() * 128, 18, 2);
    g.strokeStyle = "#e9b43c"; g.lineWidth = 5; g.strokeRect(0, 3, 512, 122);
    g.strokeStyle = "#c78a28"; g.lineWidth = 2; g.strokeRect(0, 14, 512, 100);
    g.fillStyle = "#e9b43c";
    for (let k = 0; k < 4; k++) { // diamond medallions
      const x = 64 + k * 128;
      g.beginPath(); g.moveTo(x, 34); g.lineTo(x + 28, 64); g.lineTo(x, 94); g.lineTo(x - 28, 64); g.closePath(); g.fill();
      g.fillStyle = "#5b2a52"; g.beginPath(); g.moveTo(x, 46); g.lineTo(x + 14, 64); g.lineTo(x, 82); g.lineTo(x - 14, 64); g.closePath(); g.fill();
      g.fillStyle = "#e9b43c"; g.fillRect(x - 3, 61, 6, 6);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }, []);
}

void useRef;
