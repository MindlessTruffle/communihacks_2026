// One place for the TTS model + voice settings used by baked lines (tools/bake-voices.ts) and the no-mic /api/tts voicing.
// Audience: adults with developmental disabilities. Expressive but every word clear: natural stability, slightly slower pace.
export const TTS_MODEL = "eleven_v4";
export const TTS_FALLBACK_MODEL = "eleven_v3";
export const VOICE_SETTINGS = { stability: 0.5, similarity_boost: 0.8, style: 0, use_speaker_boost: true, speed: 0.92 };
// Live-chat voicing (no-mic mode) wants lower latency, so it uses the turbo flavour of the same family and falls back to v4 / v3.
export const TTS_LIVE_MODELS = ["eleven_v4_turbo", "eleven_v4", "eleven_v3"];
