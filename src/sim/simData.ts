// Multiplayer simulation: scripted cast, votes and timings. Everything here is pure + seeded, so every replay is identical.
import { GUMMY_PROFILES } from "../characters/gummy/profiles.ts";
import { manifest, type AppearanceInput } from "../characters/gummy/appearance.ts";
import { CARD_BY_ID } from "../game/content/cards.ts";
import type { Effect } from "../game/types.ts";

export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SIM_SEED = 4821;
export const ROOM_CODE = "4821";
export const JOIN_URL = "royalconcerns.app/join";

// ------------------------------------------------------------------------------------------------ cast
export interface SimPlayer {
  id: string; name: string;
  /** fake model url: only its file name is used by the gummy profile lookup */
  url: string;
  color: string; // hex of the body colour (name tags, sticker rings)
}
type Spec = Partial<AppearanceInput> & { name: string };
// 10 unique colour+body pairs (6 colours x 2 bodies), then hats / glasses / faces / outfits on top.
const SPECS: Spec[] = [
  { name: "Ava", color: "red", body: "chubby", head: "cap", face: "smile", eyes: "cheerful", size: "small" },
  { name: "Ben", color: "blue", body: "tall", eyewear: "round", clothing: "collar", eyes: "oval", size: "large" },
  { name: "Chloe", color: "mint", body: "chubby", head: "beret", face: "freckles", eyes: "round" },
  { name: "Dev", color: "lavender", body: "tall", head: "wizard", eyes: "relaxed" },
  { name: "Ella", color: "orange", body: "chubby", head: "tuft", clothing: "apron", eyes: "cheerful", size: "small" },
  { name: "Finn", color: "yellow", body: "tall", eyewear: "square", face: "moustache", eyes: "oval" },
  { name: "Gia", color: "blue", body: "chubby", head: "cap", eyewear: "round", clothing: "belt", eyes: "round" },
  { name: "Hugo", color: "red", body: "tall", face: "moustache", clothing: "cape", eyes: "relaxed", size: "large" },
  { name: "Iris", color: "mint", body: "tall", head: "tuft", eyewear: "square", eyes: "round" },
  { name: "Jay", color: "lavender", body: "chubby", head: "beret", clothing: "collar", eyes: "cheerful", size: "large" },
];
export const PLAYERS: SimPlayer[] = SPECS.map(({ name, ...look }) => {
  const id = "sim-" + name.toLowerCase();
  GUMMY_PROFILES[id] = look; // the gummy renderer + portrait read their look from this table
  return { id, name, url: `/models/chars/${id}.glb`, color: manifest.colors[look.color as keyof typeof manifest.colors] };
});
export const N = PLAYERS.length;

// ------------------------------------------------------------------------------------------------ timeline
/** ALL pacing lives here (seconds). The sections are scripted against these numbers, so they are safe to tune. */
export const SIM_TIMING = {
  /** lobby: joins start at `joinFrom`, spaced `joinGap` (+ random up to `joinJitter`), ~4 s in total for ten players */
  joinFrom: 0.6, joinGap: 0.2, joinJitter: 0.4, startBeat: 0.9, startPressDelay: 0.9,
  /** court: visitors, time per visit, when voting opens, how long a player takes to decide (min..max after voting opens), verdict, leave */
  courtVisitors: 5, visitLen: 5.0, voteOpens: 0.9, decideMin: 0.8, decideMax: 2.8, verdictAt: 3.95, leaveAt: 4.5, courtLead: 0.3, courtTail: 0.2,
  street: 25,
  market: 25,
} as const;
export const VISIT_START = SIM_TIMING.courtLead;
export const VISIT_LEN = SIM_TIMING.visitLen;
export const VOTE_FROM = SIM_TIMING.voteOpens;
export const VERDICT_AT = SIM_TIMING.verdictAt;
export const LEAVE_AT = SIM_TIMING.leaveAt;
export const T = {
  lobby: 7.0,
  court: SIM_TIMING.courtLead + SIM_TIMING.courtVisitors * SIM_TIMING.visitLen + SIM_TIMING.courtTail,
  street: SIM_TIMING.street,
  market: SIM_TIMING.market,
} as const;

