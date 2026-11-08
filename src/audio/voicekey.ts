// Shared by the browser and tools/bake-voices.mjs: stable file key for a (voice, text) pair.
export function voiceKey(voiceId: string, text: string): string {
  const s = voiceId + "|" + text.trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0") + s.length.toString(16);
}
