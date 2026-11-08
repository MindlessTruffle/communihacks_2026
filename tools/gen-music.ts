// Generates looping background music with ElevenLabs Music → public/audio/music/<name>.mp3 + index.json.
// Run: `pnpm music:gen` (add a name to regenerate one track: `pnpm music:gen court`).
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const outDir = path.join(root, "public", "audio", "music");
fs.mkdirSync(outDir, { recursive: true });

const base = "Instrumental only, no vocals. Seamless loop, consistent tempo, gentle start and end so it loops cleanly. Cozy cartoon fantasy video game soundtrack, cheerful and encouraging, never tense.";
const TRACKS: Record<string, { prompt: string; ms: number }> = {
  title: { ms: 60000, prompt: `${base} Main theme for a cute medieval kingdom game. Bouncy pizzicato strings, glockenspiel, light hand percussion, playful flute melody, 110 bpm, major key.` },
  court: { ms: 90000, prompt: `${base} Throne room daytime music. Bouncy lute and pizzicato, marimba, soft tambourine, whimsical bassoon, 100 bpm, major key, light and catchy, not distracting under dialogue.` },
  street: { ms: 90000, prompt: `${base} Warm evening village stroll at sunset. Accordion, soft acoustic guitar, gentle strings, crickets ambience feel, 80 bpm, relaxed and friendly.` },
  market: { ms: 90000, prompt: `${base} Night market shopping music. Playful plucked strings, light hand drums, celesta, cheerful busy bustle, 105 bpm, lantern-lit fair feeling.` },
  review: { ms: 60000, prompt: `${base} Gentle reflective music for a kind conversation with a wise owl. Soft piano, warm strings, music box, 70 bpm, hopeful and comforting.` },
};

const only = process.argv[2];
for (const [name, t] of Object.entries(TRACKS)) {
  if (only && only !== name) continue;
  const file = path.join(outDir, name + ".mp3");
  if (!only && fs.existsSync(file)) { console.log("exists", name); continue; }
  const r = await fetch("https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: t.prompt, music_length_ms: t.ms, force_instrumental: true }),
  });
  if (!r.ok) { console.error("FAILED", name, r.status, (await r.text()).slice(0, 300)); continue; }
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  console.log("made", name);
}
const all = fs.readdirSync(outDir).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(".mp3", ""));
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(all));
console.log("index", all);
