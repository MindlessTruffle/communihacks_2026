// Night Market HUD: shopping list pin, wallet, item inspect card, touch joystick, pay counter, checkout stars.
import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/store.ts";
import { MARKET_BY_ID } from "../game/content/economy.ts";
import { ADVISOR } from "../game/content/advisor.ts";
import { UI } from "../game/content/uiLines.ts";
import { useMarket, joy } from "../scenes/MarketScene.tsx";
import { speak, sfx, stopVoice } from "../audio/audio.ts";
import { haptic, isTouch } from "../platform/device.ts";
import { EmoIco, FoodIco, Hint, Ico, useInput } from "./icons.tsx";
import { ITEM_EMOJI } from "./BudgetScroll.tsx";
import BudgetWin from "./BudgetWin.tsx";
import { vfx } from "../fx/vfx.ts";

const sum = (ids: string[]) => ids.reduce((a, id) => a + (MARKET_BY_ID[id]?.price ?? 0), 0);

/** Virtual thumbstick (touch). Writes joy.x / joy.y in −1..1; forward = +y. */
function Joystick() {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const pid = useRef<number | null>(null);
  const update = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (e.clientX - (r.left + rad)) / rad;
    let dy = (e.clientY - (r.top + rad)) / rad;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    joy.x = Math.abs(dx) < 0.12 ? 0 : dx;
    joy.y = Math.abs(dy) < 0.12 ? 0 : -dy;
    setKnob({ x: dx, y: dy });
  };
  const end = () => { pid.current = null; joy.x = 0; joy.y = 0; setKnob({ x: 0, y: 0 }); };
  useEffect(() => end, []);
  return (
    <div
      ref={base}
      className="joystick"
      style={{ left: "auto", right: "calc(var(--u) * 4 + var(--safe-r))" }}
      aria-label="Walk stick"
      onPointerDown={(e) => { e.stopPropagation(); pid.current = e.pointerId; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); update(e); }}
      onPointerMove={(e) => { if (pid.current === e.pointerId) update(e); }}
      onPointerUp={end}
      onPointerCancel={end}
    >
      <i style={{ transform: `translate(${knob.x * 60}%, ${knob.y * 60}%)` }} />
    </div>
  );
}

function ListPin() {
  const market = useGame((s) => s.market);
  const gold = useGame((s) => s.run?.gold ?? 0);
  const spent = sum(market.basket);
  const over = spent > market.budget;
  return (
    <div className="list-pin panel" style={{ left: "auto", right: "calc(var(--u) * 1.5 + var(--safe-r))" }} role="status" aria-label="Shopping list">
      <h4><Ico name="scroll" fallback="📜" /> My list</h4>
      <ul>
        {market.list.map((id) => {
          const got = market.basket.includes(id);
          return <li key={id} className={got ? "done" : ""}><span><Ico name={got ? "boxchecked" : "box"} fallback={got ? "✅" : "⬜"} /></span><span><FoodIco id={id} emoji={ITEM_EMOJI[id]} /> {MARKET_BY_ID[id]?.name}</span></li>;
        })}
      </ul>
      <div style={{ marginTop: "calc(var(--u)*.8)", fontFamily: "var(--font-display)", fontSize: "calc(var(--u)*2.2*var(--ts))" }}>
        <Ico name="basket" fallback="🧺" /> <span className={over ? "neg" : "pos"}>{spent}</span> / {market.budget} <Ico name="coin" fallback="🪙" /> {over ? <Ico name="warning" fallback="⚠️" /> : ""}
      </div>
      <div className="small" style={{ fontWeight: 700, opacity: 0.75 }}>Purse: {gold} <Ico name="coin" fallback="🪙" /></div>
    </div>
  );
}