/** Lobby: when each player joins (seconds), in the order they appear. Staggered + jittered over ~4 s. */
export const JOIN_ORDER: number[] = (() => {
  const r = mulberry(SIM_SEED + 1);
  const order = PLAYERS.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return order;
})();
export const JOIN_AT: number[] = (() => {
  const r = mulberry(SIM_SEED + 2);
  let t = SIM_TIMING.joinFrom;
  return JOIN_ORDER.map(() => { const at = t; t += SIM_TIMING.joinGap + r() * SIM_TIMING.joinJitter; return at; });
})();
export const LOBBY_READY_AT = JOIN_AT[N - 1] + 0.7;
export const LOBBY_PRESS_AT = LOBBY_READY_AT + SIM_TIMING.startPressDelay;

// ------------------------------------------------------------------------------------------------ court

export interface Visit {
  cardId: string; who: string; ask: string; yesLine: string; noLine: string; yesLabel: string; noLabel: string;
  votes: ("yes" | "no")[]; /** final vote time (s since visit start) per player */ at: number[];
  /** players who first tap the other answer, then change their mind: [player, time of the first tap] (the final tap is `at`) */
  flips: [number, number][];
  yes: number; no: number; choice: "yes" | "no";
  delta: { gold: number; happiness: number; people: number };
}

function applyEffects(list: Effect[], into: { gold: number; happiness: number; people: number }) {
  for (const e of list) {
    if (e.t === "stat") into[e.key] += e.n;
    else if (e.t === "chance") applyEffects(e.p >= 0.5 ? e.then : e.else ?? [], into);
  }
}

// [card, how many of the ten vote Yes]
const SCRIPT: [string, number][] = [["pip_checkup", 8], ["fen_prize", 2], ["rosa_lost_purse", 6], ["boo_candy", 4], ["fen_caught", 9]];
export const VISITS: Visit[] = SCRIPT.map(([cardId, yesCount], k) => {
  const card = CARD_BY_ID[cardId];
  const r = mulberry(SIM_SEED + 10 + k);
  // everyone has a mood; the lowest `yesCount` draws vote Yes. Different players split off on different cards.
  const draw = PLAYERS.map((_, i) => ({ i, v: r() }));
  const yesSet = new Set([...draw].sort((a, b) => a.v - b.v).slice(0, yesCount).map((d) => d.i));
  const votes = PLAYERS.map((_, i) => (yesSet.has(i) ? "yes" : "no")) as ("yes" | "no")[];
  // staggered, plausible timing: a few quick tappers, a few thinkers
  const order = PLAYERS.map((_, i) => ({ i, v: r() })).sort((a, b) => a.v - b.v).map((d) => d.i);
  const at = new Array<number>(N);
  // players take 1-4 s to decide, in a random order; two per card hesitate and change their mind
  const { decideMin, decideMax } = SIM_TIMING;
  order.forEach((p) => { at[p] = VOTE_FROM + decideMin + r() * (decideMax - decideMin); });
  const flips: [number, number][] = order.slice(0, 2).map((p) => [p, Math.max(VOTE_FROM + 0.2, at[p] - 0.9 - r() * 0.5)] as [number, number]).filter(([p]) => at[p] > VOTE_FROM + 1.1);
  const choice = yesCount * 2 > N ? "yes" : "no";
  const delta = { gold: 0, happiness: 0, people: 0 };
  if (choice === "yes") { delta.gold -= card.cost ?? 0; applyEffects(card.yes, delta); } else applyEffects(card.no, delta);
  return {
    cardId, who: card.who, ask: card.ask, yesLine: card.yesLine, noLine: card.noLine,
    yesLabel: card.yesLabel ?? "Yes", noLabel: card.noLabel ?? "No",
    votes, at, flips, yes: yesCount, no: N - yesCount, choice, delta,
  };
});

export const START_STATS = { gold: 200, happiness: 60, people: 100 };

// ------------------------------------------------------------------------------------------------ street / market savings
export const STREET_COINS = 4; // per player that tried a minigame door
export const STREET_DOOR_PLAYERS = [1, 4, 8];
/** Gold each player saves at the till (some got tempted, so they save a bit less). */
export const MARKET_SAVE: number[] = PLAYERS.map((_, i) => 6 + ((i * 5 + 3) % 5) - ([3, 7].includes(i) ? 3 : 0));
