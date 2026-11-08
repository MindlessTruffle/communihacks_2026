// Bakes ElevenLabs TTS for every authored line → public/audio/voices/<key>.mp3 + index.json.
// Skips lines already baked (content-addressed by voice+text), so re-running only pays for new/changed lines.
// A models.json manifest next to the mp3s records which TTS model made each file, so switching model re-bakes (files with no entry = legacy).
// Run: `pnpm voices:bake` (`--dry` counts characters only, `--budget=N` caps characters per run, highest-priority sets first,
// `--prune` deletes mp3s that no authored line references).
import fs from "node:fs";
import path from "node:path";
import { CARDS } from "../src/game/content/cards.ts";
import { CHARACTERS, NARRATOR_VOICE } from "../src/game/content/characters.ts";
import { ADVISOR, SUMMARY_SENTENCES } from "../src/game/content/advisor.ts";
import { UNLOCKS } from "../src/game/content/economy.ts";
import { SCRIPTED } from "../src/game/content/talks.ts";
import { UI_LINES } from "../src/game/content/uiLines.ts";
import { voiceKey } from "../src/audio/voicekey.ts";
// @ts-ignore plain mjs module shared with the server
import { TTS_MODEL, VOICE_SETTINGS } from "../server/voiceModel.mjs";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const KEY = process.env.ELEVENLABS_API_KEY!;
const outDir = path.join(root, "public", "audio", "voices");
fs.mkdirSync(outDir, { recursive: true });
const dry = process.argv.includes("--dry");
const prune = process.argv.includes("--prune");
const budget = Number((process.argv.find((a) => a.startsWith("--budget=")) ?? "").slice(9)) || Infinity;
const manifestPath = path.join(outDir, "models.json");
const manifest: Record<string, string> = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};

// priority: lower = baked first (advisor + tutorial/UI + unlocks, then scripted chats, then cards by how often they appear)
const lines: { voice: string; text: string; pri: number }[] = [];
let curPri = 5;
const add = (charId: string | null, text: string | undefined, pri = curPri) => {
  if (!text) return;
  const voice = charId ? CHARACTERS[charId].voiceId : NARRATOR_VOICE;
  lines.push({ voice, text: text.trim(), pri: charId === "advisor" ? Math.min(pri, 1) : pri });
};

curPri = 4;
for (const c of CARDS) {
  add(c.who, c.ask); add(c.who, c.yesLine); add(c.who, c.noLine);
  if (c.lesson) { add("advisor", c.lesson.praise); add("advisor", c.lesson.coach); add("advisor", c.lesson.realLife); }
}
curPri = 1;
for (const v of Object.values(ADVISOR)) (Array.isArray(v) ? v : [v]).forEach((t) => add("advisor", t));
curPri = 2;
for (const u of UNLOCKS) { u.intro.forEach((t) => add(u.presenter, t)); add("advisor", u.realLife); }
for (const t of SUMMARY_SENTENCES) add(null, t);
curPri = 3;
for (const [charId, talk] of Object.entries(SCRIPTED)) {
  add(charId, talk.opener); add(charId, talk.goodbye);
  talk.rounds.forEach((r) => r.chips.forEach((c) => add(charId, c.reply)));
}
curPri = 1;
for (const t of UI_LINES) add(null, t);

const unique = new Map<string, (typeof lines)[number]>();
for (const l of lines) { const k = voiceKey(l.voice, l.text); const o = unique.get(k); if (!o || l.pri < o.pri) unique.set(k, l); }
const total = [...unique.values()].reduce((a, l) => a + l.text.length, 0);
let todo = [...unique].filter(([k]) => !fs.existsSync(path.join(outDir, k + ".mp3")) || manifest[k] !== TTS_MODEL).sort((a, b) => a[1].pri - b[1].pri);
const wanted = todo.reduce((a, [, l]) => a + l.text.length, 0);
let spent = 0;
const pending: typeof todo = [];
todo = todo.filter(([, l]) => (spent + l.text.length <= budget ? ((spent += l.text.length), true) : (pending.push([ "", l ]), false)));
console.log(`model: ${TTS_MODEL}; lines: ${unique.size} (${total} chars total); need (re)bake: ${wanted} chars; this run: ${todo.length} lines / ${spent} chars; pending: ${pending.length} lines`);

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
            body: JSON.stringify({ text: l.text, model_id: TTS_MODEL, voice_settings: VOICE_SETTINGS }),
          });
          if (!r.ok) throw new Error(r.status + " " + (await r.text()).slice(0, 200));
          fs.writeFileSync(path.join(outDir, key + ".mp3"), Buffer.from(await r.arrayBuffer()));
          manifest[key] = TTS_MODEL;
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
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 0));
}

if (prune) {
  let removed = 0;
  for (const f of fs.readdirSync(outDir)) {
    if (f.endsWith(".mp3") && !unique.has(f.slice(0, -4))) { fs.unlinkSync(path.join(outDir, f)); delete manifest[f.slice(0, -4)]; removed++; }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 0));
  console.log("pruned unreferenced mp3s:", removed);
}

const all = fs.readdirSync(outDir).filter((f) => f.endsWith(".mp3")).map((f) => f.replace(".mp3", ""));
fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify(all));
console.log("index entries:", all.length);
