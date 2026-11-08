import type { Item, MarketItem } from "../types.ts";

// All balance numbers live here. Tweak and run `pnpm sim` to see the effect.
export const TUNING = {
  start: { people: 100, happiness: 60, gold: 200 },
  /** Morning taxes = base + people * perPerson (lowered by the low_tax flag). */
  taxes: { base: 12, perPerson: 0.25, lowTaxMult: 0.75 },
  upkeepEvery: 7,
  torchBillEvery: 10,
  /** People grow when happiness is high, shrink when low. */
  growth: { highAt: 60, lowAt: 30, upPct: 0.04, downPct: 0.05 },
  visitorsPerDay: (day: number) => Math.min(6 + Math.floor(day / 3), 10),
  /** Lose: any of these. */
  loss: { minHappiness: 0, minPeople: 20, negativeGoldDays: 3 },
  /** Kingdom growth stages by people count (drive the window diorama). */
  stages: [0, 150, 300, 600, 1200],
  market: { needsPenaltyHappiness: -6, needsBonusHappiness: 3, trapHappiness: 2 },
  advisorEvery: 3,
};

export const ITEMS: Record<string, Item> = {
  medicine: { id: "medicine", name: "Medicine", icon: "🧪", model: "/models/food/medicine.glb" },
  pie: { id: "pie", name: "Pie", icon: "🥧", model: "/kenney/food-kit/pie.glb" },
  salt: { id: "salt", name: "Salt", icon: "🧂", model: "/kenney/food-kit/shaker-salt.glb" },
  spacecoin: { id: "spacecoin", name: "Space Coin", icon: "🪙", model: "/models/coin.glb" },
  bread: { id: "bread", name: "Bread", icon: "🍞", model: "/models/food/bread.glb" },
  candle: { id: "candle", name: "Candles", icon: "🕯️", model: "/kenney/graveyard-kit/candle.glb" },
};

const f = (n: string) => `/kenney/food-kit/${n}.glb`;
export const MARKET_ITEMS: MarketItem[] = [
  // needs
  { id: "bread", name: "Bread", model: "/models/food/bread.glb", price: 4, kind: "need", covers: "food" },
  { id: "milk", name: "Milk", model: "/models/food/milk.glb", price: 3, kind: "need", covers: "milk" },
  { id: "carrots", name: "Carrots", model: "/models/food/carrots.glb", price: 3, kind: "need", covers: "veg" },
  { id: "cabbage", name: "Cabbage", model: "/models/food/cabbage.glb", price: 4, kind: "need", covers: "veg" },
  { id: "apples", name: "Apples", model: "/models/food/apples.glb", price: 3, kind: "need", covers: "food" },
  { id: "eggs", name: "Eggs", model: "/models/food/eggs.glb", price: 4, kind: "need", covers: "food" },
  { id: "cheese", name: "Cheese", model: "/models/food/cheese.glb", price: 5, kind: "need", covers: "milk" },
  { id: "medicine", name: "Medicine", model: "/models/food/medicine.glb", price: 8, kind: "need", covers: "medicine" },
  { id: "candles", name: "Candles", model: "/models/food/candles.glb", price: 5, kind: "need", covers: "light" },
  { id: "fish", name: "Fish", model: "/models/food/fish.glb", price: 6, kind: "need", covers: "food" },
  // wants (fine in budget)
  { id: "cookie", name: "Cookie", model: "/models/food/cookie.glb", price: 2, kind: "want" },
  { id: "tea", name: "Tea", model: "/models/food/tea.glb", price: 3, kind: "want" },
  // traps (shiny + "SALE")
  { id: "cake", name: "Giant Cake", model: "/models/food/cake.glb", price: 18, kind: "trap", trapText: "BIG SALE!" },
  { id: "sundae", name: "Mega Sundae", model: "/models/food/sundae.glb", price: 12, kind: "trap", trapText: "Today only!" },
  { id: "donuts", name: "Donut Box", model: "/models/food/donuts.glb", price: 9, kind: "trap", trapText: "Buy 3 get 1!" },
  { id: "candy", name: "Candy Bar", model: "/models/food/candy.glb", price: 4, kind: "trap", trapText: "Grab one!" },
  { id: "wine", name: "Fancy Juice", model: "/models/food/wine.glb", price: 15, kind: "trap", trapText: "Fancy!" },
];
export const MARKET_BY_ID = Object.fromEntries(MARKET_ITEMS.map((m) => [m.id, m]));

/** What the kingdom needs tonight (drives the budget scroll). Deterministic per day. */
export function tonightsNeeds(day: number, rand: () => number): string[] {
  const needs = ["bread", "milk", rand() < 0.5 ? "carrots" : "cabbage"];
  if (day >= 3 && rand() < 0.5) needs.push(rand() < 0.5 ? "eggs" : "apples");
  if (day % 4 === 0) needs.push("medicine");
  if (day % 5 === 2) needs.push("candles");
  return needs;
}

