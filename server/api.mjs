// Tiny server API shared by Vite dev/preview (vite.config.ts plugin) and prod (server/serve.mjs).
// Keeps the ElevenLabs key on the server: browser only ever gets short-lived conversation tokens.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export function loadEnv() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

function agents() {
  const p = path.join(root, "server", "agents.json");
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : {};
}

// Simple per-IP rate limit so a leaked page can't burn the agent budget.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 10 * 60_000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

/** Returns true if the request was handled. */
export async function handleApi(req, res) {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith("/api/")) return false;
  const key = process.env.ELEVENLABS_API_KEY;

  if (url.pathname === "/api/health") {
    send(res, 200, { voiceAgents: !!key && Object.keys(agents()).length > 0 });
    return true;
  }

  if (url.pathname === "/api/convai-token") {
    const name = url.searchParams.get("agent") || "";
    const agentId = agents()[name];
    if (!key || !agentId) { send(res, 503, { error: "agents-not-configured" }); return true; }
    if (limited(req.socket?.remoteAddress || "?")) { send(res, 429, { error: "rate-limited" }); return true; }
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`, {
        headers: { "xi-api-key": key },
      });
      const j = await r.json();
      if (!r.ok || !j.token) { send(res, 502, { error: "token-failed", detail: j }); return true; }
      send(res, 200, { token: j.token, agentId });
    } catch (e) {
      send(res, 502, { error: "token-failed", detail: String(e) });
    }
    return true;
  }

  // Voices an agent's reply in no-mic mode (character voice). POST { voiceId, text } → audio/mpeg stream.
  if (url.pathname === "/api/tts" && req.method === "POST") {
    if (!key) { send(res, 503, { error: "no-key" }); return true; }
    if (limited((req.socket?.remoteAddress || "?") + ":tts")) { send(res, 429, { error: "rate-limited" }); return true; }
    let body = "";
    for await (const chunk of req) { body += chunk; if (body.length > 4000) break; }
    let j;
    try { j = JSON.parse(body); } catch { send(res, 400, { error: "bad-json" }); return true; }
    const voiceId = String(j.voiceId || "");
    const text = String(j.text || "").slice(0, 400);
    if (!/^[A-Za-z0-9]{16,32}$/.test(voiceId) || !text.trim()) { send(res, 400, { error: "bad-input" }); return true; }
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ text, model_id: "eleven_flash_v2_5" }),
      });
      if (!r.ok || !r.body) { send(res, 502, { error: "tts-failed" }); return true; }
      res.statusCode = 200;
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Cache-Control", "no-store");
      for await (const chunk of r.body) res.write(chunk);
      res.end();
    } catch (e) {
      send(res, 502, { error: "tts-failed", detail: String(e) });
    }
    return true;
  }

  send(res, 404, { error: "not-found" });
  return true;
}
