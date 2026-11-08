import { useState } from "react";
import { useGame } from "../game/store.ts";
import { GOAL_PRESETS, GUILDS, RATES, UNLOCKS } from "../game/content/economy.ts";
import { unlocked } from "../game/sim/sim.ts";
import type { TreasuryAction } from "../game/sim/sim.ts";
import { speak, sfx } from "../audio/audio.ts";
import { haptic } from "../platform/device.ts";
import { CoinIcon, EmoIco, Ico, UnlockIco } from "./icons.tsx";

function Spark({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const mx = Math.max(...data), mn = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 100},${40 - ((v - mn) / (mx - mn || 1)) * 36 - 2}`).join(" ");
  return <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none"><polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" /></svg>;
}

export function Treasury({ onClose }: { onClose: () => void }) {
  const run = useGame((s) => s.run)!;
  const act = useGame((s) => s.treasury);
  const tools = UNLOCKS.filter((u) => unlocked(run, u.id));
  const [tab, setTab] = useState(tools[0]?.id ?? "treasury");
  const [msg, setMsg] = useState("");
  const A = run.accounts;
  const u = UNLOCKS.find((x) => x.id === tab);

  const doIt = (a: TreasuryAction, okMsg?: string) => {
    const r = act(a);
    if (r.ok) { sfx("coinOut"); haptic("success"); setMsg(r.msg ?? okMsg ?? "Done!"); }
    else { sfx("hmm"); setMsg(r.msg ?? "Can't do that"); speak("advisor", r.msg === "Not enough gold" ? "We don't have enough gold for that." : r.msg ?? ""); }
  };
  const Bal = ({ n }: { n: number }) => <div className="bal"><span style={{ width: "1.2em", height: "1.2em", display: "inline-block" }}><CoinIcon /></span>{Math.round(n)}</div>;
  const pair = (fn: (n: number) => TreasuryAction, labels: [string, string] = ["Put in 10", "Take out 10"], amt = 10) => (
    <div className="ctrls">
      <button className="btn gold" onClick={() => doIt(fn(amt))}>⬆ {labels[0]}</button>
      {labels[1] && <button className="btn ghost" onClick={() => doIt(fn(-amt))}>⬇ {labels[1]}</button>}
    </div>
  );

  let body: React.ReactNode = null;
  switch (tab) {
    case "treasury":
      body = <>
        <p>Safe from thieves. Grows {Math.round(RATES.savingsWeekly * 100)}% every 7 days. Taking out costs 1 coin.</p>
        <Bal n={A.savings} />{pair((n) => ({ a: "savings", n }))}
      </>; break;
    case "goals":
      body = <>
        <p>Pick a goal. Fill its jar a little each day.</p>
        {A.goals.map((g) => (
          <div key={g.id} style={{ marginBottom: "calc(var(--u)*1.4)" }}>
            <div className="med display"><Ico name="jar" fallback="🫙" /> {g.name}: {g.saved} / {g.target} {g.done && <Ico name="boxchecked" fallback="✅" />}</div>
            <div style={{ height: "calc(var(--u)*2.4)", border: "3px solid var(--ink)", borderRadius: 99, background: "#fff", overflow: "hidden" }}>
              <div style={{ width: `${(g.saved / g.target) * 100}%`, height: "100%", background: "var(--gold)" }} />
            </div>
            {!g.done && <div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "goalPut", id: g.id, n: 10 })}>Put in 10</button></div>}
          </div>
        ))}
        <div className="ctrls">
          {GOAL_PRESETS.filter((p) => !A.goals.find((g) => g.id === p.id)).map((p) => (
            <button key={p.id} className="btn ghost" onClick={() => doIt({ a: "goalAdd", id: p.id, name: p.name, target: p.target }, "New goal!")}>+ {p.name} ({p.target})</button>
          ))}
        </div>
      </>; break;
    case "gic":
      body = <>
        <p>Lock gold for {RATES.gicDays} days. Get {Math.round(RATES.gicRate * 100)}% more. Can't touch it until then.</p>
        {A.gic.map((g, i) => <div key={i} className="med display"><Ico name="crystal" fallback="💎" /> {g.amount} → opens day {g.maturesDay}</div>)}
        <div className="ctrls">
          <button className="btn gold" onClick={() => doIt({ a: "gic", n: 50 })}>Lock 50</button>
          <button className="btn gold" onClick={() => doIt({ a: "gic", n: 100 })}>Lock 100</button>
        </div>
      </>; break;
    case "job":
      body = <>
        <p>Help a guild every day for gold. Level up every 5 days.</p>
        {A.job.guild && <div className="med display">Level {A.job.level + 1} • {A.job.daysWorked} days</div>}
        <div className="ctrls">
          {GUILDS.map((g) => (
            <button key={g.id} className={"btn " + (A.job.guild === g.id ? "gold" : "ghost")} onClick={() => doIt({ a: "job", guild: g.id }, `You joined the ${g.name}!`)}>
              <EmoIco e={g.icon} /> {g.name} ({g.pay[0]}→{g.pay[g.pay.length - 1]})
            </button>
          ))}
        </div>
      </>; break;
    case "shares": {
      const sh = A.shares;
      body = <>
        <p><Ico name="basket" fallback="🧺" /> Kingdom Basket: slow and steady. <Ico name="egg" fallback="🥚" /> Dragon Egg: big ups AND downs.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "calc(var(--u)*2)" }}>
          <div>
            <div className="med display"><Ico name="basket" fallback="🧺" /> {sh.basketPrice.toFixed(1)} each · you own {sh.basket}</div>
            <Spark data={sh.history.map((h) => h.basket)} color="#2f9e3f" />
            <div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "shares", fund: "basket", units: 1 })}>Buy 1</button><button className="btn ghost" onClick={() => doIt({ a: "shares", fund: "basket", units: -1 })}>Sell 1</button></div>
          </div>
          <div>
            <div className="med display"><Ico name="egg" fallback="🥚" /> {sh.dragonPrice.toFixed(1)} each · you own {sh.dragon}</div>
            <Spark data={sh.history.map((h) => h.dragon)} color="#c8461f" />
            <div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "shares", fund: "dragon", units: 1 })}>Buy 1</button><button className="btn ghost" onClick={() => doIt({ a: "shares", fund: "dragon", units: -1 })}>Sell 1</button></div>
          </div>
        </div>
      </>; break;
    }
    case "chest":
      body = <><p>Grows {Math.round(RATES.chestWeekly * 100)}% a week. No tax! Add up to {RATES.chestWeeklyCap} each week.</p><Bal n={A.chest} />{pair((n) => ({ a: "chest", n }))}</>; break;
    case "credit":
      body = <>
        <p>Buy now, pay later (limit {RATES.creditLimit}). Pay it all before bill day or it grows {Math.round(RATES.creditInterest * 100)}%!</p>
        <div className="med display">Owed: {A.credit.balance} <Ico name="coin" fallback="🪙" /> · Reputation: {A.credit.reputation}</div>
        <div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "payCredit", n: A.credit.balance }, "Card paid off!")}>Pay it all</button><button className="btn ghost" onClick={() => doIt({ a: "payCredit", n: 10 })}>Pay 10</button></div>
      </>; break;
    case "insurance":
      body = <>
        <p>{RATES.insuranceWeekly} gold a week. If a dragon or storm hits, the Guild pays.</p>
        <div className="med display">{run.flags.insured ? <><Ico name="shield" fallback="🛡️" /> You are protected</> : "Not protected"}</div>
        <div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "insure", on: !run.flags.insured }, run.flags.insured ? "Cancelled" : "Protected!")}>{run.flags.insured ? "Cancel" : "Join"}</button></div>
      </>; break;
    case "rdsp":
      body = <><p>For your future. The Crown adds 3 for every 1 you save (up to {RATES.rdspMatchCapWeekly} a week). Locked for later.</p><Bal n={A.rdsp} /><div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "rdsp", n: 10 })}>Put in 10</button></div></>; break;
    case "resp":
      body = <><p>Save for a child's school. The Crown adds 20%.</p><Bal n={A.resp} /><div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "resp", n: 10 })}>Put in 10</button></div></>; break;
    case "pension":
      body = <><p>Save for when you retire. Grows every week. Locked.</p><Bal n={A.pension} /><div className="ctrls"><button className="btn gold" onClick={() => doIt({ a: "pension", n: 10 })}>Put in 10</button></div></>; break;
  }

  return (
    <div className="center">
      <div className="treasury panel" style={{ position: "relative" }}>
        <div className="ribbon" style={{ position: "absolute", top: "calc(var(--u)*-3.4)", left: "50%", transform: "translateX(-50%)" }}><Ico name="vault" fallback="🏦" /> Royal Treasury</div>
        <div className="tabs" role="tablist">
          {tools.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={"tab " + (tab === t.id ? "on" : "")} onClick={() => { sfx("page"); setTab(t.id); setMsg(""); speak(t.presenter, t.intro[0]); }}>
              <span className="em"><UnlockIco id={t.id} fallback={t.icon} /></span>{t.name}
            </button>
          ))}
        </div>
        <div className="acct">
          <h3><UnlockIco id={u?.id} fallback={u?.icon} /> {u?.name}</h3>
          <div className="med display">In your pocket: {run.gold} <Ico name="coin" fallback="🪙" /></div>
          {body}
          <p className="real"><Ico name="house" fallback="🏠" /> {u?.realLife}</p>
          <div className="msg">{msg}</div>
          <div className="ctrls"><button className="btn" onClick={() => { sfx("doorClose"); onClose(); }}>◀ Back</button></div>
        </div>
      </div>
    </div>
  );
}
