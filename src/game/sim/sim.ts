// Pure game simulation. No DOM / three.js. Every function returns a NEW state (input is never mutated).
import type { Card, DecisionLog, Effect, Gem, RunState, StatKey } from "../types.ts";
import { GEMS } from "../types.ts";
import { CARDS, CARD_BY_ID } from "../content/cards.ts";
import { MARKET_BY_ID, RATES, TUNING, UNLOCKS, GUILDS, tonightsNeeds } from "../content/economy.ts";

// ---------------------------------------------------------------- rng
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Draw a random number and advance the state's seed. */
function roll(s: RunState): number {
  const r = rng(s.seed)();
  s.seed = (s.seed * 1664525 + 1013904223 + 7) >>> 0;
  return r;
}
const clone = <T>(x: T): T => structuredClone(x);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- new run
export function newRun(opts: { seed?: number; title?: RunState["rulerTitle"]; model?: string; name?: string } = {}): RunState {
  const gems = Object.fromEntries(GEMS.map((g) => [g, 0])) as Record<Gem, number>;
  return {
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    rulerTitle: opts.title ?? "Ruler",
    rulerModel: opts.model ?? "character-female-c",
    rulerName: opts.name ?? "",
    day: 0,
    ...TUNING.start,
    gems,
    flags: {},
    items: {},
    seen: [],
    scheduled: [],
    recurring: [],
    queue: [],
    log: [],
    days: [],
    negativeGoldDays: 0,
    accounts: {
      savings: 0, chest: 0, gic: [],
      shares: { basket: 0, dragon: 0, basketPrice: 10, dragonPrice: 10, history: [{ basket: 10, dragon: 10 }] },
      credit: { balance: 0, reputation: 650 },
      insured: false, rdsp: 0, rdspMatchedThisWeek: 0, resp: 0, pension: 0,
      job: { guild: null, level: 0, daysWorked: 0 },
      goals: [],
    },
    needsMet: {},
    kindnessTotal: 0,
    unlocksSeen: [],
    lost: false,
  };
}

export function unlocked(s: RunState, id: string): boolean {
  const u = UNLOCKS.find((x) => x.id === id);
  return !!u && s.day >= u.day;
}
export function stageOf(people: number): number {
  let st = 0;
  TUNING.stages.forEach((t, i) => { if (people >= t) st = i; });
  return st;
}

// ---------------------------------------------------------------- morning
export interface MorningLine { icon: string; text: string; gold: number }

