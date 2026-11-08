import assert from 'node:assert/strict';
import { generateCharacter, resolveAppearance, manifest, slots, getPart } from './appearance.ts';
const seen = new Set<string>();
for (let i = 0; i < 100; i++) {
  const a = generateCharacter(i), b = generateCharacter(i);
  assert.deepEqual(a, b); assert.deepEqual(resolveAppearance(a), a);
  assert.notEqual(a.head, 'crown'); seen.add(JSON.stringify(a));
  for (const slot of slots) if (a[slot] !== 'none') assert.ok(getPart(slot, a[slot])?.compatibleBodies.includes(a.body));
}
assert.ok(seen.size > 80);
assert.deepEqual(generateCharacter('saved-visitor-42'), generateCharacter('saved-visitor-42'));
assert.notDeepEqual(generateCharacter(42), generateCharacter('42'));
assert.ok(Array.from({ length: 200 }, (_, i) => generateCharacter(i, { allowCrown: true })).some(a => a.head === 'crown'));
const base = { body: 'tall', size: 'medium', color: 'blue', eyes: 'oval' } as const;
assert.equal(resolveAppearance({ ...base, head: 'missing' }).head, 'none');
assert.equal(resolveAppearance(base).clothing, 'none');
assert.throws(() => resolveAppearance({ ...base, body: 'unknown' } as never), /required body/);
assert.throws(() => resolveAppearance({ ...base, eyes: 'unknown' } as never), /required eyes/);
for (const body of Object.values(manifest.budgets.worstCase)) assert.ok(body.triangles <= 2500 && body.draws <= 6);
console.log(JSON.stringify({ status: 'passed', seededCharacters: 100, unique: seen.size, cases: ['stable seeds', 'type-separated seeds', 'compatible parts', 'crown exclusion and override', 'optional fallback', 'required errors', 'budget'] }, null, 2));
