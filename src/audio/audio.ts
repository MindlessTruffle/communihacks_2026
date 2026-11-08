// Audio: SFX (Kenney), music loops (ElevenLabs Music or none), character voices (baked ElevenLabs TTS → speechSynthesis fallback).
import { Howl, Howler } from "howler";
import { voiceKey } from "./voicekey.ts";
import { CHARACTERS, NARRATOR_VOICE } from "../game/content/characters.ts";

const K = "/audio/kenney";
const SFX: Record<string, string[]> = {
  click: [`${K}/interface-sounds/click_002.ogg`],
  tap: [`${K}/interface-sounds/select_002.ogg`],
  yes: [`${K}/interface-sounds/confirmation_001.ogg`],
  no: [`${K}/interface-sounds/minimize_003.ogg`],
  coinIn: [`${K}/rpg-audio/handleCoins.ogg`],
  coinOut: [`${K}/rpg-audio/handleCoins2.ogg`],
  good: [`${K}/interface-sounds/confirmation_002.ogg`],
  hmm: [`${K}/interface-sounds/question_002.ogg`],
  door: [`${K}/rpg-audio/doorOpen_1.ogg`],
  doorClose: [`${K}/rpg-audio/doorClose_2.ogg`],
  page: [`${K}/rpg-audio/bookFlip2.ogg`],
  scroll: [`${K}/rpg-audio/bookOpen.ogg`],
  sparkle: [`${K}/interface-sounds/maximize_006.ogg`],
  pop: [`${K}/interface-sounds/drop_002.ogg`],
  step: [0, 1, 2, 3, 4, 5].map((i) => `${K}/rpg-audio/footstep0${i}.ogg`),
  basket: [`${K}/rpg-audio/dropLeather.ogg`],
  stamp: [`${K}/rpg-audio/bookPlace1.ogg`],
  pen: [1, 2, 3].map((i) => `${K}/rpg-audio/drawKnife${i}.ogg`), // scratchy quill stroke (played quiet + sped up)
  whoosh: [`${K}/rpg-audio/cloth3.ogg`],
  dayDone: [`${K}/music-jingles/Pizzicato jingles/jingles_PIZZI01.ogg`],
  unlock: [`${K}/music-jingles/Pizzicato jingles/jingles_PIZZI10.ogg`],
  fanfare: [`${K}/music-jingles/Pizzicato jingles/jingles_PIZZI05.ogg`],
  growth: [`${K}/music-jingles/Pizzicato jingles/jingles_PIZZI07.ogg`],
  softSad: [`${K}/music-jingles/Pizzicato jingles/jingles_PIZZI14.ogg`],
  stars: [`${K}/music-jingles/Steel jingles/jingles_STEEL00.ogg`],
  // intro / doodle tutorial (src/ui/Intro.tsx)
  scribble: [1, 3, 5].map((i) => `${K}/interface-sounds/scratch_00${i}.ogg`),
  boing: [`${K}/interface-sounds/pluck_002.ogg`],
  tick: [`${K}/interface-sounds/select_001.ogg`],
  // scroll tutorial (Intro.tsx)
  scrollOpen: [`${K}/rpg-audio/clothBelt.ogg`],
  scrollWind: [`${K}/rpg-audio/cloth2.ogg`],
  scrollClose: [`${K}/rpg-audio/clothBelt2.ogg`],
  woodThunk: [`${K}/rpg-audio/bookPlace2.ogg`],
};

const cache = new Map<string, Howl>();
let vol = { music: 0.5, sfx: 0.8, voice: 1 };
let readAloud = true;
let unlocked = false;

/** Effective volumes = category * master. */
export function setVolumes(v: { music: number; sfx: number; voice: number; master?: number; readAloud?: boolean }) {
  const m = v.master ?? 1;
  vol = { music: v.music * m, sfx: v.sfx * m, voice: v.voice * m };
  if (v.readAloud !== undefined) readAloud = v.readAloud;
  if (music) music.volume(vol.music * 0.6);
  if (currentVoice) currentVoice.volume(vol.voice);
}
export const getVoiceVolume = () => vol.voice;
export const isReadAloud = () => readAloud;

// ------------------------------------------------------------------ captions bus (subtitles for voiced lines)
export interface Caption { id: number; who: string | null; text: string; ms: number }
type CapFn = (c: Caption | null) => void;
const capSubs = new Set<CapFn>();
let capId = 0;
export function onCaption(fn: CapFn) { capSubs.add(fn); return () => { capSubs.delete(fn); }; }
function caption(who: string | null, text: string) {
  if (!text) return;
  const c = { id: ++capId, who, text, ms: Math.max(3500, text.length * 75) };
  capSubs.forEach((f) => f(c));
}

