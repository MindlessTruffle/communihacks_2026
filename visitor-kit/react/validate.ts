import { Box3, Mesh, Vector3, MeshStandardMaterial } from 'three';
import { assembleCharacter, loadVisitorLibrary } from './assembly.ts';
import { generateCharacter, manifest, type Appearance, type BodyId, type SizeId, type EyeId, slots } from './appearance.ts';
export async function runValidation() {
  const { scene } = await loadVisitorLibrary('/gummy_visitors.glb');
  const stats: { count: number; maxTriangles: number; maxDraws: number; fittingCombinations: number; testedEyeStates: number } = { count: 0, maxTriangles: 0, maxDraws: 0, fittingCombinations: 0, testedEyeStates: 0 };
  const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
  const meshCount = (root: import('three').Object3D) => {
    let triangles = 0, draws = 0;
    root.traverse(o => { if (o instanceof Mesh) { triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; draws += Math.max(1, o.geometry.groups.length); } });
    return { triangles, draws };
  };
  for (let i = 0; i < 100; i++) {
    const appearance = generateCharacter(i);
    const visitor = assembleCharacter(scene, appearance);
    visitor.root.updateMatrixWorld(true);
    const measurements = meshCount(visitor.root);
    stats.count++; stats.maxTriangles = Math.max(stats.maxTriangles, measurements.triangles); stats.maxDraws = Math.max(stats.maxDraws, measurements.draws);
    check(measurements.triangles <= 2500 && measurements.draws <= 6, 'Budget exceeded');
    const b = new Box3().setFromObject(visitor.body);
    check(Math.abs(b.min.y) < .0001, 'Body does not touch ground');
    check(Math.abs((b.max.y - b.min.y) - manifest.bodies[appearance.body].height * manifest.sizes[appearance.size]) < .0001, 'Height scaling mismatch');
    visitor.dispose();
  }
  // All body x size x individual cosmetic fits: mathematical anchor/scale and finite geometry checks.
  for (const body of Object.keys(manifest.bodies) as BodyId[]) for (const size of Object.keys(manifest.sizes) as SizeId[]) {
    for (const [id, part] of Object.entries(manifest.parts)) {
      const slot = part.slot as typeof slots[number];
      const a: Appearance = { body, size, color: 'mint', eyes: 'oval', head: 'none', eyewear: 'none', face: 'none', clothing: 'none', [slot]: id.slice(slot.length + 1) };
      const c = assembleCharacter(scene, a); c.root.updateMatrixWorld(true);
      const attached = c.root.getObjectByName(`${slot}:${a[slot]}`);
      check(!!attached && attached.parent === c.anchors[part.anchor], 'Accessory anchor mismatch');
      const expected = new Vector3().fromArray(manifest.bodies[body].anchors[part.anchor as keyof typeof manifest.bodies.tall.anchors].position).multiplyScalar(manifest.sizes[size]);
      check(c.anchors[part.anchor].getWorldPosition(new Vector3()).distanceTo(expected) < .00001, 'Anchor height mismatch');
      const bounds = new Box3().setFromObject(attached!);
      check([bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite), 'Invalid accessory geometry');
      stats.fittingCombinations++; c.dispose();
    }
  }
  const input = { body: 'chubby', size: 'medium', color: 'red', eyes: 'oval', head: 'crown', eyewear: 'round', face: 'freckles', clothing: 'cape' } as const;
  const a = assembleCharacter(scene, input), b = assembleCharacter(scene, input);
  check(a.body.geometry === b.body.geometry && a.eyes.geometry === b.eyes.geometry, 'Geometry is not shared');
  check(a.eyeTexture.source === b.eyeTexture.source && a.eyeTexture !== b.eyeTexture, 'Eye image/state isolation mismatch');
  check(a.body.material === b.body.material, 'Same-color materials are not shared');
  const before = b.eyeTexture.offset.clone();
  for (const style of Object.keys(manifest.eyes) as EyeId[]) for (const frame of [0, 1, 2] as const) { a.setEyes(style, frame); stats.testedEyeStates++; check(b.eyeTexture.offset.equals(before), 'Blink state leaked'); }
  const alternate = assembleCharacter(scene, { ...input, color: 'blue' });
  check(alternate.body.material !== b.body.material, 'Color mutation leaked');
  check((b.body.material as MeshStandardMaterial).color.getHexString() === 'e95764', 'Body color changed unexpectedly');
  const worst = meshCount(a.root); check(worst.triangles <= 2500 && worst.draws <= 6, 'Fully dressed budget exceeded');
  const clone = scene.clone(true); const optional = clone.getObjectByName('head_cap__chubby'); optional?.removeFromParent();
  const fallback = assembleCharacter(clone, { ...input, head: 'cap' }); check(!fallback.root.getObjectByName('head:cap'), 'Missing optional mesh did not fall back'); fallback.dispose();
  const missing = scene.clone(true); missing.getObjectByName('Eyes_chubby')?.removeFromParent();
  let failed = false; try { assembleCharacter(missing, input); } catch (e) { failed = String(e).includes('required GLB mesh'); } check(failed, 'Missing required eyes must fail');
  a.dispose(); b.dispose(); alternate.dispose();
  return { status: 'passed', ...stats, fullyDressed: worst, checks: ['GLB loaded with embedded textures', 'ground origin and heights', 'attachment transforms', 'shared geometry', 'isolated eyes/colors', 'optional fallback', 'required errors'] };
}
