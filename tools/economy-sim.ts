// Balance bots. `pnpm sim` → prints how long each strategy survives and its wealth.
import { newRun, startDay, decide, currentCard, checkChoice, applyMarket, endDay, needsFor, netWorth } from "../src/game/sim/sim.ts";
import { MARKET_BY_ID } from "../src/game/content/economy.ts";
import type { RunState } from "../src/game/types.ts";

type Strat = (s: RunState) => "yes" | "no";
const strats: Record<string, Strat> = {
  alwaysYes: () => "yes",
  alwaysNo: () => "no",
  sensible: (s) => {
    const c = currentCard(s)!;
    if (c.lesson && c.lesson.good !== "either") return c.lesson.good;
    return s.gold > 160 ? "yes" : "no";
  },
};

for (const [name, strat] of Object.entries(strats)) {
  const results: { days: number; worth: number; people: number }[] = [];
  const reasons: Record<string, number> = {};
  for (let i = 0; i < 300; i++) {
    let s = newRun({ seed: 1000 + i });
    while (!s.lost && s.day < 40) {
      s = startDay(s).state;
      while (currentCard(s)) {
        let ch = strat(s);
        if (!checkChoice(s, currentCard(s)!, ch).ok) ch = ch === "yes" ? "no" : "yes";
        s = decide(s, ch).state;
      }
      const needs = needsFor(s);
      const budget = needs.reduce((a, n) => a + MARKET_BY_ID[n].price, 0);
      s = applyMarket(s, name === "alwaysYes" ? [...needs, "cake"] : needs, needs, budget).state;
      s = endDay(s);
    }
    if (s.lost) reasons[s.lossReason!] = (reasons[s.lossReason!] ?? 0) + 1;
    results.push({ days: s.day, worth: netWorth(s), people: s.people });
  }
  const avg = (k: keyof (typeof results)[0]) => Math.round(results.reduce((a, r) => a + r[k], 0) / results.length);
  const survived = results.filter((r) => r.days >= 40).length;
  console.log(`${name.padEnd(10)} avgDays=${avg("days")} survived40=${survived}/300 avgWorth=${avg("worth")} avgPeople=${avg("people")}`, reasons);
}