export function startDay(prev: RunState): { state: RunState; lines: MorningLine[]; newUnlocks: string[] } {
  const s = clone(prev);
  s.day += 1;
  const lines: MorningLine[] = [];
  const A = s.accounts;

  // Taxes (income)
  let tax = Math.round(TUNING.taxes.base + s.people * TUNING.taxes.perPerson);
  if (s.flags.low_tax) tax = Math.round(tax * TUNING.taxes.lowTaxMult);
  s.gold += tax;
  lines.push({ icon: "🪙", text: "Taxes", gold: tax });

  // Guild job pay
  if (A.job.guild) {
    const gd = GUILDS.find((g) => g.id === A.job.guild)!;
    const pay = gd.pay[Math.min(A.job.level, gd.pay.length - 1)];
    s.gold += pay;
    A.job.daysWorked += 1;
    if (A.job.daysWorked % 5 === 0 && A.job.level < gd.pay.length - 1) A.job.level += 1;
    lines.push({ icon: gd.icon, text: gd.name, gold: pay });
  }

  // Recurring payments (positive = cost, negative = income)
  for (const r of s.recurring) {
    if (s.day >= r.nextDay) {
      s.gold -= r.gold;
      r.nextDay = s.day + r.everyDays;
      lines.push({ icon: r.gold > 0 ? "🔁" : "➕", text: r.label, gold: -r.gold });
    }
  }

  // Weekly finance tick
  if (s.day % 7 === 0) {
    if (A.savings > 0) {
      const gross = Math.floor(A.savings * RATES.savingsWeekly);
      const net = gross - Math.floor(gross * RATES.savingsTax);
      A.savings += net;
      if (net) lines.push({ icon: "🏦", text: "Vault interest", gold: net });
    }
    if (A.chest > 0) { const i = Math.floor(A.chest * RATES.chestWeekly); A.chest += i; if (i) lines.push({ icon: "🧰", text: "Chest growth (no tax!)", gold: i }); }
    if (A.rdsp > 0) A.rdsp += Math.floor(A.rdsp * RATES.rdspWeekly);
    if (A.pension > 0) A.pension += Math.floor(A.pension * RATES.pensionWeekly);
    A.rdspMatchedThisWeek = 0;
    if (A.credit.balance > 0) {
      const interest = Math.ceil(A.credit.balance * RATES.creditInterest);
      A.credit.balance += interest;
      A.credit.reputation = clamp(A.credit.reputation - 40, 300, 900);
      lines.push({ icon: "💳", text: "Card interest", gold: -interest });
    }
    if (A.insured || s.flags.insured) { /* insurance premium handled as recurring */ }
  }

  // GIC maturity
  A.gic = A.gic.filter((g) => {
    if (s.day >= g.maturesDay) {
      const total = Math.round(g.amount * (1 + g.rate));
      s.gold += total;
      lines.push({ icon: "💎", text: "Crystal Vault opened", gold: total });
      return false;
    }
    return true;
  });

  // Share prices random walk
  if (unlocked(s, "shares")) {
    const sh = A.shares;
    const n = () => (roll(s) + roll(s) + roll(s) - 1.5) / 1.5; // ~N(0, .7)
    sh.basketPrice = Math.max(1, +(sh.basketPrice * (1 + RATES.basket.drift + RATES.basket.vol * n())).toFixed(2));
    sh.dragonPrice = Math.max(0.5, +(sh.dragonPrice * (1 + RATES.dragon.drift + RATES.dragon.vol * n())).toFixed(2));
    sh.history.push({ basket: sh.basketPrice, dragon: sh.dragonPrice });
    if (sh.history.length > 30) sh.history.shift();
  }

  // Build today's visitor queue
  s.queue = buildQueue(s);
  s.days.push({ day: s.day, start: { people: s.people, happiness: s.happiness, gold: s.gold } });

  const newUnlocks = UNLOCKS.filter((u) => u.day <= s.day && !s.unlocksSeen.includes(u.id)).map((u) => u.id);
  return { state: s, lines, newUnlocks };
}

function meets(s: RunState, c: Card): boolean {
  const r = c.requires;
  if (!r) return true;
  if (r.flag && !s.flags[r.flag]) return false;
  if (r.notFlag && s.flags[r.notFlag]) return false;
  if (r.item && !(s.items[r.item] > 0)) return false;
  if (r.unlock && !unlocked(s, r.unlock)) return false;
  if (r.minPeople && s.people < r.minPeople) return false;
  return true;
}

function buildQueue(s: RunState): string[] {
  const q: string[] = [];
  if (s.day % TUNING.upkeepEvery === 0) q.push("upkeep");
  if (s.day % TUNING.torchBillEvery === 0) q.push("torch_bill");
  // scheduled story cards
  const due = s.scheduled.filter((x) => x.day <= s.day);
  s.scheduled = s.scheduled.filter((x) => x.day > s.day);
  for (const d of due) {
    const c = CARD_BY_ID[d.card];
    if (c && meets(s, c)) q.push(c.id);
  }
  const target = TUNING.visitorsPerDay(s.day);
  const usedWho = new Set(q.map((id) => CARD_BY_ID[id]?.who));
  const pool = CARDS.filter((c) =>
    (c.weight ?? 1) > 0 && (c.minDay ?? 1) <= s.day && (c.maxDay ?? 999) >= s.day &&
    (c.repeat || !s.seen.includes(c.id)) && !q.includes(c.id) && meets(s, c));
  while (q.length < target && pool.length) {
    // prefer characters not seen today
    const fresh = pool.filter((c) => !usedWho.has(c.who));
    const from = fresh.length ? fresh : pool;
    const total = from.reduce((a, c) => a + (c.weight ?? 1), 0);
    let r = roll(s) * total;
    let pick = from[0];
    for (const c of from) { r -= c.weight ?? 1; if (r <= 0) { pick = c; break; } }
    q.push(pick.id);
    usedWho.add(pick.who);
    pool.splice(pool.indexOf(pick), 1);
  }
  return q;
}

