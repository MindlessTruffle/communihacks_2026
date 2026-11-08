// Zustand store: wraps the pure sim, owns the phase machine, transient UI state and save/load.
import { create } from "zustand";
import type { Gem, Phase, RunState } from "./types.ts";
import * as sim from "./sim/sim.ts";
import { CHARACTERS } from "./content/characters.ts";
import { MARKET_BY_ID, UNLOCKS } from "./content/economy.ts";

export interface Settings {
  readAloud: boolean;
  textScale: number; // 1 | 1.15 | 1.3
  highContrast: boolean;
  reduceMotion: boolean;
  music: number;
  sfx: number;
  voice: number;
  aiChat: boolean;
  dyslexiaFont: boolean;
  /** Show captions for every voiced line (even when the sound is off). */
  subtitles: boolean;
  /** Colour-blind-safe palette + shape cues (arrows) for good/bad. */
  colorBlind: boolean;
  /** "hold": hold the screen to walk. "tap": tap once to start walking, tap again to stop. */
  walkMode: "hold" | "tap";
  /** Animation / walking speed multiplier. There are NO timers in the game at any speed. */
  gameSpeed: number;
  master: number;
}

/** Data for the budget-win cutscene (real checkout or admin demo). */
export interface WinData {
  list: string[]; basket: string[]; budget: number; spent: number; saved: number; bonus: number; streak: number; stars: number;
  goldBefore: number; goldAfter: number; demo?: boolean; returnTo?: Phase;
}

export type CourtStep = "enter" | "ask" | "reply" | "advisor" | "leave" | "done";
export type ConvoMode = "advisor" | "npc" | "review";

export interface ConvoState { npc: string; agent: string; mode: ConvoMode; }

interface Store {
  phase: Phase;
  run: RunState | null;
  settings: Settings;
  // court
  courtStep: CourtStep;
  outcome: (sim.Outcome & { cardId: string; choice: "yes" | "no" }) | null;
  morning: { lines: sim.MorningLine[]; newUnlocks: string[] } | null;
  unlockIntro: string | null; // unlock id being presented
  treasuryOpen: boolean;
  // street
  street: { done: string[]; npcs: string[]; games: string[] };
  convo: ConvoState | null;
  minigame: string | null;
  // market
  market: { list: string[]; budget: number; basket: string[]; result: sim.MarketResult | null };
  // reign
  report: sim.ReignReport | null;
  win: WinData | null;
  // fx bus (UI reacts to these)
  fx: { id: number; kind: string; data?: unknown } | null;
  adminOpen: boolean;
  previewRuler: string | null;

  // actions
  setSettings(p: Partial<Settings>): void;
  resetSettings(): void;
  quitToTitle(): void;
  emit(kind: string, data?: unknown): void;
  newGame(o: { title: RunState["rulerTitle"]; model: string; name: string }): void;
  continueGame(): void;
  goto(p: Phase): void;
  beginDay(): void;
  closeMorning(): void;
  dismissUnlock(): void;
  setTreasury(open: boolean): void;
  treasury(a: sim.TreasuryAction): { ok: boolean; msg?: string };
  setCourtStep(s: CourtStep): void;
  decide(choice: "yes" | "no"): void;
  afterReply(): void;
  afterAdvisor(): void;
  visitorLeft(): void;
  endCourt(): void;
  startEvening(): void;
  openConvo(c: ConvoState): void;
  closeConvo(): void;
  kindness(gem: Gem): void;
  openMinigame(id: string | null): void;
  finishMinigame(id: string, gold: number): void;
  toBudget(): void;
  setList(list: string[], budget: number): void;
  enterMarket(): void;
  addToBasket(id: string): void;
  removeFromBasket(id: string): void;
  checkout(): void;
  endWin(): void;
  playWinDemo(): void;
  sleep(): void;
  loseNow(reason?: string): void;
  finishReview(): void;
  admin(open: boolean): void;
  setPreviewRuler(id: string | null): void;
  adminCmd(cmd: string, n?: number): void;
}

