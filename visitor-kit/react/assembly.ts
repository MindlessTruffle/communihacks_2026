import { Group, Object3D, Mesh, MeshStandardMaterial, Texture, DoubleSide, LinearFilter, ClampToEdgeWrapping, type Material } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { manifest, resolveAppearance, slots, getPart, type AppearanceInput, type EyeId, type BodyId } from './appearance.ts';
export type BlinkFrame = 0 | 1 | 2;
const bodyMaterialCache = new WeakMap<Material, Map<string, MeshStandardMaterial>>();
function tinted(source: MeshStandardMaterial, color: string) {
  let palette = bodyMaterialCache.get(source);
  if (!palette) { palette = new Map(); bodyMaterialCache.set(source, palette); }
  let material = palette.get(color);
  if (!material) { material = source.clone(); material.color.set(color); palette.set(color, material); }
  return material;
}
function requiredMesh(library: Object3D, name: string): Mesh {
  const object = library.getObjectByName(name);
  if (!(object instanceof Mesh)) throw new Error(`Gummy visitor: required GLB mesh "${name}" is missing.`);
  return object;
}
export function loadVisitorLibrary(url: string) { return new GLTFLoader().loadAsync(url); }
export function assembleCharacter(library: Object3D, input: AppearanceInput, initialFrame: BlinkFrame = 0) {
  const appearance = resolveAppearance(input);
  const spec = manifest.bodies[appearance.body];
  const root = new Group(); root.name = 'GummyVisitor'; root.scale.setScalar(manifest.sizes[appearance.size]);
  const bodySource = requiredMesh(library, spec.node);
  const body = bodySource.clone(false); body.name = 'Body';
  body.material = tinted(bodySource.material as MeshStandardMaterial, manifest.colors[appearance.color]);
  root.add(body);
  const anchors: Record<string, Object3D> = {};
  for (const [id, anchor] of Object.entries(spec.anchors)) {
    const node = new Object3D(); node.name = id; node.position.fromArray(anchor.position); root.add(node); anchors[id] = node;
  }
  const eyeSource = requiredMesh(library, spec.eyesNode);
  const eyeMaterial = (eyeSource.material as MeshStandardMaterial).clone();
  const sourceMap = eyeMaterial.map;
  if (!sourceMap) throw new Error('Gummy visitor: the required eye atlas texture is missing.');
  const eyeTexture = sourceMap.clone();
  eyeTexture.generateMipmaps = false; eyeTexture.minFilter = LinearFilter; eyeTexture.magFilter = LinearFilter;
  eyeTexture.wrapS = ClampToEdgeWrapping; eyeTexture.wrapT = ClampToEdgeWrapping; eyeTexture.needsUpdate = true;
  eyeMaterial.map = eyeTexture; eyeMaterial.transparent = false; eyeMaterial.alphaTest = .5; eyeMaterial.depthWrite = true; eyeMaterial.side = DoubleSide;
  const eyes = eyeSource.clone(false); eyes.name = 'Eyes'; eyes.material = eyeMaterial; anchors.Face.add(eyes);
  for (const slot of slots) {
    const id = appearance[slot]; if (id === 'none') continue;
    const part = getPart(slot, id); if (!part) continue;
    const fit = part.variants[appearance.body as BodyId];
    const source = library.getObjectByName(fit.node);
    if (!(source instanceof Mesh)) continue; // Optional assets degrade to none.
    const object = source.clone(false); object.name = `${slot}:${id}`;
    object.position.fromArray(fit.position); object.rotation.set(fit.rotation[0], fit.rotation[1], fit.rotation[2]); object.scale.fromArray(fit.scale);
    anchors[part.anchor].add(object);
  }
  function setEyes(style: EyeId, frame: BlinkFrame) {
    if (!Number.isInteger(frame) || frame < 0 || frame > 2) throw new Error('Gummy visitor: blinkFrame must be 0, 1, or 2.');
    if (!Object.hasOwn(manifest.eyes, style)) throw new Error(`Gummy visitor: unknown required eyes "${style}".`);
    const base = manifest.eyes.oval.frames[0], rect = manifest.eyes[style].frames[frame];
    // GLB UVs already occupy the padded oval/open cell. Shift a private texture,
    // preserving shared geometry and the underlying shared image source.
    eyeTexture.repeat.set(1, 1); eyeTexture.offset.set(rect.offset[0] - base.offset[0], rect.offset[1] - base.offset[1]); eyeTexture.updateMatrix();
  }
  setEyes(appearance.eyes, initialFrame);
  let disposed = false;
  return {
    root, appearance, anchors, body, eyes, eyeTexture, setEyes,
    dispose() {
      if (disposed) return; disposed = true;
      eyeMaterial.dispose(); eyeTexture.dispose(); // Never dispose shared geometry/maps/materials.
    }
  };
}