// ---------------------------------------------------------------- decisions
export function currentCard(s: RunState): Card | undefined {
  return s.queue.length ? CARD_BY_ID[s.queue[0]] : undefined;
}

/** Worst-case gold change of a list of effects (follows flags, assumes the worse branch of chances). */
function goldDelta(effects: Effect[], s?: RunState): number {
  let d = 0;
  for (const e of effects) {
    if (e.t === "stat" && e.key === "gold") d += e.n;
    else if (e.t === "ifFlag") d += goldDelta(s && s.flags[e.flag] ? e.then : e.else ?? [], s);
    else if (e.t === "chance") d += Math.min(goldDelta(e.then, s), goldDelta(e.else ?? [], s));
  }
  return d;
}

export type Pay = "gold" | "item" | "credit" | "free";
export interface ChoiceCheck { ok: boolean; pay: Pay; cost: number }

/** Can the player pick this answer? (Yes might need gold, an item, or the credit card.) */
export function checkChoice(s: RunState, card: Card, choice: "yes" | "no"): ChoiceCheck {
  const effects = choice === "yes" ? card.yes : card.no;
  const cost = (choice === "yes" ? card.cost ?? 0 : 0) - goldDelta(effects, s);
  if (choice === "yes" && card.orItem && (s.items[card.orItem] ?? 0) > 0) return { ok: true, pay: "item", cost: 0 };
  if (cost <= 0) return { ok: true, pay: "free", cost: 0 };
  if (s.gold >= cost) return { ok: true, pay: "gold", cost };
  if (unlocked(s, "credit") && s.accounts.credit.balance + (cost - Math.max(0, s.gold)) <= RATES.creditLimit) return { ok: true, pay: "credit", cost };
  return { ok: false, pay: "gold", cost };
}

export interface Outcome {
  line: string;
  delta: Record<StatKey, number>;
  gems: Partial<Record<Gem, number>>;
  lesson?: { text: string; realLife: string; wise: boolean };
  itemUsed?: string;
  paidWithCredit?: number;
}

function applyEffects(s: RunState, effects: Effect[], gemsOut: Partial<Record<Gem, number>>) {
  for (const e of effects) {
    switch (e.t) {
      case "stat": s[e.key] += e.n; break;
      case "gem": s.gems[e.gem] = Math.max(0, s.gems[e.gem] + e.n); gemsOut[e.gem] = (gemsOut[e.gem] ?? 0) + e.n; break;
      case "flag":
        s.flags[e.flag] = e.value ?? true;
        if (e.flag === "vault_robbed") {
          if (s.accounts.savings > 0) s.accounts.savings = Math.floor(s.accounts.savings * 0.6);
          else s.gold -= 40;
        }
        if (e.flag === "insured") s.accounts.insured = true;
        break;
      case "item": s.items[e.item] = Math.max(0, (s.items[e.item] ?? 0) + e.n); break;
      case "schedule": s.scheduled.push({ day: s.day + e.inDays, card: e.card }); break;
      case "recurring":
        s.recurring = s.recurring.filter((r) => r.id !== e.id);
        s.recurring.push({ id: e.id, label: e.label, gold: e.gold, everyDays: e.everyDays, nextDay: s.day + e.everyDays });
        s.flags["recurring:" + e.id] = true;
        break;
      case "cancelRecurring":
        s.recurring = s.recurring.filter((r) => r.id !== e.id);
        s.flags["recurring:" + e.id] = false;
        if (e.id === "shield") { s.flags.insured = false; s.accounts.insured = false; }
        break;
      case "chance": applyEffects(s, roll(s) < e.p ? e.then : e.else ?? [], gemsOut); break;
      case "ifFlag": applyEffects(s, s.flags[e.flag] ? e.then : e.else ?? [], gemsOut); break;
    }
  }
}

