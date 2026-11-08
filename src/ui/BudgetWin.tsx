// Budget-win cutscene: (1) 3D shot of the ruler walking out of the market with the basket (MarketScene#WinShot),
// (2) shopping-list parchment, a quill crosses off each bought item, (3) "Stuck to the budget!" stamp + savings reward.
// Skip: tap / click / Space / Enter / gamepad A = jump to the next beat, Esc = skip all. Reduce-motion = short crossfade.
import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/store.ts";
import { MARKET_BY_ID } from "../game/content/economy.ts";
import { ADVISOR } from "../game/content/advisor.ts";
import { sfx, speak, stopVoice } from "../audio/audio.ts";
import { haptic } from "../platform/device.ts";
import { FoodIco, Ico } from "./icons.tsx";
import { ITEM_EMOJI } from "./BudgetScroll.tsx";
import "./budgetwin.css";

// ---- tiny effect helpers (kept local and minimal so they can be swapped for src/fx/vfx.ts later) ----
const SPARKS = ["#ffe27a", "#fff3b8", "#ffb347", "#ffffff"];
/** Falling confetti bits inside the overlay. */
function Confetti({ n = 22 }: { n?: number }) {
  return (
    <div className="bw-confetti" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: SPARKS[i % 4], animationDelay: `${(i % 7) * 70}ms`, animationDuration: `${1300 + (i % 5) * 220}ms`, width: `calc(var(--u) * ${0.7 + (i % 3) * 0.3})` }} />
      ))}
    </div>
  );
}
/** Coins fly from `from` to `to` (Web Animations). */
function flyCoins(from: HTMLElement | null, to: HTMLElement | null, n: number, host: HTMLElement | null) {
  if (!from || !to || !host) return;
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect(), h = host.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("img");
    c.src = "/ui/icons/coin.png"; c.className = "bw-flycoin"; c.alt = "";
    host.appendChild(c);
    const x0 = a.left + a.width / 2 - h.left, y0 = a.top + a.height / 2 - h.top;
    const x1 = b.left + b.width / 2 - h.left, y1 = b.top + b.height / 2 - h.top;
    const mx = (x0 + x1) / 2 + (i % 2 ? 1 : -1) * 30, my = Math.min(y0, y1) - 40;
    const an = c.animate([
      { transform: `translate(${x0}px,${y0}px) scale(.5)`, opacity: 0 },
      { transform: `translate(${mx}px,${my}px) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px,${y1}px) scale(.7)`, opacity: 1 },
    ], { duration: 800, delay: i * 110, easing: "cubic-bezier(.4,0,.6,1)", fill: "both" });
    an.onfinish = () => { c.remove(); sfx("coinIn", { volume: 0.35, rate: 1 + (i % 4) * 0.08 }); };
  }
}

// hand-wobbled strike line (viewBox 0 0 100 12), differs per row
const STRIKES = [
  "M2 7 C20 3 35 10 52 6 S85 4 98 6",
  "M2 5 C18 9 40 2 58 7 S88 8 98 5",
  "M2 8 C25 4 38 9 55 5 S82 9 98 6",
];

