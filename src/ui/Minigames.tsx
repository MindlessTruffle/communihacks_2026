// Street minigames: short (45-90 s), optional, replay-safe, reward gold. Big targets, NO timers:
// feedback stays on screen until the player taps Next.
import { useEffect, useMemo, useRef, useState } from "react";
import { useGame } from "../game/store.ts";
import { speak, sfx } from "../audio/audio.ts";
import { haptic } from "../platform/device.ts";
import { useDialog } from "../platform/a11y.tsx";

function Shell({ title, children, onQuit }: { title: string; children: React.ReactNode; onQuit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { initial: "[data-autofocus]" });
  return (
    <div className="center">
      <div className="minigame panel" style={{ position: "relative" }} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="ribbon mg-ribbon">{title}</div>
        <div className="mg-body">{children}</div>
        <div className="footer mg-foot"><button className="btn ghost" onClick={() => { sfx("doorClose"); onQuit(); }}>◀ Leave</button></div>
      </div>
    </div>
  );
}

function Win({ gold, text, onDone }: { gold: number; text: string; onDone: () => void }) {
  useEffect(() => { sfx(gold > 0 ? "fanfare" : "hmm"); if (gold > 0) haptic("success"); speak(null, gold > 0 ? "Well done!" : "Nice try! Come back and play again."); }, [gold]);
  return (
    <div role="status">
      <div style={{ fontSize: "calc(var(--u)*9)" }} aria-hidden="true">{gold > 0 ? "🎉" : "🙂"}</div>
      <p className="big display">{text}</p>
      <p className="med display pos">{gold > 0 ? `+${gold} 🪙` : "Try again any time!"}</p>
      <button className="btn gold" data-autofocus onClick={onDone}>{gold > 0 ? "Collect ▶" : "OK ▶"}</button>
    </div>
  );
}

const shuffle = <T,>(a: T[]) => [...a].sort(() => Math.random() - 0.5);

/** Make exact change: customer pays X for an item costing Y. Tap coins to build the change. */
function CoinCounter({ onDone, onQuit }: { onDone: (g: number) => void; onQuit: () => void }) {
  const rounds = useMemo(() => shuffle([[10, 7], [20, 13], [15, 6], [25, 18], [10, 4], [20, 17]]).slice(0, 3), []);
  const [r, setR] = useState(0);
  const [tray, setTray] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [paid, cost] = rounds[r] ?? [0, 0];
  const need = paid - cost;
  const sum = tray.reduce((a, b) => a + b, 0);
  useEffect(() => { if (r < rounds.length) speak(null, `They pay ${paid}. It costs ${cost}. Give ${need} back.`, { caption: false }); }, [r]); // eslint-disable-line
  if (r >= rounds.length) return <Shell title="🪙 Coin Counter" onQuit={onQuit}><Win gold={score * 4} text={`You made change ${score} ${score === 1 ? "time" : "times"}!`} onDone={() => onDone(score * 4)} /></Shell>;
  const check = () => {
    if (sum === need) { sfx("good"); haptic("success"); setScore(score + 1); setMsg({ ok: true, text: "Perfect change! ✅" }); }
    else { sfx("hmm"); setMsg({ ok: false, text: `That's ${sum}. The right change was ${need}.` }); }
  };
  const next = () => { setTray([]); setMsg(null); setR(r + 1); };
  return (
    <Shell title="🪙 Coin Counter" onQuit={onQuit}>
      <p className="big display">Customer pays <b>{paid}</b>. The bread costs <b>{cost}</b>.</p>
      <p className="med display">Give back the change: <span style={{ color: "var(--people)" }}>{paid} − {cost} = ?</span></p>
      <div className="tray" role="group" aria-label={`Change so far ${sum}. Tap a coin to take it back.`}>
        {tray.map((c, i) => <button key={i} className={"coin-btn " + (c === 1 ? "silver" : "")} style={{ width: "calc(var(--u)*6)", height: "calc(var(--u)*6)", minWidth: 48, minHeight: 48 }} disabled={!!msg} onClick={() => { sfx("coinOut"); setTray(tray.filter((_, j) => j !== i)); }} aria-label={`Take back ${c} coin`}>{c}</button>)}
        {!tray.length && <span className="small">Tap coins below</span>}
      </div>
      <div className="med display" aria-live="polite">Change: {sum}</div>
      <div className="coins-row">
        {[1, 2, 5, 10].map((c) => <button key={c} className={"coin-btn " + (c === 1 ? "silver" : "")} disabled={!!msg} onClick={() => { sfx("coinIn"); haptic(); setTray([...tray, c]); }} aria-label={`Add ${c} coin`}>{c}</button>)}
      </div>
      <div className={"msg display med " + (msg ? (msg.ok ? "pos" : "neg") : "")} role="status">{msg?.text}</div>
      {msg
        ? <button className="btn gold" data-autofocus onClick={next}>{r + 1 >= rounds.length ? "Finish ▶" : "Next ▶"}</button>
        : <button className="btn gold" data-autofocus onClick={check} disabled={!tray.length}>Give change ✓</button>}
    </Shell>
  );
}