const SAVE_KEY = "royal-concerns-save-v1";
const SETTINGS_KEY = "royal-concerns-settings-v1";

export const defaultSettings: Settings = {
  readAloud: true, textScale: 1, highContrast: false, reduceMotion: false,
  music: 0.5, sfx: 0.8, voice: 1, aiChat: true, dyslexiaFont: false,
  subtitles: true, colorBlind: false, walkMode: "hold", gameSpeed: 1, master: 1,
};

function loadSettings(): Settings {
  try {
    const s = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") } as Settings;
    // OS-level preferences are the starting point on first run.
    if (!localStorage.getItem(SETTINGS_KEY)) {
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) s.reduceMotion = true;
      if (window.matchMedia?.("(prefers-contrast: more)").matches) s.highContrast = true;
    }
    return s;
  } catch { return { ...defaultSettings }; }
}
export function loadSave(): { run: RunState; phase: Phase } | null {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || "null"); return s?.run ? s : null; } catch { return null; }
}
function save(run: RunState | null, phase: Phase) {
  try {
    if (!run) localStorage.removeItem(SAVE_KEY);
    else localStorage.setItem(SAVE_KEY, JSON.stringify({ run, phase }));
  } catch { /* storage blocked: game still works this session */ }
}

let fxId = 0;
let demoRuns = 0; // admin cutscene demo alternates the normal and the 3-star (perfect) version

/** Pick tonight's street NPCs (always advisor first, then 2 townsfolk). */
function pickNpcs(run: RunState): string[] {
  const pool = ["rosa", "benny", "maya", "hazel", "clank", "kid", "bill", "zib"];
  const r = sim.rng(run.seed ^ (run.day * 31337));
  const a = pool.splice(Math.floor(r() * pool.length), 1)[0];
  const b = pool.splice(Math.floor(r() * pool.length), 1)[0];
  return ["advisor", a, b];
}

