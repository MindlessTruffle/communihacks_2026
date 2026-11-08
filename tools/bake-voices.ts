// Bakes ElevenLabs TTS for every authored line → public/audio/voices/<key>.mp3 + index.json.
// Skips lines already baked (content-addressed by voice+text), so re-running only pays for new/changed lines.
// Run: `pnpm voices:bake` (add `--dry` to count characters only).
import fs from "node:fs";
import path from "node:path";
import { CARDS } from "../src/game/content/cards.ts";
import { CHARACTERS, NARRATOR_VOICE } from "../src/game/content/characters.ts";
import { ADVISOR, SUMMARY_SENTENCES } from "../src/game/content/advisor.ts";
import { UNLOCKS } from "../src/game/content/economy.ts";
import { SCRIPTED } from "../src/game/content/talks.ts";
import { UI_LINES } from "../src/game/content/uiLines.ts";
import { voiceKey } from "../src/audio/voicekey.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const KEY = process.env.ELEVENLABS_API_KEY!;
const outDir = path.join(root, "public", "audio", "voices");
fs.mkdirSync(outDir, { recursive: true });
const dry = process.argv.includes("--dry");

const lines: { voice: string; text: string }[] = [];
const add = (charId: string | null, text: string | undefined) => {
  if (!text) return;
  const voice = charId ? CHARACTERS[charId].voiceId : NARRATOR_VOICE;
  lines.push({ voice, text: text.trim() });
};

for (const c of CARDS) {
  add(c.who, c.ask); add(c.who, c.yesLine); add(c.who, c.noLine);
  if (c.lesson) { add("advisor", c.lesson.praise); add("advisor", c.lesson.coach); add("advisor", c.lesson.realLife); }
}
for (const v of Object.values(ADVISOR)) (Array.isArray(v) ? v : [v]).forEach((t) => add("advisor", t));
for (const u of UNLOCKS) { u.intro.forEach((t) => add(u.presenter, t)); add("advisor", u.realLife); }
for (const t of SUMMARY_SENTENCES) add(null, t);
for (const [charId, talk] of Object.entries(SCRIPTED)) {
  add(charId, talk.opener); add(charId, talk.goodbye);
  talk.rounds.forEach((r) => r.chips.forEach((c) => add(charId, c.reply)));
}
for (const t of UI_LINES) add(null, t);

const unique = new Map(lines.map((l) => [voiceKey(l.voice, l.text), l]));
const todo = [...unique].filter(([k]) => !fs.existsSync(path.join(outDir, k + ".mp3")));
const chars = todo.reduce((a, [, l]) => a + l.text.length, 0);
console.log(`lines: ${unique.size}, to bake: ${todo.length}, characters: ${chars}`);

if (!dry) {
  let done = 0;
  const worker = async () => {
    while (todo.length) {
      const [key, l] = todo.shift()!;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${l.voice}?output_format=mp3_44100_64`, {
            method: "POST",
            headers: { "xi-api-key": KEY, "Content-Type": "application/json" },
            body: JSON.stringify({ text: l.text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.35, speed: 0.95 } }),
          });
          if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 200));
          fs.writeFileSync(path.join(outDir, key + ".mp3"), Buffer.from(await r.arrayBuffer()));
          done++;
          if (done % 25 === 0) console.log("baked", done);
          break;
        } catch (e) {
          console.warn("retry", key, String(e));
          await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        }
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

const all = fs.readdirSync(outDir).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(".mp3", ""));
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(all));
console.log("index entries:", all.length);