export function decide(prev: RunState, choice: "yes" | "no"): { state: RunState; outcome: Outcome } {
  const s = clone(prev);
  const card = currentCard(s)!;
  const before = { people: s.people, happiness: s.happiness, gold: s.gold };
  const gems: Partial<Record<Gem, number>> = {};
  const check = checkChoice(s, card, choice);
  const outcome: Outcome = { line: choice === "yes" ? card.yesLine : card.noLine, delta: { people: 0, happiness: 0, gold: 0 }, gems };

  if (choice === "yes") {
    if (check.pay === "item" && card.orItem) { s.items[card.orItem] -= 1; outcome.itemUsed = card.orItem; }
    else if (card.cost) s.gold -= card.cost;
  }
  applyEffects(s, choice === "yes" ? card.yes : card.no, gems);

  // Gold below zero during a credit-paid choice goes on the card instead.
  if (s.gold < 0 && check.pay === "credit") {
    const owed = -s.gold;
    s.accounts.credit.balance += owed;
    s.gold = 0;
    outcome.paidWithCredit = owed;
  }
  s.happiness = clamp(s.happiness, -10, 100);
  s.people = Math.max(0, Math.round(s.people));

  if (!card.repeat && !s.seen.includes(card.id)) s.seen.push(card.id);
  s.queue.shift();

  let wise: boolean | undefined;
  if (card.lesson) {
    wise = card.lesson.good === "either" ? true : card.lesson.good === choice;
    outcome.lesson = { text: wise ? card.lesson.praise : card.lesson.coach, realLife: card.lesson.realLife, wise };
  }
  const entry: DecisionLog = { day: s.day, card: card.id, who: card.who, choice, concept: card.lesson?.concept, wise };
  s.log.push(entry);

  outcome.delta = { people: s.people - before.people, happiness: s.happiness - before.happiness, gold: s.gold - before.gold };
  return { state: s, outcome };
}

// ---------------------------------------------------------------- end of court / day
export function courtSummary(s: RunState) {
  const d = s.days[s.days.length - 1];
  return { day: s.day, dp: s.people - d.start.people, dh: s.happiness - d.start.happiness, dg: s.gold - d.start.gold };
}

export function needsFor(s: RunState): string[] {
  const r = rng(s.seed ^ (s.day * 7919));
  return tonightsNeeds(s.day, r);
}

/** Savings bonus: half the gold left under budget (rounded up), never less than this. */
export const SAVINGS_BONUS_MIN = 3;
export interface MarketResult {
  stars: number; spent: number; listDone: boolean; underBudget: boolean; trapsAvoided: boolean; missing: string[]; traps: string[];
  /** Stuck to the budget: whole list bought AND under budget. Triggers the budget-win cutscene + savings bonus. */
  budgetWin: boolean;
  saved: number; bonus: number; streak: number; gemGiven: boolean;
}

export function applyMarket(prev: RunState, basket: string[], list: string[], budget: number): { state: RunState; result: MarketResult } {
  const s = clone(prev);
  const spent = basket.reduce((a, id) => a + (MARKET_BY_ID[id]?.price ?? 0), 0);
  s.gold -= spent;
  const needs = needsFor(s);
  const covered = new Set(basket.map((id) => MARKET_BY_ID[id]?.covers).filter(Boolean) as string[]);
  const missing = needs.filter((n) => !covered.has(MARKET_BY_ID[n]?.covers as string) && !basket.includes(n));
  const traps = basket.filter((id) => MARKET_BY_ID[id]?.kind === "trap");
  const listDone = list.every((id) => basket.includes(id));
  const underBudget = spent <= budget;
  const trapsAvoided = traps.length === 0;
  const stars = (listDone ? 1 : 0) + (underBudget ? 1 : 0) + (trapsAvoided ? 1 : 0);

  if (missing.length) s.happiness += TUNING.market.needsPenaltyHappiness * missing.length;
  else s.happiness += TUNING.market.needsBonusHappiness;
  s.happiness += traps.length * TUNING.market.trapHappiness;
  if (basket.includes("medicine")) s.items.medicine = (s.items.medicine ?? 0) + 1;
  // Budget win: savings bonus + 1 responsibility gem (the 3-star gem is the same gem: never given twice) + streak.
  const budgetWin = underBudget && listDone;
  const saved = Math.max(0, budget - spent);
  const bonus = budgetWin ? Math.max(SAVINGS_BONUS_MIN, Math.ceil(saved / 2)) : 0;
  const x = s as RunState & { budgetStreak?: number };
  x.budgetStreak = budgetWin ? (x.budgetStreak ?? 0) + 1 : 0;
  s.gold += bonus;
  const gemGiven = budgetWin || stars === 3;
  if (gemGiven) s.gems.responsibility += 1;
  s.happiness = clamp(s.happiness, -10, 100);
  const d = s.days[s.days.length - 1];
  if (d) d.marketStars = stars;
  return { state: s, result: { stars, spent, listDone, underBudget, trapsAvoided, missing, traps, budgetWin, saved, bonus, streak: x.budgetStreak ?? 0, gemGiven } };
}

