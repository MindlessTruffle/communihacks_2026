import { resolveAppearance, type AppearanceInput } from './appearance.ts';

export const GUMMY_URL = '/models/gummy-visitors.glb';
const base: AppearanceInput = { body: 'chubby', size: 'medium', color: 'red', eyes: 'oval' };
const legacy: Record<string, string> = {
  'character-female-c': 'ruler-a', 'character-male-e': 'ruler-b', 'character-female-e': 'ruler-c',
  'character-male-a': 'ruler-d', 'character-raider': 'ruler-e', 'character-female-b': 'ruler-f',
};
export const GUMMY_PROFILES: Record<string, Partial<AppearanceInput>> = {
  'ruler-a': { color: 'red', body: 'chubby' },
  'ruler-b': { color: 'blue', body: 'tall' },
  'ruler-c': { color: 'mint', body: 'chubby', eyes: 'round' },
  'ruler-d': { color: 'lavender', body: 'tall', eyes: 'relaxed' },
  'ruler-e': { color: 'orange', body: 'chubby', eyes: 'cheerful' },
  'ruler-f': { color: 'yellow', body: 'tall', eyes: 'round' },
  advisor: { color: 'lavender', head: 'wizard', eyewear: 'round', eyes: 'relaxed' },
  tilly: { color: 'orange', body: 'tall', eyewear: 'square', clothing: 'collar' },
  marlo: { color: 'mint', head: 'beret', face: 'moustache', clothing: 'belt' },
  fenwick: { color: 'lavender', body: 'tall', eyewear: 'monocle', face: 'moustache' },
  hazel: { color: 'mint', head: 'cap', face: 'freckles', clothing: 'apron' },
  benny: { color: 'orange', body: 'tall', head: 'beret', eyes: 'cheerful' },
  rosa: { color: 'red', eyewear: 'round', clothing: 'collar', eyes: 'cheerful' },
  clank: { color: 'blue', body: 'tall', head: 'cap', clothing: 'cape', eyes: 'stern' },
  wren: { color: 'yellow', head: 'cap', clothing: 'belt' },
  boo: { color: 'lavender', body: 'tall', eyes: 'round' },
  maya: { color: 'mint', eyewear: 'square', head: 'tuft', eyes: 'cheerful' },
  cogs: { color: 'blue', body: 'tall', eyewear: 'square', clothing: 'collar' },
  bill: { color: 'orange', head: 'cap', face: 'moustache', eyes: 'relaxed' },
  pip: { color: 'blue', body: 'tall', eyewear: 'round', clothing: 'apron' },
  gus: { color: 'blue', head: 'beret', clothing: 'belt', eyes: 'stern' },
  zib: { color: 'lavender', body: 'tall', head: 'tuft', eyes: 'round' },
  brick: { color: 'orange', head: 'cap', face: 'moustache', clothing: 'apron' },
  prof: { color: 'mint', body: 'tall', eyewear: 'round', head: 'wizard' },
  kid: { color: 'yellow', head: 'tuft', face: 'freckles', eyes: 'cheerful' },
};

export function gummyId(url: string) {
  const name = url.split('/').pop()?.replace(/\.glb$/, '') ?? 'ruler-a';
  if (name === 'owl') return 'advisor';
  return legacy[name] ?? name;
}

export function gummyAppearance(url: string, crown = false) {
  const id = gummyId(url);
  return resolveAppearance({ ...base, ...GUMMY_PROFILES[id], ...(crown ? { head: 'crown' } : {}) });
}
