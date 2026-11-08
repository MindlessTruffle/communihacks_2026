import { useEffect } from "react";
import { useGame } from "../game/store.ts";
import { MARKET_ITEMS, MARKET_BY_ID } from "../game/content/economy.ts";
import { needsFor } from "../game/sim/sim.ts";
import { ADVISOR } from "../game/content/advisor.ts";
import { UI } from "../game/content/uiLines.ts";
import { speak, sfx } from "../audio/audio.ts";
import { FoodIco, Ico } from "./icons.tsx";
import { haptic } from "../platform/device.ts";

export const ITEM_EMOJI: Record<string, string> = {
  bread: "🍞", milk: "🥛", carrots: "🥕", cabbage: "🥬", apples: "🍎", eggs: "🥚", cheese: "🧀", medicine: "🧪", candles: "🕯️", fish: "🐟",
  cookie: "🍪", tea: "🍵", cake: "🎂", sundae: "🍨", donuts: "🍩", candy: "🍫", wine: "🧃",
};

export function BudgetScroll() {
  const run = useGame((s) => s.run)!;
  const market = useGame((s) => s.market);
  const setList = useGame((s) => s.setList);
  const enter = useGame((s) => s.enterMarket);
  const needs = needsFor(run);
  const total = market.list.reduce((a, id) => a + (MARKET_BY_ID[id]?.price ?? 0), 0);
  const over = total > market.budget;
  const shown = MARKET_ITEMS.filter((m) => m.kind !== "trap");

  useEffect(() => { sfx("scroll"); speak("advisor", ADVISOR.marketIntro); }, []);
  useEffect(() => { if (over) speak("advisor", ADVISOR.marketOver); }, [over]);

  const toggle = (id: string) => {
    sfx("tap"); haptic();
    setList(market.list.includes(id) ? market.list.filter((x) => x !== id) : [...market.list, id], market.budget);
  };
  const setBudget = (b: number) => { sfx("coinIn"); setList(market.list, Math.max(5, Math.min(run.gold, b))); };

  return (
    <div className="center">
      <div className="scroll" role="dialog" aria-label="Shopping list">
        <div className="big display" style={{ textAlign: "center" }}><Ico name="scroll" fallback="📜" /> {UI.budgetTitle}</div>
        <p className="small" style={{ textAlign: "center", fontWeight: 700, margin: "calc(var(--u)*.4) 0" }}>{UI.budgetHint}</p>
        <div className="budget-bar">
          <span>Budget:
            <button className="btn ghost" style={{ minWidth: 56, padding: 0, margin: "0 8px" }} onClick={() => setBudget(market.budget - 5)} aria-label="Lower budget">−</button>
            {market.budget} <Ico name="coin" fallback="🪙" />
            <button className="btn ghost" style={{ minWidth: 56, padding: 0, margin: "0 8px" }} onClick={() => setBudget(market.budget + 5)} aria-label="Raise budget">+</button>
          </span>
          <span className={over ? "over" : "pos"}>List: {total} <Ico name="coin" fallback="🪙" /> {over ? <Ico name="warning" fallback="⚠️" /> : <Ico name="boxchecked" fallback="✅" />}</span>
        </div>
        <div className="items-wrap"><div className="items-grid">
          {shown.map((m) => (
            <button key={m.id} className={"item-tile " + (market.list.includes(m.id) ? "on" : "")} onClick={() => toggle(m.id)} aria-pressed={market.list.includes(m.id)} aria-label={`${m.name}, ${m.price} gold${needs.includes(m.id) ? ", needed" : ""}`}>
              {needs.includes(m.id) && <span className="need-tag">Need</span>}
              <span className="emo"><FoodIco id={m.id} emoji={ITEM_EMOJI[m.id]} /></span>
              <span className="nm">{m.name}</span>
              <span className="pr">{m.price} <Ico name="coin" fallback="🪙" /></span>
            </button>
          ))}
        </div></div>
        <div className="footer">
          <button className="btn gold hero" disabled={!market.list.length} onClick={() => { sfx("door"); haptic("medium"); speak(null, UI.marketHint); enter(); }}><Ico name="lantern" fallback="🏮" /> Enter the Night Market <span className="go">▶</span></button>
        </div>
      </div>
    </div>
  );
}