function ItemCard({ id }: { id: string }) {
  const m = MARKET_BY_ID[id];
  const market = useGame((s) => s.market);
  const add = useGame((s) => s.addToBasket);
  const remove = useGame((s) => s.removeFromBasket);
  const setM = useMarket((s) => s.set);
  const onList = market.list.includes(id);
  const inBasket = market.basket.filter((x) => x === id).length;
  const trap = m.kind === "trap";
  const wouldBe = sum(market.basket) + m.price;
  const overAfter = wouldBe > market.budget;

  useEffect(() => {
    if (trap) speak("advisor", ADVISOR.marketTrap);
    else if (!onList) speak("advisor", ADVISOR.marketOffList);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { sfx("click"); setM({ selected: null }); };
  const take = () => { sfx("basket"); haptic("medium"); add(id); setM({ selected: null }); };
  const putBack = () => { sfx("pop"); remove(id); setM({ selected: null }); };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "n") close();
      else if (e.key === "Enter" || e.key === "y") take();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  return (
    <div className="item-pop panel" role="dialog" aria-label={`${m.name}, ${m.price} gold`}>
      {trap && m.trapText && <div className="sale">{m.trapText}</div>}
      <div style={{ fontSize: "calc(var(--u)*7)", lineHeight: 1.1 }}><FoodIco id={id} emoji={ITEM_EMOJI[id]} /></div>
      <div className="big display">{m.name}</div>
      <div className="display" style={{ fontSize: "calc(var(--u)*3.2*var(--ts))" }}>{m.price} <Ico name="coin" fallback="🪙" /></div>
      <p className="small" style={{ fontWeight: 700, margin: "calc(var(--u)*.6) 0" }}>
        {onList ? <><Ico name="boxchecked" fallback="✅" /> On your list!</> : trap ? <><Ico name="bulb" fallback="🤔" /> Shiny! But not on your list.</> : <><Ico name="note" fallback="📝" /> Not on your list.</>}
        {overAfter && <><br /><Ico name="warning" fallback="⚠️" /> This goes over your budget ({wouldBe} / {market.budget}).</>}
      </p>
      <div className="footer" style={{ display: "flex", gap: "calc(var(--u)*1.4)", justifyContent: "center", flexWrap: "wrap" }}>
        <button className="btn gold" onClick={take}><Ico name="basket" fallback="🧺" /> Put in basket</button>
        {inBasket > 0 && <button className="btn ghost" onClick={putBack}>↩ Put one back ({inBasket})</button>}
        <button className="btn ghost" onClick={close}>✗ Leave it</button>
      </div>
    </div>
  );
}

function Checkout() {
  const market = useGame((s) => s.market);
  const sleep = useGame((s) => s.sleep);
  const r = market.result;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!r) return;
    sfx("stars");
    const timers = [0, 1, 2].map((i) => setTimeout(() => { if (i < r.stars) { sfx("sparkle", { rate: 1 + i * 0.12 }); haptic("light"); vfx.burst("stars", vfx.pct(41 + i * 9, 36), { n: 10 }); } setShown(i + 1); }, 500 + i * 450));
    speak(null, r.stars === 3 ? UI.checkoutGreat : UI.checkoutOk).then(() => speak("advisor", ADVISOR.marketDone));
    return () => timers.forEach(clearTimeout);
  }, [r]);

  const go = () => { stopVoice(); sfx("click"); sleep(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") go(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (!r) return null;
  const row = (ok: boolean, good: string, bad: string) => (
    <div className="row"><span>{ok ? <Ico name="star" fallback="⭐" /> : "☆"}</span><span className={ok ? "pos" : "neu"}>{ok ? good : bad}</span></div>
  );
  return (
    <div className="center">
      <div className="card panel" role="dialog" aria-label={`Shopping done, ${r.stars} stars`}>
        <div className="ribbon">Shopping done!</div>
        <div style={{ fontSize: "calc(var(--u)*7)", letterSpacing: "calc(var(--u)*.6)", lineHeight: 1.2 }} aria-hidden>
          {[0, 1, 2].map((i) => <span key={i} style={{ display: "inline-block", transition: "transform .3s", transform: shown > i ? "scale(1)" : "scale(.4)", opacity: shown > i ? 1 : 0.25 }}>{i < r.stars && shown > i ? <Ico name="star" fallback="⭐" /> : <span className="star-empty"><Ico name="star" fallback="☆" /></span>}</span>)}
        </div>
        <div className="rows">
          {row(r.listDone, "Got everything on the list", "Missed something on the list")}
          {row(r.underBudget, `Stayed in budget (${r.spent} / ${market.budget})`, `Over budget (${r.spent} / ${market.budget})`)}
          {row(r.trapsAvoided, "Skipped the shiny sales", `Bought a shiny sale: ${r.traps.map((t) => MARKET_BY_ID[t]?.name).join(", ")}`)}
        </div>
        {r.bonus > 0 && (
          <div className="row"><span><Ico name="chest" fallback="🧰" /></span><span className="pos">Savings bonus +{r.bonus} gold{r.streak > 1 ? ` · ${r.streak} nights in a row!` : ""}</span></div>
        )}
        {r.missing.length > 0 && (
          <p className="small" style={{ fontWeight: 700 }}>The kingdom still needs: {r.missing.map((id) => `${ITEM_EMOJI[id] ?? ""} ${MARKET_BY_ID[id]?.name}`).join(", ")}</p>
        )}
        <div className="footer"><button className="btn gold" onClick={go}><Ico name="bed" fallback="🛏️" /> Go to sleep ▶</button></div>
      </div>
    </div>
  );
}

export default function MarketUI() {
  const phase = useGame((s) => s.phase);
  const checkout = useGame((s) => s.checkout);
  const win = useGame((s) => s.win);
  const selected = useMarket((s) => s.selected);
  const nearCashier = useMarket((s) => s.nearCashier);
  const touch = isTouch();

  const pay = () => { sfx("coinOut"); haptic("success"); useMarket.getState().set({ selected: null }); checkout(); };

  useEffect(() => {
    if (nearCashier && !selected) sfx("sparkle", { volume: 0.5 });
  }, [nearCashier, selected]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (phase === "market" && nearCashier && !selected && (e.key === "Enter" || e.key === " ")) pay(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => { joy.x = 0; joy.y = 0; }, []);

  if (phase === "checkout") return win ? <BudgetWin /> : <Checkout />;

  return (
    <div className="layer">
      <ListPin />
      {!touch && !selected && <div className="crosshair" />}
      {selected && <ItemCard id={selected} />}
      {!selected && nearCashier && (
        <div className="interact"><button className="btn gold" onClick={pay}><Ico name="purse" fallback="💰" /> Pay at the counter <Hint k="next" /></button></div>
      )}
      {!selected && !nearCashier && (
        <div className="hint-pill panel" style={touch ? { left: "auto", right: "calc(var(--u)*24)", transform: "none" } : undefined}>
          <MarketHint touch={touch} />
        </div>
      )}
      {touch && <Joystick />}
    </div>
  );
}

function MarketHint({ touch }: { touch: boolean }) {
  const dev = useInput();
  if (dev === "gamepad") return <span className="hintrow"><Hint k="move" /> walk · <Hint k="next" /> pick up</span>;
  if (touch || dev === "touch") return <span className="hintrow"><Ico name="tap" fallback="🕹️" /> Stick to walk · drag to look · tap food</span>;
  if (dev === "mouse") return <span className="hintrow"><Hint k="move" /> walk · drag to look · click food</span>;
  return <>WASD to walk · drag to look · click food</>;
}
