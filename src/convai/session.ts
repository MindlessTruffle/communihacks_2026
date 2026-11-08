// Thin wrapper around @elevenlabs/client for the game's agent chats.
// Mic mode = VoiceConversation (WebRTC). No-mic mode = TextConversation + /api/tts to voice replies in the character's voice.
import { Conversation, type MessagePayload, type TextConversation, type VoiceConversation } from "@elevenlabs/client";
import type { Gem } from "../game/types.ts";
import { getVoiceVolume, isReadAloud } from "../audio/audio.ts";

export type ChatMode = "mic" | "text";
export interface ChatHandlers {
  onLine(who: "npc" | "me", text: string): void;
  onKindness(trait: Gem, reason: string): void;
  onEmotion(e: string): void;
  onWantsEnd(): void;
  onStatus(s: "connecting" | "live" | "ended" | "error", detail?: string): void;
  onSpeaking(speaking: boolean): void;
}

type Session = TextConversation | VoiceConversation;

let healthCache: boolean | null = null;
export async function agentsAvailable(): Promise<boolean> {
  if (healthCache !== null) return healthCache;
  try {
    const r = await fetch("/api/health", { cache: "no-store" });
    healthCache = r.ok && (await r.json()).voiceAgents === true && navigator.onLine;
  } catch { healthCache = false; }
  return healthCache;
}

/** Agent replies can carry expressive audio tags like [warmly]; they are for the voice only, never for captions. */
export const stripTags = (t: string) => t.replace(/\[[^\]\n]{1,40}\]/g, "").replace(/\s{2,}/g, " ").trim();

export class AgentChat {
  private session: Session | null = null;
  private transcript: { who: "npc" | "me"; text: string }[] = [];
  mode: ChatMode = "text";
  /** why the last start() failed: "mic" (permission / device), "token", "connect" */
  lastFailure: "mic" | "token" | "connect" | null = null;
  private ttsAudio: HTMLAudioElement | null = null;
  private ttsUrl: string | null = null;
  private ending = false;
  private gen = 0; // bumped by stop(); a start() finishing after a stop() must not leave a live session (or open mic) behind

  constructor(private agent: string, private voiceId: string, private vars: Record<string, string>, private h: ChatHandlers) {}

  async start(mode: ChatMode, resume = false): Promise<boolean> {
    const g = ++this.gen;
    resume = resume && this.transcript.length > 0; // nothing said yet = the agent should still greet
    this.mode = mode;
    this.ending = false;
    this.lastFailure = null;
    this.h.onStatus("connecting");
    let stage: "token" | "connect" = "token";
    try {
      const r = await fetch(`/api/convai-token?agent=${encodeURIComponent(this.agent)}&mode=${mode}`, { cache: "no-store" });
      if (!r.ok) throw new Error("token " + r.status);
      const { token, signedUrl } = await r.json();
      if (!(mode === "mic" ? token : signedUrl)) throw new Error("no token");
      if (g !== this.gen) return false;
      stage = "connect";
      const tools = {
        award_kindness: (p: { trait: Gem; reason: string }) => { this.h.onKindness(p.trait, p.reason ?? ""); return "ok"; },
        npc_emotion: (p: { emotion: string }) => { this.h.onEmotion(p.emotion); return "ok"; },
        end_conversation: () => { this.h.onWantsEnd(); return "ok"; },
      };
      const onMessage = (m: MessagePayload) => {
        if (g !== this.gen) return;
        const who = (m as { role?: string }).role === "user" || m.source === "user" ? "me" : "npc";
        const raw = (m.message || "").trim();
        const text = stripTags(raw);
        if (!text) return;
        this.transcript.push({ who, text });
        this.h.onLine(who, text);
        // A live voice session already speaks for itself; only the text-only session needs /api/tts.
        if (who === "npc" && mode === "text") void this.voice(raw);
      };
      const common = {
        dynamicVariables: this.vars,
        clientTools: tools,
        onMessage,
        onError: (msg: string) => { console.warn("[convai]", msg); },
        onDisconnect: (d: { reason: string }) => {
          if (g !== this.gen || this.ending) return;
          this.session = null;
          // "agent" = the agent hung up / hit the time limit (a normal end); anything else = the connection dropped
          this.h.onStatus(d.reason === "agent" ? "ended" : "error", "disconnected");
        },
        onModeChange: (m: { mode: string }) => { if (g === this.gen) this.h.onSpeaking(m.mode === "speaking"); },
        overrides: resume ? { agent: { firstMessage: "" } } : undefined,
      };
      // (options cast: SDK option types are a deep union; the result type collapses with a cast arg, so re-type it)
      const started = (mode === "mic"
        ? await Conversation.startSession({ ...common, conversationToken: token as string, connectionType: "webrtc" } as never)
        : await Conversation.startSession({ ...common, signedUrl: signedUrl as string, connectionType: "websocket", textOnly: true, overrides: { ...(common.overrides ?? {}), conversation: { textOnly: true } } } as never)) as Session;
      if (g !== this.gen) { try { await started.endSession(); } catch { /* ignore */ } return false; }
      this.session = started;
      this.applyVolume();
      if (resume && this.transcript.length) {
        const recap = this.transcript.slice(-10).map((l) => `${l.who === "me" ? "Player" : "You"}: ${l.text}`).join("\n");
        started.sendContextualUpdate(`The chat is continuing (the player switched between microphone and typing). Conversation so far:\n${recap}\nContinue naturally from here; do not greet again.`);
      }
      this.h.onStatus("live");
      return true;
    } catch (e) {
      if (g !== this.gen) return false;
      const msg = (e as { name?: string })?.name + " " + String(e);
      this.lastFailure = stage === "token" ? "token" : mode === "mic" && /NotAllowed|NotFound|Permission|Security|microphone|getUserMedia/i.test(msg) ? "mic" : "connect";
      console.warn("[convai] start failed at", stage, String(e));
      return false;
    }
  }