export default function BudgetWin() {
  const win = useGame((s) => s.win)!;
  const endWin = useGame((s) => s.endWin);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const speed = useGame((s) => s.settings.gameSpeed) || 1;

  const items = win.list;
  const perfect = win.stars === 3;
  const T3D = reduce ? 0 : 2800;
  const ITEM = reduce ? 90 : 600;
  const itemsStart = T3D + (reduce ? 200 : 300);
  const stampAt = itemsStart + items.length * ITEM + (reduce ? 150 : 350);
  const rewardAt = stampAt + (reduce ? 400 : 850);
  const endAt = rewardAt + (reduce ? 1500 : 2600);
  const marks = [T3D, stampAt, rewardAt, endAt];

  const [t, setT] = useState(0);
  const tRef = useRef(0);
  const last = useRef(performance.now());
  const done = useRef(false);
  const finish = () => { if (done.current) return; done.current = true; stopVoice(); endWin(); };

  // clock
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(64, now - last.current); last.current = now;
      tRef.current += dt * speed; setT(tRef.current);
      if (tRef.current >= endAt) { finish(); return; }
      raf = requestAnimationFrame(loop);
    };
    last.current = performance.now();
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [endAt, speed]); // eslint-disable-line react-hooks/exhaustive-deps

  // input: jump to the next beat
  const advance = () => {
    const nx = marks.find((m) => m > tRef.current + 30);
    if (nx === undefined || nx === endAt) { finish(); return; }
    tRef.current = nx; setT(nx); sfx("click", { volume: 0.4 });
  };
  const adv = useRef(advance); adv.current = advance;
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); finish(); return; }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) adv.current(); }
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // opening line from Sage Ollie (browser TTS fallback; captions come from the audio bus)
  useEffect(() => { speak("advisor", perfect ? ADVISOR.budgetWinPerfect : ADVISOR.budgetWin); return () => stopVoice(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const show3d = t < T3D;
  const crossed = Math.max(0, Math.min(items.length, Math.floor((t - itemsStart) / ITEM) + 1));
  const stamped = t >= stampAt;
  const rewarded = t >= rewardAt;

  // per-item pen scratch + coin/sparkle pop
  const lastCrossed = useRef(0);
  useEffect(() => {
    if (crossed > lastCrossed.current && !show3d) {
      sfx("pen", { volume: 0.35, rate: 1.7 }); sfx("pop", { volume: 0.5, rate: 1.1 + crossed * 0.08 }); haptic("light");
    }
    lastCrossed.current = crossed;
  }, [crossed, show3d]);
  const wasStamped = useRef(false);
  useEffect(() => {
    if (stamped && !wasStamped.current) { wasStamped.current = true; sfx("stamp"); haptic("medium"); sfx(perfect ? "fanfare" : "good", { volume: 0.7 }); }
  }, [stamped, perfect]);

  // reward: coins into the treasury chip, counter ticks up
  const bonusRef = useRef<HTMLLIElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [gold, setGold] = useState(win.goldBefore);
  const didReward = useRef(false);
  useEffect(() => {
    if (!rewarded || didReward.current) return;
    didReward.current = true; sfx("coinOut", { volume: 0.6 }); haptic("success");
    flyCoins(bonusRef.current, chipRef.current, Math.min(win.bonus, 8), hostRef.current);
    const step = Math.max(1, Math.ceil(win.bonus / 8));
    let g = win.goldBefore;
    const id = setInterval(() => { g = Math.min(win.goldAfter, g + step); setGold(g); if (g >= win.goldAfter) clearInterval(id); }, 110);
    setTimeout(() => setGold(win.goldAfter), 1400);
  }, [rewarded]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={"bw" + (show3d ? " s3d" : " paperish") + (reduce ? " calm" : "")} ref={hostRef} role="dialog" aria-label="You stuck to the budget!"
      onPointerDown={(e) => { e.stopPropagation(); advance(); }}>
      {show3d ? (
        <div className="bw-ribbon ribbon">Great shopping!</div>
      ) : (
        <>
          <div className="bw-chip" ref={chipRef} aria-label={`Treasury ${gold} gold`}><Ico name="coin" fallback="🪙" /> <b>{gold}</b></div>
          <div className="bw-paper">
            <div className="bw-cols">
              <div className="bw-list">
                <h3><Ico name="scroll" fallback="📜" /> My list</h3>
                <ul>
                  {items.map((id, i) => {
                    const on = i < crossed;
                    const writing = on && i === crossed - 1 && !stamped;
                    return (
                      <li key={id + i} className={on ? "x" : ""}>
                        <FoodIco id={id} emoji={ITEM_EMOJI[id]} />
                        <span className="nm">{MARKET_BY_ID[id]?.name}</span>
                        <span className="pr">{MARKET_BY_ID[id]?.price} <Ico name="coin" fallback="🪙" /></span>
                        <svg className="strike" viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden>
                          <path d={STRIKES[i % 3]} pathLength={1} style={{ strokeDashoffset: on ? 0 : 1.03, transition: reduce ? "none" : `stroke-dashoffset ${Math.round(ITEM * 0.8 / speed)}ms linear` }} />
                        </svg>
                        {writing && !reduce && <svg key={crossed} className="quill" viewBox="0 0 24 24" aria-hidden style={{ animationDuration: `${Math.round(ITEM * 0.8 / speed)}ms` }}>
                          <path d="M21 2c-7 1-13 6-15 14l-2 5 5-2c8-2 13-8 12-17z" fill="#f4ead2" stroke="#2b2118" strokeWidth="1.6" strokeLinejoin="round" />
                          <path d="M4 21l9-9" stroke="#2b2118" strokeWidth="1.6" strokeLinecap="round" />
                        </svg>}
                        {writing && <span key={"p" + crossed} className="pop" aria-hidden><Ico name="sparkle" fallback="✨" /></span>}
                      </li>
                    );
                  })}
                </ul>
                <div className="bw-sum">Spent <b>{win.spent}</b> of <b>{win.budget}</b> <Ico name="coin" fallback="🪙" /></div>
              </div>
              <div className="bw-right">
                <div className={"bw-stamp" + (stamped ? " in" : "") + (perfect ? " gold" : "")} aria-hidden={!stamped}>
                  <span>Stuck to</span><span>the budget!</span>
                  {perfect && <em>★ ★ ★</em>}
                </div>
                {stamped && <div className="bw-saved">{win.saved > 0 ? <>You saved <b>{win.saved}</b> <Ico name="coin" fallback="🪙" /></> : <>Spent exactly your budget!</>}</div>}
                {rewarded && (
                  <ul className="bw-reward" aria-label="Rewards">
                    <li ref={bonusRef}><Ico name="chest" fallback="🧰" /> Savings bonus <b>+{win.bonus}</b> <Ico name="coin" fallback="🪙" /></li>
                    <li><Ico name="crystal" fallback="💎" /> Responsibility gem <b>+1</b></li>
                    <li><Ico name="star" fallback="⭐" /> Savings streak: <b>{win.streak}</b> {win.streak === 1 ? "night" : "nights in a row"}</li>
                  </ul>
                )}
              </div>
            </div>
          </div>
          {stamped && <Confetti n={perfect ? 34 : 14} />}
        </>
      )}
      <div className="bw-skip" aria-hidden>Tap to hurry · Esc skips</div>
    </div>
  );
}