/** End of night: population growth, loss check. */
export function endDay(prev: RunState): RunState {
  const s = clone(prev);
  const G = TUNING.growth;
  if (s.happiness >= G.highAt) s.people = Math.round(s.people * (1 + G.upPct) + 1);
  else if (s.happiness <= G.lowAt) s.people = Math.round(s.people * (1 - G.downPct));
  s.negativeGoldDays = s.gold < 0 ? s.negativeGoldDays + 1 : 0;
  const d = s.days[s.days.length - 1];
  if (d) d.end = { people: s.people, happiness: s.happiness, gold: s.gold };
  return checkLoss(s);
}

export function checkLoss(prev: RunState): RunState {
  const s = clone(prev);
  const L = TUNING.loss;
  if (s.happiness <= L.minHappiness) { s.lost = true; s.lossReason = "The people became too unhappy."; }
  else if (s.people < L.minPeople) { s.lost = true; s.lossReason = "Too many people left the kingdom."; }
  else if (s.negativeGoldDays >= L.negativeGoldDays) { s.lost = true; s.lossReason = "The treasury was empty for too long."; }
  return s;
}

export function forceLoss(prev: RunState, reason = "The kingdom needs a rest."): RunState {
  const s = clone(prev);
  s.lost = true;
  s.lossReason = reason;
  return s;
}

export function addKindness(prev: RunState, gem: Gem, n = 1): RunState {
  const s = clone(prev);
  s.gems[gem] += n;
  s.kindnessTotal += n;
  const d = s.days[s.days.length - 1];
  if (d) d.kindness = (d.kindness ?? 0) + n;
  return s;
}

// ---------------------------------------------------------------- treasury actions
export type TreasuryAction =
  | { a: "savings"; n: number } // + deposit, - withdraw
  | { a: "gic"; n: number }
  | { a: "chest"; n: number }
  | { a: "shares"; fund: "basket" | "dragon"; units: number } // +buy -sell
  | { a: "payCredit"; n: number }
  | { a: "rdsp"; n: number }
  | { a: "resp"; n: number }
  | { a: "pension"; n: number }
  | { a: "job"; guild: string }
  | { a: "goalAdd"; id: string; name: string; target: number }
  | { a: "goalPut"; id: string; n: number }
  | { a: "insure"; on: boolean };