export const useGame = create<Store>((set, get) => ({
  phase: "title",
  run: null,
  settings: loadSettings(),
  courtStep: "enter",
  outcome: null,
  morning: null,
  unlockIntro: null,
  treasuryOpen: false,
  street: { done: [], npcs: [], games: [] },
  convo: null,
  minigame: null,
  market: { list: [], budget: 0, basket: [], result: null },
  report: null,
  win: null,
  fx: null,
  adminOpen: false,
  previewRuler: null,

  setSettings(p) {
    const settings = { ...get().settings, ...p };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
    set({ settings });
  },
  resetSettings() {
    try { localStorage.removeItem(SETTINGS_KEY); } catch { /* ignore */ }
    set({ settings: { ...defaultSettings } });
  },
  /** Leave to the title screen without touching the save (every step already saves). */
  quitToTitle() {
    set({ phase: "title", convo: null, minigame: null, adminOpen: false, treasuryOpen: false, previewRuler: null });
  },
  emit(kind, data) { set({ fx: { id: ++fxId, kind, data } }); },

  newGame(o) {
    const run = sim.newRun({ title: o.title, model: o.model, name: o.name });
    set({ run, report: null });
    get().beginDay();
  },
  continueGame() {
    const s = loadSave();
    if (!s) return;
    const resume: Phase = s.phase === "court" || s.phase === "morning" ? s.phase : s.phase === "summary" ? "summary" : "street";
    set({ run: s.run, phase: resume, courtStep: "enter", outcome: null, morning: s.phase === "morning" ? { lines: [], newUnlocks: [] } : null });
    if (resume === "street") get().startEvening();
  },
  goto(p) {
    set({ phase: p });
    // Never touch the save when there is no live reign (title -> setup would otherwise erase "Continue"),
    // and never persist a finished reign.
    const run = get().run;
    if (run && !run.lost && p !== "title" && p !== "setup" && p !== "reign-end") save(run, p);
  },

  beginDay() {
    const run = get().run!;
    const { state, lines, newUnlocks } = sim.startDay(run);
    set({ run: state, morning: { lines, newUnlocks }, phase: "morning", courtStep: "enter", outcome: null,
      unlockIntro: newUnlocks[0] ?? null, treasuryOpen: false,
      market: { list: [], budget: 0, basket: [], result: null } });
    save(state, "morning");
  },
  closeMorning() {
    set({ morning: null, treasuryOpen: false, phase: "court", courtStep: "enter" });
    save(get().run, "court");
  },
  dismissUnlock() {
    const run = get().run!;
    const id = get().unlockIntro;
    if (!id) return;
    const seen = [...run.unlocksSeen, id];
    const next = UNLOCKS.find((u) => u.day <= run.day && !seen.includes(u.id));
    set({ run: { ...run, unlocksSeen: seen }, unlockIntro: next?.id ?? null, treasuryOpen: !next });
  },
  setTreasury(open) { set({ treasuryOpen: open }); },
  treasury(a) {
    const r = sim.treasury(get().run!, a);
    if (r.ok) { set({ run: r.state }); save(r.state, get().phase); }
    return { ok: r.ok, msg: r.msg };
  },

  setCourtStep(courtStep) { set({ courtStep }); },
  decide(choice) {
    const run = get().run!;
    const card = sim.currentCard(run);
    if (!card || get().courtStep !== "ask") return;
    const { state, outcome } = sim.decide(run, choice);
    set({ run: state, outcome: { ...outcome, cardId: card.id, choice }, courtStep: "reply" });
    get().emit("decision", { choice, outcome });
    save(state, "court");
  },
  afterReply() {
    const o = get().outcome;
    set({ courtStep: o?.lesson ? "advisor" : "leave" });
  },
  afterAdvisor() { set({ courtStep: "leave" }); },
  visitorLeft() {
    const run = get().run!;
    set({ outcome: null, courtStep: sim.currentCard(run) ? "enter" : "done" });
  },
  endCourt() { set({ phase: "summary" }); save(get().run, "summary"); },

  startEvening() {
    const run = get().run!;
    set({ phase: "street", street: { done: [], npcs: pickNpcs(run), games: [] }, convo: null, minigame: null });
    save(run, "street");
  },
  openConvo(c) { set({ convo: c }); },
  closeConvo() {
    const c = get().convo;
    if (!c) return;
    if (c.mode === "review") { set({ convo: null }); get().finishReview(); return; }
    set((st) => ({ convo: null, street: { ...st.street, done: [...st.street.done, c.npc] } }));
  },
  kindness(gem) {
    const run = get().run;
    if (!run) return;
    set({ run: sim.addKindness(run, gem) });
    get().emit("kindness", gem);
  },
  openMinigame(id) { set({ minigame: id }); },
  finishMinigame(id, gold) {
    const run = get().run!;
    const next = { ...run, gold: run.gold + gold };
    set((st) => ({ minigame: null, run: next, street: { ...st.street, games: [...st.street.games, id] } }));
    save(next, "street");
    if (gold > 0) get().emit("coins", gold);
  },

  toBudget() {
    const run = get().run!;
    const needs = sim.needsFor(run);
    const budget = needs.reduce((a, n) => a + (MARKET_BY_ID[n]?.price ?? 0), 0) + 4;
    set({ phase: "budget", market: { list: needs, budget, basket: [], result: null } });
    save(run, "street");
  },
  setList(list, budget) { set((st) => ({ market: { ...st.market, list, budget } })); },
  enterMarket() { set({ phase: "market" }); },
  addToBasket(id) { set((st) => ({ market: { ...st.market, basket: [...st.market.basket, id] } })); get().emit("basket", id); },
  removeFromBasket(id) {
    set((st) => { const b = [...st.market.basket]; const i = b.lastIndexOf(id); if (i >= 0) b.splice(i, 1); return { market: { ...st.market, basket: b } }; });
  },
  checkout() {
    const { run, market } = get();
    if (get().phase !== "market" || market.result) return; // never apply the market twice
    const { state, result } = sim.applyMarket(run!, market.basket, market.list, market.budget);
    // A budget win plays the cutscene first (MarketUI shows it while phase === "checkout"), then the normal checkout card.
    const win: WinData | null = result.budgetWin ? {
      list: market.list, basket: market.basket, budget: market.budget, spent: result.spent, saved: result.saved,
      bonus: result.bonus, streak: result.streak, stars: result.stars, goldBefore: state.gold - result.bonus, goldAfter: state.gold,
    } : null;
    set({ run: state, market: { ...market, result }, phase: "checkout", win });
  },
  endWin() {
    const w = get().win;
    if (!w) return;
    if (w.demo) {
      // admin demo: put everything back the way it was, nothing was really bought
      set({ win: null, phase: w.returnTo ?? "street", market: { list: [], budget: 0, basket: [], result: null } });
      return;
    }
    set({ win: null });
  },
  /** Admin: play the cutscene right now with a plausible fake basket (does not touch gold or gems). */
  playWinDemo() {
    const run = get().run;
    const list = ["bread", "milk", "carrots", "apples", "candles"];
    const spent = list.reduce((a, id) => a + (MARKET_BY_ID[id]?.price ?? 0), 0);
    const budget = spent + 4, saved = 4;
    const gold = run?.gold ?? 40;
    const bonus = Math.max(sim.SAVINGS_BONUS_MIN, Math.ceil(saved / 2));
    const prev = get().phase;
    set({ adminOpen: false, phase: "checkout", market: { list, budget, basket: list, result: null },
      win: { list, basket: list, budget, spent, saved, bonus, streak: 3, stars: (demoRuns++ % 2) ? 3 : 2, goldBefore: gold, goldAfter: gold + bonus, demo: true,
        returnTo: prev === "market" || prev === "checkout" ? "street" : prev } });
  },
  sleep() {
    const run = sim.endDay(get().run!);
    set({ run });
    if (run.lost) { get().loseNow(run.lossReason); return; }
    get().beginDay();
  },

  loseNow(reason) {
    let run = get().run!;
    if (!run.lost) run = sim.forceLoss(run, reason ?? "The kingdom needs a rest.");
    const report = sim.reignReport(run);
    set({ run, report, phase: "reign-review", convo: { npc: "advisor", agent: "advisor_review", mode: "review" },
      minigame: null, adminOpen: false, treasuryOpen: false, morning: null });
    save(null, "title");
  },
  finishReview() { set({ phase: "reign-end", convo: null }); },

  admin(open) { set({ adminOpen: open }); },
  setPreviewRuler(id) { set({ previewRuler: id }); },
  adminCmd(cmd, n = 0) {
    const run = get().run;
    if (!run) return;
    const up = (r: RunState) => { set({ run: r }); save(r, get().phase); };
    switch (cmd) {
      case "lose": get().loseNow("The kingdom needs a rest. (admin)"); break;
      case "gold": up({ ...run, gold: run.gold + n }); break;
      case "happy": up({ ...run, happiness: Math.max(-10, Math.min(100, run.happiness + n)) }); break;
      case "people": up({ ...run, people: Math.max(0, run.people + n) }); break;
      case "day": up({ ...run, day: Math.max(0, run.day + n) }); break;
      case "skipCourt": up({ ...run, queue: [] }); set({ courtStep: "done", outcome: null, phase: "court" }); break;
      case "toStreet": get().startEvening(); break;
      case "toMarket": get().toBudget(); break;
      case "nextDay": get().sleep(); break;
    }
  },
}));

export const charName = (id: string) => CHARACTERS[id]?.name ?? id;
