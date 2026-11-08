// Core data types. Content files (src/game/content/*) are plain data built from these.
// The simulation (src/game/sim/*) is pure TS with no rendering, so it can run in Node (tools/economy-sim.ts).

export type StatKey = "people" | "happiness" | "gold";
export type Gem = "trustworthy" | "respect" | "responsibility" | "fairness" | "caring" | "citizenship";
export const GEMS: Gem[] = ["trustworthy", "respect", "responsibility", "fairness", "caring", "citizenship"];

export type Concept =
  | "needs-wants" | "bills" | "subscriptions" | "scams" | "phishing" | "lending" | "emergency-fund"
  | "saving-goal" | "compare-prices" | "impulse" | "investing" | "insurance" | "giving" | "quality"
  | "high-interest" | "peer-pressure" | "income" | "kindness" | "planning" | "privacy" | "honesty";

export type ItemId = string;
export type CharId = string;

export type Effect =
  | { t: "stat"; key: StatKey; n: number }
  | { t: "gem"; gem: Gem; n: number }
  | { t: "flag"; flag: string; value?: boolean }
  | { t: "item"; item: ItemId; n: number }
  | { t: "schedule"; card: string; inDays: number }
  | { t: "recurring"; id: string; label: string; gold: number; everyDays: number }
  | { t: "cancelRecurring"; id: string }
  | { t: "chance"; p: number; then: Effect[]; else?: Effect[] }
  | { t: "ifFlag"; flag: string; then: Effect[]; else?: Effect[] };

export interface Lesson {
  concept: Concept;
  /** Which answer is the "wise" one. "either" = no right answer, just a reflection. */
  good: "yes" | "no" | "either";
  /** Advisor line when the player picked the wise answer. */
  praise: string;
  /** Advisor line when the player picked the other answer. Gentle, never shaming. */
  coach: string;
  /** One-sentence real-life link. */
  realLife: string;
}

export interface Card {
  id: string;
  who: CharId;
  /** Earliest day this can be drawn. */
  minDay?: number;
  maxDay?: number;
  /** Draw weight for random cards (default 1). 0 = only via schedule/forced. */
  weight?: number;
  /** Can show more than once per reign (default false). */
  repeat?: boolean;
  requires?: { flag?: string; notFlag?: string; item?: ItemId; unlock?: string; minPeople?: number };
  ask: string;
  yesLine: string;
  noLine: string;
  /** Gold paid on Yes. */
  cost?: number;
  /** Item that lets you say yes for free instead of paying. */
  orItem?: ItemId;
  yes: Effect[];
  no: Effect[];
  lesson?: Lesson;
  /** Short labels shown on the choice buttons instead of plain Yes / No. */
  yesLabel?: string;
  noLabel?: string;
}

export interface Character {
  id: CharId;
  name: string;
  /** Kenney model path relative to /kenney or /models. */
  model: string;
  /** Optional accessory model (cane, wheelchair, glasses...). */
  aid?: string;
  /** Name colour in the speech panel. */
  color: string;
  voiceId: string;
  /** Short personality for agents + voice direction. */
  bio: string;
  scale?: number;
}

export interface Item {
  id: ItemId;
  name: string;
  icon: string; // emoji fallback for UI chips
  model: string;
}

export interface MarketItem {
  id: string;
  name: string;
  model: string;
  price: number;
  kind: "need" | "want" | "trap";
  /** For needs: which kingdom need it covers. */
  covers?: "food" | "milk" | "veg" | "medicine" | "light";
  trapText?: string;
  scale?: number;
}

export interface Recurring { id: string; label: string; gold: number; everyDays: number; nextDay: number }

export interface Holding { units: number; }

export interface AccountsState {
  savings: number;
  chest: number; // TFSA-like
  gic: { amount: number; maturesDay: number; rate: number }[];
  shares: { basket: number; dragon: number; basketPrice: number; dragonPrice: number; history: { basket: number; dragon: number }[] };
  credit: { balance: number; reputation: number };
  insured: boolean;
  rdsp: number;
  rdspMatchedThisWeek: number;
  resp: number;
  pension: number;
  job: { guild: string | null; level: number; daysWorked: number };
  goals: { id: string; name: string; target: number; saved: number; done: boolean }[];
}

export interface DecisionLog {
  day: number;
  card: string;
  who: CharId;
  choice: "yes" | "no";
  concept?: Concept;
  wise?: boolean;
}

export interface DayStats {
  day: number;
  start: Record<StatKey, number>;
  end?: Record<StatKey, number>;
  marketStars?: number;
  kindness?: number;
}

export interface RunState {
  seed: number;
  rulerTitle: "King" | "Queen" | "Ruler";
  rulerModel: string;
  rulerName: string;
  day: number;
  people: number;
  happiness: number;
  gold: number;
  gems: Record<Gem, number>;
  flags: Record<string, boolean>;
  items: Record<ItemId, number>;
  seen: string[];
  scheduled: { day: number; card: string }[];
  recurring: Recurring[];
  queue: string[]; // today's remaining visitor card ids
  log: DecisionLog[];
  days: DayStats[];
  negativeGoldDays: number;
  accounts: AccountsState;
  /** Market: what the kingdom needs tonight + whether tonight's needs were met. */
  needsMet: Record<string, boolean>;
  kindnessTotal: number;
  unlocksSeen: string[];
  lost: boolean;
  lossReason?: string;
}

export type Phase =
  | "title" | "setup" | "morning" | "court" | "summary" | "street" | "budget" | "market" | "checkout"
  | "reign-review" | "reign-end";