export function treasury(prev: RunState, act: TreasuryAction): { state: RunState; ok: boolean; msg?: string } {
  const s = clone(prev);
  const A = s.accounts;
  const need = (n: number) => s.gold >= n;
  switch (act.a) {
    case "savings":
      if (act.n > 0) { if (!need(act.n)) return { state: prev, ok: false, msg: "Not enough gold" }; s.gold -= act.n; A.savings += act.n; }
      else { const w = Math.min(-act.n, A.savings - RATES.withdrawFee); if (w <= 0) return { state: prev, ok: false, msg: "The vault is empty" }; A.savings -= w + RATES.withdrawFee; s.gold += w; }
      break;
    case "gic":
      if (!need(act.n)) return { state: prev, ok: false, msg: "Not enough gold" };
      s.gold -= act.n; A.gic.push({ amount: act.n, maturesDay: s.day + RATES.gicDays, rate: RATES.gicRate });
      break;
    case "chest": {
      if (act.n > 0) {
        const thisWeek = A.chest; // simple cap: total contributions by week index
        const cap = RATES.chestWeeklyCap * Math.ceil(s.day / 7);
        if (thisWeek + act.n > cap) return { state: prev, ok: false, msg: "Chest limit reached this week" };
        if (!need(act.n)) return { state: prev, ok: false, msg: "Not enough gold" };
        s.gold -= act.n; A.chest += act.n;
      } else { const w = Math.min(-act.n, A.chest); A.chest -= w; s.gold += w; }
      break;
    }
    case "shares": {
      const price = act.fund === "basket" ? A.shares.basketPrice : A.shares.dragonPrice;
      if (act.units > 0) {
        const cost = Math.ceil(price * act.units);
        if (!need(cost)) return { state: prev, ok: false, msg: "Not enough gold" };
        s.gold -= cost; A.shares[act.fund] += act.units;
      } else {
        const u = Math.min(-act.units, A.shares[act.fund]);
        if (u <= 0) return { state: prev, ok: false, msg: "No shares to sell" };
        A.shares[act.fund] -= u; s.gold += Math.floor(price * u);
      }
      break;
    }
    case "payCredit": {
      const n = Math.min(act.n, A.credit.balance, s.gold);
      if (n <= 0) return { state: prev, ok: false };
      s.gold -= n; A.credit.balance -= n;
      if (A.credit.balance === 0) A.credit.reputation = clamp(A.credit.reputation + 25, 300, 900);
      break;
    }
    case "rdsp": {
      if (!need(act.n)) return { state: prev, ok: false, msg: "Not enough gold" };
      s.gold -= act.n;
      const match = Math.min(act.n * RATES.rdspMatch, RATES.rdspMatchCapWeekly - A.rdspMatchedThisWeek);
      A.rdspMatchedThisWeek += Math.max(0, match);
      A.rdsp += act.n + Math.max(0, match);
      return { state: s, ok: true, msg: match > 0 ? `The Crown added ${match}!` : "Crown match used up this week" };
    }
    case "resp":
      if (!need(act.n)) return { state: prev, ok: false, msg: "Not enough gold" };
      s.gold -= act.n; A.resp += Math.round(act.n * (1 + RATES.respMatch));
      break;
    case "pension":
      if (!need(act.n)) return { state: prev, ok: false, msg: "Not enough gold" };
      s.gold -= act.n; A.pension += act.n;
      break;
    case "job":
      if (A.job.guild !== act.guild) { A.job = { guild: act.guild, level: 0, daysWorked: 0 }; }
      break;
    case "goalAdd":
      if (!A.goals.find((g) => g.id === act.id)) A.goals.push({ id: act.id, name: act.name, target: act.target, saved: 0, done: false });
      break;
    case "goalPut": {
      const g = A.goals.find((x) => x.id === act.id);
      if (!g || g.done) return { state: prev, ok: false };
      const n = Math.min(act.n, g.target - g.saved);
      if (!need(n)) return { state: prev, ok: false, msg: "Not enough gold" };
      s.gold -= n; g.saved += n;
      if (g.saved >= g.target) { g.done = true; s.gems.responsibility += 2; s.happiness = clamp(s.happiness + 10, -10, 100); s.flags["goal:" + g.id] = true; return { state: s, ok: true, msg: "Goal reached!" }; }
      break;
    }
    case "insure":
      if (act.on) applyEffects(s, [{ t: "flag", flag: "insured" }, { t: "recurring", id: "shield", label: "Shield Guild", gold: RATES.insuranceWeekly, everyDays: 7 }], {});
      else applyEffects(s, [{ t: "cancelRecurring", id: "shield" }], {});
      break;
  }
  return { state: s, ok: true };
}

