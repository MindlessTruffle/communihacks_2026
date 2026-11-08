import manifest from './manifest.json' with { type: 'json' };
export { manifest };
export type BodyId = 'tall' | 'chubby';
export type SizeId = 'small' | 'medium' | 'large';
export type ColorId = keyof typeof manifest.colors;
export type EyeId = keyof typeof manifest.eyes;
export type Appearance = {
  body: BodyId; size: SizeId; color: ColorId; eyes: EyeId;
  head: string; eyewear: string; face: string; clothing: string;
};
export type AppearanceInput = Pick<Appearance, 'body' | 'size' | 'color' | 'eyes'> & Partial<Pick<Appearance, 'head' | 'eyewear' | 'face' | 'clothing'>>;
export const slots = ['head', 'eyewear', 'face', 'clothing'] as const;
export type Slot = typeof slots[number];
export type Part = typeof manifest.parts[keyof typeof manifest.parts];
export function getPart(slot: Slot, id: string): Part | undefined {
  return (manifest.parts as Record<string, Part>)[`${slot}_${id}`];
}
export function resolveAppearance(input: AppearanceInput): Appearance {
  for (const [field, values] of [['body', manifest.bodies], ['size', manifest.sizes], ['color', manifest.colors], ['eyes', manifest.eyes]] as const) {
    if (!Object.hasOwn(values, input[field])) throw new Error(`Gummy visitor: unknown required ${field} "${input[field]}".`);
  }
  const resolved: Appearance = { ...input, head: 'none', eyewear: 'none', face: 'none', clothing: 'none' };
  for (const slot of slots) {
    const id = input[slot] ?? 'none';
    const part = getPart(slot, id);
    resolved[slot] = id !== 'none' && part?.compatibleBodies.includes(input.body) ? id : 'none';
  }
  return resolved;
}
function seeded(seed: string | number) {
  let state = 2166136261;
  for (const ch of `${typeof seed}:${String(seed)}`) state = Math.imul(state ^ ch.charCodeAt(0), 16777619);
  return () => {
    state += 0x6D2B79F5;
    let n = state; n = Math.imul(n ^ n >>> 15, n | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61);
    return ((n ^ n >>> 14) >>> 0) / 4294967296;
  };
}
export function generateCharacter(seed: string | number, options: { allowCrown?: boolean } = {}): Appearance {
  const random = seeded(seed);
  const pick = <T,>(items: T[]): T => items[Math.floor(random() * items.length)];
  const body = pick(Object.keys(manifest.bodies)) as BodyId;
  const result: Appearance = {
    body, size: pick(Object.keys(manifest.sizes)) as SizeId,
    color: pick(Object.keys(manifest.colors)) as ColorId,
    eyes: pick(Object.keys(manifest.eyes)) as EyeId,
    head: 'none', eyewear: 'none', face: 'none', clothing: 'none'
  };
  for (const slot of slots) {
    const ids = Object.entries(manifest.parts)
      .filter(([, part]) => part.slot === slot && part.compatibleBodies.includes(body) && (!part.rulerOnly || options.allowCrown))
      .map(([id]) => id.slice(slot.length + 1));
    result[slot] = pick(['none', ...ids]);
  }
  return result;
}