/** Which is the better deal? Unit-price thinking with pictures. */
function PriceCompare({ onDone, onQuit }: { onDone: (g: number) => void; onQuit: () => void }) {
  const rounds = useMemo(() => shuffle([
    { a: { n: 2, p: 6, e: "🍎" }, b: { n: 3, p: 6, e: "🍎" } },
    { a: { n: 1, p: 4, e: "🥛" }, b: { n: 2, p: 10, e: "🥛" } },
    { a: { n: 4, p: 8, e: "🥚" }, b: { n: 6, p: 9, e: "🥚" } },
    { a: { n: 1, p: 5, e: "🍞" }, b: { n: 2, p: 8, e: "🍞" } },
  ]).slice(0, 3), []);
  const [r, setR] = useState(0);
  const [score, setScore] = useState(0);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; picked: "a" | "b" } | null>(null);
  useEffect(() => { if (r < rounds.length) speak(null, "Which one is the better deal?", { caption: false }); }, [r]); // eslint-disable-line
  if (r >= rounds.length) return <Shell title="⚖️ Price Stall" onQuit={onQuit}><Win gold={score * 5} text={`You found ${score} good ${score === 1 ? "deal" : "deals"}!`} onDone={() => onDone(score * 5)} /></Shell>;
  const { a, b } = rounds[r];
  const best = a.p / a.n < b.p / b.n ? "a" : "b";
  const pick = (k: "a" | "b") => {
    if (msg) return;
    const ok = k === best;
    const win = k === "a" ? a : b, other = k === "a" ? b : a;
    if (ok) { sfx("good"); haptic("success"); setScore(score + 1); setMsg({ ok, picked: k, text: `Yes! ${win.p} ÷ ${win.n} = ${(win.p / win.n).toFixed(1)} each. Cheaper!` }); }
    else { sfx("hmm"); setMsg({ ok, picked: k, text: `Hmm. The other one is ${(other.p / other.n).toFixed(1)} each. Cheaper!` }); }
  };
  const Deal = ({ d, k }: { d: typeof a; k: "a" | "b" }) => (
    <button className={"deal panel" + (msg ? (k === best ? " good" : " dim") : "")} onClick={() => pick(k)} aria-label={`${d.n} for ${d.p} gold`} data-autofocus={k === "a" ? "" : undefined}>
      <div className="emo" aria-hidden="true">{d.e.repeat(d.n)}</div>
      <div className="big display">{d.n} for {d.p} 🪙</div>
      {msg && k === best && <div className="deal-tag display">✓ Better deal</div>}
    </button>
  );
  return (
    <Shell title="⚖️ Price Stall" onQuit={onQuit}>
      <p className="big display">Which is the better deal?</p>
      <div className="compare"><Deal d={a} k="a" /><Deal d={b} k="b" /></div>
      <div className={"med display " + (msg ? (msg.ok ? "pos" : "neg") : "")} role="status" style={{ minHeight: "calc(var(--u)*3)" }}>{msg?.text}</div>
      {msg && <button className="btn gold" data-autofocus onClick={() => { setMsg(null); setR(r + 1); }}>{r + 1 >= rounds.length ? "Finish ▶" : "Next ▶"}</button>}
    </Shell>
  );
}