export function netWorth(s: RunState): number {
  const A = s.accounts;
  return Math.round(
    s.gold + A.savings + A.chest + A.gic.reduce((a, g) => a + g.amount, 0) +
    A.shares.basket * A.shares.basketPrice + A.shares.dragon * A.shares.dragonPrice +
    A.rdsp + A.resp + A.pension - A.credit.balance,
  );
}

// ---------------------------------------------------------------- reign report (feeds the final advisor chat)
export interface ReignReport {
  days: number; netWorth: number; people: number; happiness: number;
  wiseCount: number; unwiseCount: number;
  good: string[]; bad: string[]; tips: string[];
  gems: Record<Gem, number>; avgStars: number; kindness: number; reason: string;
}

const CONCEPT_WORDS: Record<string, string> = {
  "needs-wants": "telling needs from wants", bills: "paying bills on time", subscriptions: "handling subscriptions",
  scams: "spotting scams", phishing: "keeping your PIN secret", lending: "lending money to friends",
  "emergency-fund": "saving for emergencies", "saving-goal": "saving for big goals", "compare-prices": "comparing prices",
  impulse: "avoiding 'today only' buys", investing: "spending now to earn later", insurance: "insurance",
  giving: "giving", quality: "choosing things that last", "high-interest": "avoiding expensive loans",
  "peer-pressure": "not buying just to fit in", income: "growing income", planning: "planning ahead",
  privacy: "protecting your ID", honesty: "being honest",
};

export function reignReport(s: RunState): ReignReport {
  const byConcept = new Map<string, { w: number; u: number }>();
  for (const l of s.log) {
    if (!l.concept || l.wise === undefined) continue;
    const c = byConcept.get(l.concept) ?? { w: 0, u: 0 };
    l.wise ? c.w++ : c.u++;
    byConcept.set(l.concept, c);
  }
  const good: string[] = [], bad: string[] = [];
  for (const [k, v] of byConcept) {
    if (v.w > v.u) good.push(CONCEPT_WORDS[k] ?? k);
    else if (v.u > 0) bad.push(CONCEPT_WORDS[k] ?? k);
  }
  const stars = s.days.map((d) => d.marketStars).filter((x): x is number => x !== undefined);
  const avgStars = stars.length ? +(stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(1) : 0;
  const tips: string[] = [];
  if (s.flags.scammed) tips.push("If someone asks you to pay to get a prize, it's a scam.");
  if (s.flags.shady_loan_taken) tips.push("Fast loans cost a lot extra. Save a little each day instead.");
  if (s.negativeGoldDays > 0 || s.gold < 50) tips.push("Keep some gold for upkeep day. Save a little every morning.");
  if (avgStars < 2 && stars.length) tips.push("At the market, stick to your list and skip the shiny sale items.");
  if (s.happiness < 30) tips.push("Helping people keeps the kingdom happy and growing.");
  if (!tips.length) tips.push("Keep doing what you're doing, and try the Royal Vault to grow your savings.");
  return {
    days: s.day, netWorth: netWorth(s), people: s.people, happiness: s.happiness,
    wiseCount: s.log.filter((l) => l.wise === true).length,
    unwiseCount: s.log.filter((l) => l.wise === false).length,
    good, bad, tips, gems: s.gems, avgStars, kindness: s.kindnessTotal, reason: s.lossReason ?? "",
  };
}

export function reportToText(r: ReignReport): string {
  return [
    `Reign lasted ${r.days} days. Reason it ended: ${r.reason}`,
    `Final: ${r.people} people, happiness ${r.happiness}, total wealth ${r.netWorth} gold.`,
    `Wise choices: ${r.wiseCount}. Choices to learn from: ${r.unwiseCount}.`,
    `Did well at: ${r.good.join(", ") || "still learning"}.`,
    `Can improve: ${r.bad.join(", ") || "nothing major"}.`,
    `Market stars average: ${r.avgStars} out of 3. Kindness moments in evening chats: ${r.kindness}.`,
    `Character gems: ${Object.entries(r.gems).map(([k, v]) => `${k} ${v}`).join(", ")}.`,
    `Tips: ${r.tips.join(" ")}`,
  ].join("\n");
}