export function unlockAudio() {
  if (unlocked) return;
  unlocked = true;
  try { Howler.ctx?.resume(); } catch { /* ignore */ }
}
/** Pause/resume all audio (pause menu, tab hidden). */
export function suspendAudio(on: boolean) {
  try { Howler.mute(on); if (on) speechSynthesis.pause(); else speechSynthesis.resume(); } catch { /* ignore */ }
}

function howl(src: string, loop = false): Howl {
  let h = cache.get(src);
  if (!h) { h = new Howl({ src: [src], loop, preload: true, html5: false }); cache.set(src, h); }
  return h;
}

export function sfx(name: keyof typeof SFX | string, opts: { rate?: number; volume?: number } = {}) {
  const list = SFX[name];
  if (!list || vol.sfx <= 0) return;
  const h = howl(list[Math.floor(Math.random() * list.length)]);
  const id = h.play();
  h.volume((opts.volume ?? 1) * vol.sfx, id);
  if (opts.rate) h.rate(opts.rate, id);
}

export function preloadSfx() { Object.values(SFX).flat().forEach((s) => howl(s)); }

// ------------------------------------------------------------------ music
let music: Howl | null = null;
let musicName = "";
let musicIndex: string[] | null = null;

async function musicAvailable(): Promise<string[]> {
  if (musicIndex) return musicIndex;
  try { musicIndex = await (await fetch("/audio/music/index.json")).json(); } catch { musicIndex = []; }
  return musicIndex!;
}

/** Name of the music loop currently requested (so the multiplayer simulation can hand it back on exit). */
export const currentMusic = () => musicName;

export async function playMusic(name: string) {
  if (name === musicName) return;
  musicName = name;
  const list = await musicAvailable();
  const old = music;
  if (old) { old.fade(old.volume(), 0, 800); setTimeout(() => old.stop(), 850); }
  music = null;
  if (!list.includes(name)) return;
  const h = new Howl({ src: [`/audio/music/${name}.mp3`], loop: true, html5: true, volume: 0 });
  music = h;
  h.play();
  h.fade(0, vol.music * 0.6, 1200);
}

// ------------------------------------------------------------------ voices
let voiceIndex: Set<string> | null = null;
let currentVoice: Howl | null = null;
let speakToken = 0;

async function loadVoiceIndex() {
  if (voiceIndex) return voiceIndex;
  try { voiceIndex = new Set(await (await fetch("/audio/voices/index.json")).json()); } catch { voiceIndex = new Set(); }
  return voiceIndex;
}
loadVoiceIndex();

export function stopVoice() {
  speakToken++;
  currentVoice?.stop();
  currentVoice = null;
  try { speechSynthesis.cancel(); } catch { /* ignore */ }
}

/**
 * Speak a line as a character. Uses the baked ElevenLabs file if present, otherwise the browser voice.
 * Resolves when finished (or immediately if muted).
 */
export async function speak(charId: string | null, text: string, opts: { fallbackTTS?: boolean; caption?: boolean } = {}): Promise<void> {
  stopVoice();
  const token = speakToken;
  if (!text) return;
  if (opts.caption !== false) caption(charId, text);
  if (vol.voice <= 0 || !readAloud) return;
  const voiceId = charId ? CHARACTERS[charId]?.voiceId ?? NARRATOR_VOICE : NARRATOR_VOICE;
  const idx = await loadVoiceIndex();
  if (token !== speakToken) return;
  const key = voiceKey(voiceId, text);
  if (idx.has(key)) {
    return new Promise((resolve) => {
      const h = new Howl({ src: [`/audio/voices/${key}.mp3`], volume: vol.voice, html5: false });
      currentVoice = h;
      h.once("end", () => resolve());
      h.once("loaderror", () => resolve());
      h.once("stop", () => resolve());
      h.play();
    });
  }
  if (opts.fallbackTTS === false) return;
  return browserSpeak(text, token);
}

function browserSpeak(text: string, token: number): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!("speechSynthesis" in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text.replace(/[✓✗]/g, ""));
      u.rate = 0.95; u.volume = vol.voice;
      const en = speechSynthesis.getVoices().find((v) => v.lang.startsWith("en"));
      if (en) u.voice = en;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      if (token !== speakToken) return resolve();
      speechSynthesis.speak(u);
    } catch { resolve(); }
  });
}

/** Tiny "voice blip" gibberish for characters when read-aloud is off (Sort the Court feel). */
export function blip(charId: string) {
  const pitch = 0.8 + ((charId.charCodeAt(0) * 37 + charId.length * 11) % 60) / 100;
  sfx("tap", { rate: pitch, volume: 0.5 });
}