const RECIPES = [
  { name: "Bread", steps: [["🌾", "flour"], ["💧", "water"], ["🧂", "salt"], ["🔥", "oven"]] },
  { name: "Pancakes", steps: [["🥚", "egg"], ["🥛", "milk"], ["🌾", "flour"], ["🍳", "pan"]] },
  { name: "Fruit Pie", steps: [["🌾", "flour"], ["🧈", "butter"], ["🍎", "apple"], ["🔥", "oven"]] },
];
const POOL: [string, string][] = [["🌾", "flour"], ["💧", "water"], ["🧂", "salt"], ["🔥", "oven"], ["🥚", "egg"], ["🥛", "milk"], ["🧈", "butter"], ["🍎", "apple"], ["🍳", "pan"]];

/** Follow the recipe: tap ingredients in the right order (sequencing). */
function Bakery({ onDone, onQuit }: { onDone: (g: number) => void; onQuit: () => void }) {
  const [ri, setRi] = useState(0);
  const [k, setK] = useState(0);
  const [score, setScore] = useState(0);
  const [miss, setMiss] = useState<string | null>(null);
  const pool = useMemo(() => shuffle(POOL), []);
  const missedBefore = useRef(false);
  const rec = RECIPES[ri];
  const finished = rec && k >= rec.steps.length;
  useEffect(() => { if (rec) speak(null, `Let's make ${rec.name}! Follow the recipe.`, { caption: false }); }, [ri]); // eslint-disable-line
  if (!rec) return <Shell title="🥖 Bakery" onQuit={onQuit}><Win gold={score * 4} text={`You baked ${score} perfect ${score === 1 ? "treat" : "treats"}!`} onDone={() => onDone(score * 4)} /></Shell>;
  const tap = (e: string) => {
    if (finished) return;
    if (e === rec.steps[k][0]) {
      sfx("pop", { rate: 1 + k * 0.1 }); haptic();
      setMiss(null);
      if (k + 1 >= rec.steps.length) { if (!missedBefore.current) setScore(score + 1); sfx("good"); }
      setK(k + 1);
    } else { sfx("hmm"); missedBefore.current = true; setMiss(`Not yet. Look at the next picture: ${rec.steps[k][1]}.`); }
  };
  const next = () => { setRi(ri + 1); setK(0); setMiss(null); missedBefore.current = false; };
  return (
    <Shell title="🥖 Bakery" onQuit={onQuit}>
      <p className="big display">Make: {rec.name}</p>
      <div className="recipe" aria-label={`Recipe: ${rec.steps.map((s) => s[1]).join(", then ")}`}>
        {rec.steps.map((s, i) => <span key={i} className={i < k ? "done" : i === k ? "next" : ""} aria-hidden="true">{i < k ? "✅" : s[0]}</span>)}
      </div>
      {finished ? (
        <>
          <p className="med display pos" role="status">Yum! All done! 😋</p>
          <button className="btn gold" data-autofocus onClick={next}>{ri + 1 >= RECIPES.length ? "Finish ▶" : "Next recipe ▶"}</button>
        </>
      ) : (
        <>
          <p className={"med display " + (miss ? "neg" : "")} role="status">{miss ?? "Tap the next one:"}</p>
          <div className="coins-row">{pool.map(([e, n]) => <button key={e} className="chip" style={{ fontSize: "calc(var(--u)*4)" }} onClick={() => tap(e)} aria-label={n}>{e}</button>)}</div>
        </>
      )}
    </Shell>
  );
}

export function Minigame({ id }: { id: string }) {
  const finish = useGame((s) => s.finishMinigame);
  const close = useGame((s) => s.openMinigame);
  const done = (g: number) => finish(id, g);
  const quit = () => close(null);
  if (id === "coins") return <CoinCounter onDone={done} onQuit={quit} />;
  if (id === "compare") return <PriceCompare onDone={done} onQuit={quit} />;
  if (id === "bakery") return <Bakery onDone={done} onQuit={quit} />;
  return null;
}