  /** Voice volume follows the Options setting (read-aloud off = silent agent audio; captions still show). */
  applyVolume() {
    try { (this.session as VoiceConversation | null)?.setVolume?.({ volume: isReadAloud() ? getVoiceVolume() : 0 }); } catch { /* ignore */ }
  }

  /** Switch mic <-> no-mic. Returns the mode we actually ended up in. */
  async switchTo(mode: ChatMode): Promise<ChatMode> {
    if (mode === this.mode) return this.mode;
    const s = this.session;
    if (s && s.type === "voice") {
      // A live voice session stays up: no-mic just mutes the mic (the character keeps talking out loud).
      (s as VoiceConversation).setMicMuted(mode === "text");
      this.mode = mode;
      return this.mode;
    }
    await this.stop(true);
    if (!(await this.start(mode, true)) && mode === "mic") await this.start("text", true); // mic failed: stay in typing mode
    return this.mode;
  }

  send(text: string) {
    if (!this.session || !text.trim()) return;
    this.transcript.push({ who: "me", text });
    this.h.onLine("me", text);
    this.session.sendUserMessage(text);
  }

  // No-mic voicing: an agent reply often arrives as 2 messages; fetch them right away but play them one after the other.
  private ttsChain: Promise<void> = Promise.resolve();
  private ttsDone: (() => void) | null = null;
  private ttsPending = 0;
  private voice(text: string) {
    if (this.session?.type === "voice" || this.ending) return;
    if (!isReadAloud() || getVoiceVolume() <= 0) { this.h.onSpeaking(false); return; }
    const g = this.gen;
    this.ttsPending++;
    this.h.onSpeaking(true);
    const blob: Promise<Blob | null> = fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: this.voiceId, text }) })
      .then((r) => (r.ok ? r.blob() : null)).catch(() => null);
    this.ttsChain = this.ttsChain.then(async () => {
      const b = await blob;
      if (g !== this.gen) return;
      if (!b) { this.browserVoice(text); if (--this.ttsPending <= 0) this.h.onSpeaking(false); return; }
      const url = URL.createObjectURL(b);
      const a = new Audio(url);
      a.volume = Math.min(1, getVoiceVolume());
      this.ttsAudio = a; this.ttsUrl = url;
      await new Promise<void>((resolve) => {
        this.ttsDone = resolve;
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.play().catch(() => resolve());
      });
      this.ttsDone = null;
      URL.revokeObjectURL(url);
      if (this.ttsUrl === url) { this.ttsUrl = null; this.ttsAudio = null; }
      if (g === this.gen && --this.ttsPending <= 0) this.h.onSpeaking(false);
    }).catch(() => { this.ttsPending = 0; this.h.onSpeaking(false); });
  }

  private browserVoice(text: string) {
    try { const u = new SpeechSynthesisUtterance(stripTags(text)); u.volume = getVoiceVolume(); speechSynthesis.speak(u); } catch { /* ignore */ }
  }

  private stopTts() {
    this.ttsAudio?.pause();
    this.ttsAudio = null;
    this.ttsDone?.(); this.ttsDone = null;
    this.ttsPending = 0;
    if (this.ttsUrl) { URL.revokeObjectURL(this.ttsUrl); this.ttsUrl = null; }
  }

  async stop(switching = false) {
    this.gen++;
    this.ending = !switching;
    this.stopTts();
    try { speechSynthesis.cancel(); } catch { /* ignore */ }
    const s = this.session;
    this.session = null;
    this.h.onSpeaking(false);
    try { await s?.endSession(); } catch { /* ignore */ }
  }
}
