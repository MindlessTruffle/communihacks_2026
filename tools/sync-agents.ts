// Creates / updates the ElevenLabs conversational agents and writes server/agents.json ({ key: agent_id }).
// Run: `pnpm agents:sync`. Safe to re-run (updates existing agents by stored id).
import fs from "node:fs";
import path from "node:path";
import { AGENTS, AGENT_RULES, KINDNESS_TRAITS } from "../src/game/content/talks.ts";
import { CHARACTERS } from "../src/game/content/characters.ts";

const root = path.resolve(import.meta.dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2];
}
const KEY = process.env.ELEVENLABS_API_KEY!;
const outPath = path.join(root, "server", "agents.json");
const existing: Record<string, string> = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : {};

const tools = [
  {
    type: "client", name: "award_kindness", expects_response: false,
    description: "Call whenever the player says or does something kind (greeting, listening, thanks, sorry, offering help, honesty, encouragement, fairness, patience). Max once per player message.",
    parameters: {
      type: "object",
      properties: {
        trait: { type: "string", description: "One of: " + KINDNESS_TRAITS.join(", "), enum: KINDNESS_TRAITS },
        reason: { type: "string", description: "3-8 simple words, e.g. 'asked how I feel'" },
      },
      required: ["trait", "reason"],
    },
  },
  {
    type: "client", name: "npc_emotion", expects_response: false,
    description: "Show how your character feels right now.",
    parameters: {
      type: "object",
      properties: { emotion: { type: "string", description: "happy, sad, surprised, thinking or laughing", enum: ["happy", "sad", "surprised", "thinking", "laughing"] } },
      required: ["emotion"],
    },
  },
  {
    type: "client", name: "end_conversation", expects_response: false,
    description: "Call after you have said goodbye, to end the chat.",
    parameters: { type: "object", properties: {}, required: [] },
  },
];

async function api(method: string, url: string, body?: unknown) {
  const r = await fetch("https://api.elevenlabs.io" + url, {
    method, headers: { "xi-api-key": KEY, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${url} → ${r.status}: ${text.slice(0, 800)}`);
  return text ? JSON.parse(text) : {};
}

const placeholders = { ruler_title: "Your Majesty", day: "1", today_summary: "A calm day.", tomorrow_hint: "Save a little gold.", run_report: "(none)" };

for (const a of AGENTS) {
  const ch = CHARACTERS[a.charId];
  const body = {
    name: a.name,
    tags: ["royal-concerns"],
    conversation_config: {
      agent: {
        first_message: a.firstMessage,
        language: "en",
        dynamic_variables: { dynamic_variable_placeholders: placeholders },
        prompt: {
          prompt: `${a.persona}\n\nSITUATION\n${a.situation}\n\n${AGENT_RULES}`,
          temperature: 0.6,
          tools,
        },
      },
      tts: { voice_id: ch.voiceId, model_id: "eleven_flash_v2" },
      conversation: { max_duration_seconds: a.key === "advisor_review" ? 420 : 240 },
      turn: { turn_timeout: 12 },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: { conversation: { text_only: true }, agent: { first_message: true } },
      },
    },
  };
  try {
    if (existing[a.key]) {
      await api("PATCH", `/v1/convai/agents/${existing[a.key]}`, body);
      console.log("updated", a.key, existing[a.key]);
    } else {
      const j = await api("POST", "/v1/convai/agents/create", body);
      existing[a.key] = j.agent_id;
      console.log("created", a.key, j.agent_id);
    }
    fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
  } catch (e) {
    console.error("FAILED", a.key, String(e));
  }
}
console.log("wrote", outPath);
