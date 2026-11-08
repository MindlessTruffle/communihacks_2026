// Painterly finish: hand-painted brush-stroke detail (tileable greyscale swatches in public/textures/painterly/, made with Codex imagegen)
// triplanar-mapped over any base / vertex colour, + warm-top / cool-underside gradient, painted edge highlights, cavity darkening, soft rim.
// One shader program per detail type (customProgramCacheKey). Skinned meshes sample in bind-pose object space so the paint does not swim.
//
// CONTRACT
//   painterlyMaterial({ color?, map?, detail, scale?, roughness?, metalness?, vertexColors? }): THREE.MeshStandardMaterial
//   applyPainterly(root, pick?): replaces the material of every mesh under `root` (pick returns options, or null to leave a mesh alone).
//   detail: "stone" | "brick" | "wood" | "roof" | "cloth" | "skin" | "hair" | "metal" | "gold" | "foliage" | "ground" | "auto"
//   "auto" (env kit) picks stone / wood / roof / foliage / gold per fragment from the vertex colour.
//   scale = tiles per world unit (default per detail). Baked vertex colours are kept when the source mesh has them.
import * as THREE from "three";

export type PainterlyDetail = "stone" | "brick" | "wood" | "roof" | "cloth" | "skin" | "hair" | "metal" | "gold" | "foliage" | "ground" | "auto";
export interface PainterlyOpts {
  color?: THREE.ColorRepresentation; map?: THREE.Texture; detail: PainterlyDetail; scale?: number; roughness?: number; metalness?: number; vertexColors?: boolean;
}

const FILE: Record<Exclude<PainterlyDetail, "auto">, string> = {
  stone: "stone", brick: "brick", wood: "wood", roof: "roof", cloth: "cloth", skin: "skin", hair: "hair", metal: "metal", gold: "gold", foliage: "foliage", ground: "foliage",
};
// defaults: [tiles per unit, strength, roughness, metalness]
const DEF: Record<PainterlyDetail, [number, number, number, number]> = {
  stone: [0.16, 0.4, 0.9, 0], brick: [0.14, 0.38, 0.92, 0], wood: [0.3, 0.45, 0.85, 0], roof: [0.25, 0.5, 0.85, 0], cloth: [0.9, 0.55, 0.95, 0],
  skin: [1.2, 0.25, 0.7, 0], hair: [1.2, 0.5, 0.6, 0], metal: [0.6, 0.55, 0.45, 0.6], gold: [1.4, 0.45, 0.3, 1], foliage: [0.22, 0.6, 0.9, 0], ground: [0.07, 0.4, 1, 0], auto: [0.2, 0.42, 0.9, 0],
};

const cache = new Map<string, THREE.Texture>();
let loader: THREE.TextureLoader | null = null;
function detailTex(file: string): THREE.Texture {
  let t = cache.get(file);
  if (t) return t;
  const c = document.createElement("canvas"); c.width = c.height = 2;
  const g = c.getContext("2d")!; g.fillStyle = "#808080"; g.fillRect(0, 0, 2, 2); // neutral until the swatch arrives
  t = new THREE.Texture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  cache.set(file, t);
  loader ??= new THREE.TextureLoader();
  const tex = t;
  loader.load(`/textures/painterly/${file}.webp`, (l) => { tex.image = l.image; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.needsUpdate = true; });
  return t;
}