// ------------------------------------------------------------------------
// Wealth-building tools unlocked over time (Morning Treasury).
// ------------------------------------------------------------------------
export interface UnlockDef {
  id: string;
  day: number;
  name: string;
  icon: string;
  presenter: string; // character id
  intro: string[]; // 3 short lines, spoken
  realLife: string;
}

export const UNLOCKS: UnlockDef[] = [
  { id: "treasury", day: 5, name: "Royal Vault", icon: "🏦", presenter: "cogs",
    intro: ["Gold in your pocket can get lost. Gold in the vault is safe.", "Every 7 days, the vault adds a little extra. That's interest.", "Taking gold out costs 1 coin. So plan ahead!"],
    realLife: "This is like a savings account at a bank." },
  { id: "goals", day: 8, name: "Wishing Jars", icon: "🫙", presenter: "bill",
    intro: ["Pick something you want. Put a little gold in its jar each day.", "When the jar is full, you get it!", "Saving for a goal makes big things possible."],
    realLife: "This is a savings goal." },
  { id: "gic", day: 10, name: "Crystal Vault", icon: "💎", presenter: "cogs",
    intro: ["Lock gold in the crystal for 7 days.", "When it opens, you get 6 percent more. Guaranteed!", "But you can't touch it until then."],
    realLife: "This is like a GIC: locked savings with a set reward." },
  { id: "job", day: 12, name: "Royal Guild Jobs", icon: "🛠️", presenter: "brick",
    intro: ["The ruler can help a guild for extra gold every day.", "Work more days and you level up. More levels, more gold!", "Switching guilds starts you at level 1 again."],
    realLife: "This is like a job and getting raises." },
  { id: "shares", day: 15, name: "Merchant Shares", icon: "📈", presenter: "marlo",
    intro: ["Buy a tiny piece of the town's shops.", "The Kingdom Basket grows slowly and steadily. The Dragon Egg jumps up AND down!", "Spread your gold out and be patient."],
    realLife: "This is like investing in stocks or an index fund." },
  { id: "chest", day: 18, name: "Treasure Chest", icon: "🧰", presenter: "cogs",
    intro: ["The Treasure Chest grows faster than the vault.", "And Tilly can't tax what grows in it!", "You can add up to 100 gold each week."],
    realLife: "This is like a TFSA: savings that grow tax-free." },
  { id: "credit", day: 20, name: "Merchant's Mark", icon: "💳", presenter: "marlo",
    intro: ["Buy now, pay later with the Merchant's Mark.", "Pay it all back on bill day and it's free.", "If not, it adds 20 percent more. Ouch!"],
    realLife: "This is a credit card. Pay the full balance to avoid interest." },
  { id: "insurance", day: 25, name: "Shield Guild", icon: "🛡️", presenter: "maya",
    intro: ["Pay a small amount each week.", "If a dragon or storm hits, the Guild pays the repairs.", "Small cost, big protection."],
    realLife: "This is insurance." },
  { id: "rdsp", day: 30, name: "Kindred Trust", icon: "🌳", presenter: "cogs",
    intro: ["The Crown helps you save for your future.", "Put in 10 gold and the Crown adds up to 30 more!", "It's locked for later, and grows big over time."],
    realLife: "This is like an RDSP. The government can add up to 3 dollars for every 1 you save." },
  { id: "resp", day: 35, name: "Scholar's Fund", icon: "📚", presenter: "prof",
    intro: ["Save for a child's school.", "The Crown adds 20 percent to what you put in.", "Learning is a gift for the future."],
    realLife: "This is like an RESP for a child's education." },
  { id: "pension", day: 40, name: "Royal Pension", icon: "🏡", presenter: "bill",
    intro: ["Save for when you retire.", "It grows every week and you can't spend it now.", "Your future self will thank you!"],
    realLife: "This is like an RRSP or pension." },
];

export const GUILDS = [
  { id: "bakers", name: "Bakers' Guild", icon: "🥖", pay: [6, 8, 10, 13, 16] },
  { id: "smiths", name: "Smiths' Guild", icon: "⚒️", pay: [5, 8, 11, 15, 20] },
  { id: "scribes", name: "Scribes' Guild", icon: "📜", pay: [7, 9, 11, 13, 15] },
];

export const GOAL_PRESETS = [
  { id: "tower", name: "New Castle Tower", target: 200 },
  { id: "garden", name: "Royal Garden", target: 120 },
  { id: "party", name: "Big Birthday Party", target: 80 },
];

export const RATES = {
  savingsWeekly: 0.03,
  savingsTax: 0.25, // Tilly taxes vault interest (but not the chest)
  withdrawFee: 1,
  gicRate: 0.06,
  gicDays: 7,
  chestWeekly: 0.05,
  chestWeeklyCap: 100,
  basket: { drift: 0.006, vol: 0.02 },
  dragon: { drift: 0.004, vol: 0.12 },
  creditLimit: 150,
  creditInterest: 0.2,
  insuranceWeekly: 6,
  rdspMatch: 3,
  rdspMatchCapWeekly: 30,
  rdspWeekly: 0.04,
  respMatch: 0.2,
  pensionWeekly: 0.05,
};
