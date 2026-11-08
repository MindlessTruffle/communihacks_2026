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

export class AgentChat {
  private session: Session | null = null;
  private transcript: { who: "npc" | "me"; text: string }[] = [];
  mode: ChatMode = "text";
  private ttsAudio: HTMLAudioElement | null = null;
  private ending = false;

  constructor(private agent: string, private voiceId: string, private vars: Record<string, string>, private h: ChatHandlers) {}

  async start(mode: ChatMode, resume = false): Promise<boolean> {
    this.mode = mode;
    this.h.onStatus("connecting");
    try {
      const r = await fetch(`/api/convai-token?agent=${encodeURIComponent(this.agent)}`, { cache: "no-store" });
      if (!r.ok) throw new Error("token " + r.status);
      const { token } = await r.json();
      const tools = {
        award_kindness: (p: { trait: Gem; reason: string }) => { this.h.onKindness(p.trait, p.reason ?? ""); return "ok"; },
        npc_emotion: (p: { emotion: string }) => { this.h.onEmotion(p.emotion); return "ok"; },
        end_conversation: () => { this.h.onWantsEnd(); return "ok"; },
      };
      const onMessage = (m: MessagePayload) => {
        const who = (m as { role?: string }).role === "user" || m.source === "user" ? "me" : "npc";
        const text = (m.message || "").trim();
        if (!text) return;
        this.transcript.push({ who, text });
        this.h.onLine(who, text);
        if (who === "npc" && this.mode === "text") this.voice(text);
      };
      const common = {
        conversationToken: token as string,
        dynamicVariables: this.vars,
        clientTools: tools,
        onMessage,
        onError: (msg: string) => this.h.onStatus("error", msg),
        onDisconnect: () => { if (!this.ending) this.h.onStatus("ended"); },
        onModeChange: (m: { mode: string }) => this.h.onSpeaking(m.mode === "speaking"),
        overrides: resume ? { agent: { firstMessage: "" } } : undefined,
      };
      // (options cast: SDK option types are a deep union; the result type collapses with a cast arg, so re-type it)
      const started = (mode === "mic"
        ? await Conversation.startSession({ ...common, connectionType: "webrtc" } as never)
        : await Conversation.startSession({ ...common, textOnly: true, overrides: { ...(common.overrides ?? {}), conversation: { textOnly: true } } } as never)) as Session;
      this.session = started;
      try { (started as VoiceConversation).setVolume?.({ volume: isReadAloud() ? getVoiceVolume() : 0 }); } catch { /* ignore */ }
      if (resume && this.transcript.length) {
        const recap = this.transcript.slice(-10).map((l) => `${l.who === "me" ? "Player" : "You"}: ${l.text}`).join("\n");
        started.sendContextualUpdate(`The chat is continuing (the player switched between microphone and typing). Conversation so far:\n${recap}\nContinue naturally from here; do not greet again.`);
      }
      this.h.onStatus("live");
      return true;
    } catch (e) {
      this.h.onStatus("error", String(e));
      return false;
    }
  }

  /** Switch mic ↔ no-mic. In mic mode we can just mute; switching to mic from text restarts as a voice session. */
  async switchTo(mode: ChatMode) {
    if (mode === this.mode) return;
    if (this.session && this.mode === "mic" && mode === "text") {
      // keep the live voice session, just mute the mic: the NPC still talks out loud
      this.session.setMicMuted(true);
      this.mode = "text";
      return;
    }
    if (this.session && this.session.type === "voice" && mode === "mic") {
      this.session.setMicMuted(false);
      this.mode = "mic";
      return;
    }
    await this.stop(true);
    await this.start(mode, true);
  }

  send(text: string) {
    if (!this.session || !text.trim()) return;
    this.transcript.push({ who: "me", text });
    this.h.onLine("me", text);
    this.session.sendUserMessage(text);
  }

  private async voice(text: string) {
    try {
      this.ttsAudio?.pause();
      if (!isReadAloud() || getVoiceVolume() <= 0) { this.h.onSpeaking(false); return; }
      this.h.onSpeaking(true);
      const r = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voiceId: this.voiceId, text }) });
      if (!r.ok) throw new Error("tts");
      const url = URL.createObjectURL(await r.blob());
      const a = new Audio(url);
      a.volume = Math.min(1, getVoiceVolume());
      this.ttsAudio = a;
      a.onended = () => { this.h.onSpeaking(false); URL.revokeObjectURL(url); };
      await a.play();
    } catch {
      this.h.onSpeaking(false);
      try { const u = new SpeechSynthesisUtterance(text); u.volume = getVoiceVolume(); speechSynthesis.speak(u); } catch { /* ignore */ }
    }
  }

  async stop(switching = false) {
    this.ending = !switching;
    this.ttsAudio?.pause();
    const s = this.session;
    this.session = null;
    try { await s?.endSession(); } catch { /* ignore */ }
  }
}