const VERT_PARS = "varying vec3 vPWorld;\nvarying vec3 vPNormal;\n";
const VERT_MAIN = `
  {
    vec4 pwp = vec4(transformed, 1.0);
    vec3 pn = objectNormal;
    #ifdef USE_INSTANCING
      pwp = instanceMatrix * pwp;
      pn = mat3(instanceMatrix) * pn;
    #endif
    #ifdef USE_SKINNING
      vPWorld = transformed * length(modelMatrix[0].xyz);
    #else
      vPWorld = (modelMatrix * pwp).xyz;
    #endif
    vPNormal = normalize(mat3(modelMatrix) * pn);
  }
`;
const FRAG_PARS = `
varying vec3 vPWorld;
varying vec3 vPNormal;
uniform sampler2D uD0; uniform sampler2D uD1; uniform sampler2D uD2; uniform sampler2D uD3;
uniform float uScale; uniform float uStrength; uniform float uAuto;
float tri(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy).r * w.x + texture2D(t, p.xz).r * w.y + texture2D(t, p.xy).r * w.z; }
`;
const FRAG_COLOR = `
  {
    vec3 pn = normalize(vPNormal);
    vec3 w = pow(abs(pn), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-4);
    vec3 p = vPWorld * uScale;
    float d = tri(uD0, p, w);
    #ifdef USE_COLOR
      if (uAuto > 0.5) {
        vec3 c = vColor.rgb;
        float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
        float sat = (mx - mn) / (mx + 1e-4);
        float green = smoothstep(0.02, 0.18, c.g - max(c.r, c.b) * 0.92);
        float roof = smoothstep(1.4, 2.4, c.r / (c.g + 1e-3)) * smoothstep(0.25, 0.5, sat) * smoothstep(0.3, 0.5, mx);
        float wood = smoothstep(0.3, 0.5, sat) * (1.0 - smoothstep(0.26, 0.4, mx)) * (1.0 - roof) * (1.0 - green);
        float gold = smoothstep(0.65, 0.8, sat) * smoothstep(0.45, 0.7, mx) * (1.0 - roof) * (1.0 - green) * smoothstep(0.35, 0.6, c.g / (c.r + 1e-3));
        float dS = d, dW = tri(uD1, p, w), dR = tri(uD2, p * 1.3, w), dF = tri(uD3, p, w);
        float dG = dS;
        d = dS; d = mix(d, dW, wood); d = mix(d, dR, roof); d = mix(d, dF, green); d = mix(d, dG, gold);
      }
    #endif
    // painted value variation (swatches are mean-grey: x2 keeps the base colour's overall value)
    diffuseColor.rgb *= mix(1.0, clamp(d * 2.0, 0.35, 1.7), uStrength);
    // warm top-light / cool underside
    float up = pn.y * 0.5 + 0.5;
    diffuseColor.rgb *= mix(vec3(0.84, 0.9, 1.08), vec3(1.07, 1.03, 0.92), smoothstep(0.1, 0.9, up));
    // painted edge highlight where the surface turns sharply
    float edge = clamp(length(fwidth(pn)) * 3.0, 0.0, 1.0);
    diffuseColor.rgb += edge * vec3(0.10, 0.085, 0.06) * (0.4 + up);
    // cavity darkening from the baked AO / vertex colour
    #ifdef USE_COLOR
      float lum = dot(vColor.rgb, vec3(0.333));
      diffuseColor.rgb *= mix(0.9, 1.0, smoothstep(0.02, 0.35, lum));
    #endif
  }
`;
const FRAG_RIM = `
  {
    vec3 vn = normalize(normal);
    float rim = pow(1.0 - clamp(dot(vn, normalize(vViewPosition)), 0.0, 1.0), 3.0);
    gl_FragColor.rgb += rim * vec3(1.0, 0.93, 0.8) * 0.09;
  }
`;

export function painterlyMaterial(opts: PainterlyOpts): THREE.MeshStandardMaterial {
  const [dScale, dStrength, dRough, dMetal] = DEF[opts.detail];
  const auto = opts.detail === "auto";
  const main = auto ? "stone" : FILE[opts.detail as Exclude<PainterlyDetail, "auto">];
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0xffffff, map: opts.map ?? null,
    roughness: opts.roughness ?? dRough, metalness: opts.metalness ?? dMetal, vertexColors: !!opts.vertexColors,
  });
  const uniforms = {
    uD0: { value: detailTex(main) }, uD1: { value: detailTex(auto ? "wood" : main) }, uD2: { value: detailTex(auto ? "roof" : main) }, uD3: { value: detailTex(auto ? "foliage" : main) },
    uScale: { value: opts.scale ?? dScale }, uStrength: { value: dStrength }, uAuto: { value: auto ? 1 : 0 },
  };
  mat.userData.painterly = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + VERT_PARS).replace("#include <begin_vertex>", "#include <begin_vertex>\n" + VERT_MAIN);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + FRAG_PARS)
      .replace("#include <color_fragment>", "#include <color_fragment>\n" + FRAG_COLOR)
      .replace("#include <dithering_fragment>", FRAG_RIM + "\n#include <dithering_fragment>");
  };
  mat.customProgramCacheKey = () => `painterly:${opts.detail}:${opts.vertexColors ? "vc" : "nc"}`;
  return mat;
}

const DEFAULT_PICK = (m: THREE.Mesh): PainterlyOpts | null => {
  const src = Array.isArray(m.material) ? m.material[0] : m.material;
  const s = src as THREE.MeshStandardMaterial;
  const n = ((s?.name ?? "") + " " + m.name).toLowerCase();
  const color = s?.color ? s.color.clone() : undefined;
  const base = { color, map: s?.map ?? undefined, vertexColors: !!(m.geometry.attributes.color) };
  const d: PainterlyDetail = /skin|face|head/.test(n) ? "skin" : /hair/.test(n) ? "hair" : /gold|crown|coin/.test(n) ? "gold" : /metal|iron|armor|armour/.test(n) ? "metal"
    : /wood|plank|timber/.test(n) ? "wood" : /roof/.test(n) ? "roof" : /brick/.test(n) ? "brick" : /leaf|foliage|grass|bush/.test(n) ? "foliage" : /stone|rock|wall/.test(n) ? "stone" : "cloth";
  return { ...base, detail: d };
};

/** Replace the materials under `root` with painterly ones (keeps colour, map and vertex colours). */
export function applyPainterly(root: THREE.Object3D, pick: (mesh: THREE.Mesh) => PainterlyOpts | null = DEFAULT_PICK): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const opts = pick(m);
    if (!opts) return;
    const old = m.material;
    const mat = painterlyMaterial(opts);
    if (!Array.isArray(old)) {
      const src = old as THREE.MeshStandardMaterial;
      if ((src as THREE.Material & { skinning?: boolean }).transparent) { mat.transparent = true; mat.opacity = src.opacity; }
      mat.side = src.side;
    }
    m.material = mat;
  });
}
