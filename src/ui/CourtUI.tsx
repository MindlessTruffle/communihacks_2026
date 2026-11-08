import { useCallback, useEffect, useRef, useState } from "react";
import { useGame } from "../game/store.ts";
import { CARD_BY_ID } from "../game/content/cards.ts";
import { CHARACTERS } from "../game/content/characters.ts";
import { ITEMS } from "../game/content/economy.ts";
import { ADVISOR } from "../game/content/advisor.ts";
import { checkChoice } from "../game/sim/sim.ts";
import { speak, stopVoice, sfx } from "../audio/audio.ts";
import { haptic } from "../platform/device.ts";
import { useAnchors } from "../scenes/anchors.ts";
import { CoinIcon, Continue, EmoIco, Hint, Ico } from "./icons.tsx";
import { useNotebook } from '../game/notebook.ts';

/** Everything that must never be covered by the decision bubble (measured live, so it works at any size / text size). */
const OBSTACLES = ".phase-dots, .corner-btn, .stats, .speech, .advisor-tip, .hint-pill, .captions, .wallet, .list-pin";
type R = { l: number; t: number; r: number; b: number };
const ix = (a: R, b: R) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
/** Approximate screen-% position of the visitor's head (they stand in the same spot at every aspect ratio: ~83% x, ~55% y).
 * There is no visitor anchor in useAnchors and the scene files are off limits, so this is a fixed estimate, not a projection. */
const VISITOR: [number, number] = [83, 58];
/** The court scene is fitted to the viewport roughly like a 1.6:1 frame, so character sizes follow S = min(W/1.6, H) (not W or H alone). */
const sceneS = (W: number, H: number) => Math.min(W / 1.6, H);
const headSize = (W: number, H: number) => Math.max(22, sceneS(W, H) * 0.065);

/** Rects (px) the UI must keep clear: the king (head + throne body), the owl (head + body) and the visitor (head + body). */
function scenePeople(W: number, H: number): { king: R; owl?: R; visitor: R } {
  const S = sceneS(W, H), hs = headSize(W, H);
  const k = useAnchors.getState().ruler; const kx = (k[0] / 100) * W, ky = (k[1] / 100) * H;
  const king = { l: kx - S * 0.14, t: ky - hs, r: kx + S * 0.14, b: ky + S * 0.27 };
  const o = (useAnchors.getState() as unknown as { owl?: [number, number] }).owl;
  const owl = o ? { l: (o[0] / 100) * W - S * 0.07, t: (o[1] / 100) * H - hs, r: (o[0] / 100) * W + S * 0.07, b: (o[1] / 100) * H + S * 0.14 } : undefined;
  const vx = (VISITOR[0] / 100) * W, vy = (VISITOR[1] / 100) * H;
  return { king, owl, visitor: { l: vx - S * 0.07, t: vy - hs, r: vx + S * 0.07, b: vy + S * 0.2 } };
}

/** Keeps a panel clear of the owl and the visitor by narrowing it from the left (it is anchored top-right). Re-runs on any resize / layout change. */
function useAvoidScene(ref: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    let raf = 0, sig0 = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current; if (!el) return;
      const W = innerWidth, H = innerHeight;
      const sig = [W, H, el.scrollHeight, document.documentElement.style.getPropertyValue("--ud"), el.textContent?.length].join("/");
      if (sig === sig0) return; sig0 = sig;
      el.style.maxWidth = "";
      const r = el.getBoundingClientRect();
      const p = scenePeople(W, H);
      let maxW = Infinity;
      for (const o of [p.owl, p.visitor]) {
        if (o && r.bottom > o.t && r.top < o.b && o.r > r.left && o.l < r.right) maxW = Math.min(maxW, r.right - o.r - 8);
      }
      if (maxW !== Infinity) el.style.maxWidth = Math.max(maxW, Math.min(260, W * 0.3)) + "px";
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [ref]);
}

export function SpeechPanel({ who, text, extra, onReplay, tag }: { who: string; text: string; extra?: React.ReactNode; onReplay?: () => void; tag?: string }) {
  const ch = CHARACTERS[who];
  const ref = useRef<HTMLDivElement>(null);
  useAvoidScene(ref);
  return (
    <div ref={ref} className="speech panel bounce" key={who + text} role="dialog" aria-live="polite" aria-label={`${ch?.name}: ${text}`}>
      {onReplay && <button className="replay" onClick={onReplay} aria-label="Hear it again"><Ico name="speaker" fallback="🔊" /></button>}
      <div className="name" style={{ color: ch?.color }}>{ch?.name}</div>
      <div className="text">{text}</div>
      {extra}
      {tag ? <div className="tag">{tag}</div> : null}
    </div>
  );
}

/** Compact decision card near the king. Re-measured every frame and on every rc-device / resize (zoom, rotate, DPR): picks the closest spot that
 * is inside the viewport and covers none of the HUD, the king, the owl or the visitor. If no clear spot exists at full size it switches to
 * the icon-only compact form (labels stay as aria-label / tooltip) and searches again. */
export function DecisionBubble({ anchor, children }: { anchor: [number, number]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor); anchorRef.current = anchor;
  useEffect(() => {
    let raf = 0; let last = ""; let sig0 = "";
    const force = () => { sig0 = ""; };
    window.addEventListener("rc-device", force); window.addEventListener("resize", force);
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current; if (!el) return;
      const W = window.innerWidth, H = window.innerHeight, pad = 8;
      const ax = (anchorRef.current[0] / 100) * W, ay = (anchorRef.current[1] / 100) * H;
      const hud: R[] = [];
      document.querySelectorAll(OBSTACLES).forEach((o) => {
        const rc = o.getBoundingClientRect(); const cs = getComputedStyle(o);
        if (rc.width > 2 && rc.height > 2 && cs.visibility !== "hidden" && cs.display !== "none") hud.push({ l: rc.left - 6, t: rc.top - 6, r: rc.right + 6, b: rc.bottom + 6 });
      });
      const owlA = (useAnchors.getState() as unknown as { owl?: [number, number] }).owl;
      const sig = [W, H, Math.round(ax), Math.round(ay), Math.round((owlA?.[0] ?? 0) * 10), el.textContent?.length, document.documentElement.style.getPropertyValue("--ud"),
        hud.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(".")).join("|")].join("/");
      if (sig === sig0) return; sig0 = sig;
      const p = scenePeople(W, H);
      const obs = [...hud, p.king, p.visitor, ...(p.owl ? [p.owl] : [])];
      const gap = Math.max(10, W * 0.012);
      const side = owlA && (owlA[0] / 100) * W >= ax ? -1 : 1;
      const search = (compact: boolean) => {
        el.dataset.compact = compact ? "1" : "0";
        const w = el.offsetWidth, h = el.offsetHeight;
        const px = side > 0 ? p.king.r + gap * 0.3 : p.king.l - gap * 0.3 - w, py = ay - h * 0.8;
        let best = { x: px, y: py, s: Infinity, ov: Infinity };
        const maxX = Math.max(pad, W - w - pad), maxY = Math.max(pad, H - h - pad);
        const step = Math.max(8, Math.round(Math.min(W, H) / 60));
        for (let y = pad; y <= maxY; y += step) for (let x = pad; x <= maxX; x += step) {
          const r: R = { l: x, t: y, r: x + w, b: y + h };
          let ov = 0; for (const o of obs) ov += ix(r, o);
          const sc = ov * 1000 + Math.hypot(x - px, y - py);
          if (sc < best.s) best = { x, y, s: sc, ov };
        }
        return best;
      };
      let best = search(false);
      if (best.ov > 0) {
        const c = search(true);
        if (c.ov < best.ov) best = c; else search(false);
      }
      const key = Math.round(best.x) + "," + Math.round(best.y);
      if (key !== last) { last = key; el.style.left = Math.round(best.x) + "px"; el.style.top = Math.round(best.y) + "px"; }
      el.style.visibility = "visible";
    };
    tick();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("rc-device", force); window.removeEventListener("resize", force); };
  }, []);
  return <div className="thought" ref={ref} style={{ left: 0, top: 0, visibility: "hidden" }}>{children}</div>;
}

export function AdvisorTip({ text, real, wise, onNext }: { text: string; real?: string; wise?: boolean; onNext: () => void }) {
  return (
    <div className="advisor-tip panel" onClick={onNext} role="button" aria-label={`Sage Ollie says: ${text} ${real ?? ""}. Tap to continue.`}>
      <div className="badge">{wise === undefined ? <Ico name="owl" fallback="🦉" /> : wise ? <Ico name="star" fallback="🌟" /> : <Ico name="bulb" fallback="💡" />}</div>
      <div>
        <div className="who">Sage Ollie</div>
        <div className="med display">{text}</div>
        {real && <div className="real"><Ico name="house" fallback="🏠" /> {real}</div>}
        <div className="tap-hint"><Continue /></div>
      </div>
    </div>
  );
}

export function CourtUI() {
  const notebookOpen = useNotebook(s => s.open);
  const run = useGame((s) => s.run)!;
  const anchor = useAnchors((s) => s.ruler);
  const step = useGame((s) => s.courtStep);
  const outcome = useGame((s) => s.outcome);
  const decide = useGame((s) => s.decide);
  const afterReply = useGame((s) => s.afterReply);
  const afterAdvisor = useGame((s) => s.afterAdvisor);
  const endCourt = useGame((s) => s.endCourt);

  const [advisorLine, setAdvisorLine] = useState<{ text: string; real?: string; wise?: boolean } | null>(null);
  const greeted = useRef(0);

  const card = step === "ask" ? CARD_BY_ID[run.queue[0]] : outcome ? CARD_BY_ID[outcome.cardId] : undefined;

  // Day-start greeting from the advisor (once per day), and upkeep reminders.
  useEffect(() => {
    if (greeted.current === run.day) return;
    greeted.current = run.day;
    const d = run.day % 7;
    const line = d === 6 ? ADVISOR.upkeepTomorrow : d >= 4 ? ADVISOR.upkeepSoon : run.gold < 60 ? ADVISOR.lowGold : run.happiness < 30 ? ADVISOR.lowHappy
      : ADVISOR.dayStart[run.day % ADVISOR.dayStart.length];
    setAdvisorLine({ text: line });
    speak("advisor", line);
  }, [run.day, run.gold, run.happiness]);

  // Voice for each step.
  useEffect(() => {
    if (notebookOpen) return;
    if (step === "ask" && card) { setAdvisorLine(null); speak(card.who, card.ask); }
    if (step === "reply" && outcome) {
      let cancelled = false;
      speak(card!.who, outcome.line).then(() => { if (!cancelled) setTimeout(() => !cancelled && useGame.getState().courtStep === "reply" && afterReply(), 700); });
      return () => { cancelled = true; };
    }
    if (step === "advisor" && outcome?.lesson) {
      const l = outcome.lesson;
      sfx(l.wise ? "fanfare" : "hmm", { volume: 0.6 });
      speak("advisor", l.text).then(() => { if (useGame.getState().courtStep === "advisor") speak("advisor", l.realLife); });
    }
    if (step === "done") { speak("advisor", ADVISOR.courtDone); }
  }, [step, notebookOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = useCallback((c: "yes" | "no") => {
    if (step !== "ask" || !card) return;
    const chk = checkChoice(run, card, c);
    if (!chk.ok) { sfx("hmm"); speak("advisor", ADVISOR.cantAfford); haptic("soft"); return; }
    stopVoice();
    sfx(c === "yes" ? "yes" : "no");
    haptic("medium");
    decide(c);
  }, [step, card, run, decide]);

  const next = useCallback(() => {
    stopVoice();
    if (step === "reply") afterReply();
    else if (step === "advisor") afterAdvisor();
    else if (step === "done") { sfx("dayDone"); endCourt(); }
    else if (advisorLine) setAdvisorLine(null);
  }, [step, afterReply, afterAdvisor, endCourt, advisorLine]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector(".notebook")) return;
      const k = e.key.toLowerCase();
      if (k === "y" || k === "arrowleft") choose("yes");
      else if (k === "n" || k === "arrowright") choose("no");
      else if (k === " " || k === "enter") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choose, next]);

  const yes = card && step === "ask" ? checkChoice(run, card, "yes") : null;
  const no = card && step === "ask" ? checkChoice(run, card, "no") : null;

  return (
    <div className="layer" onClick={(e) => { if (e.target === e.currentTarget) next(); }}>
      {card && (step === "ask" || step === "reply") && (
        <SpeechPanel
          who={card.who}
          text={step === "ask" ? card.ask : outcome!.line}
          onReplay={() => speak(card.who, step === "ask" ? card.ask : outcome!.line)}
        />
      )}

      {/* Sort-the-Court style decision bubble beside the ruler (placement avoids HUD / king / owl / visitor),
          with the gummy branch's price shown under Yes. */}
      {step === "ask" && card && (
        <DecisionBubble anchor={anchor}>
          <div className="choice">
            <button className="btn yes" onClick={() => choose("yes")} disabled={!yes?.ok} aria-label={`Yes: ${card.yesLabel ?? "Yes"}`} title={card.yesLabel ?? "Yes"}><Ico name="check" fallback="✓" /><Hint k="yes" /></button>
            <div className="lbl">{card.yesLabel ?? "Yes"}</div>
            {(yes?.cost ?? card.cost) ? <div className="choice-price"><CoinIcon /> {yes?.cost ?? card.cost}</div> : null}
            {yes && !yes.ok && <div className="need">Need {yes.cost} <Ico name="coin" fallback="🪙" /></div>}
            {yes?.pay === "credit" && <div className="need"><Ico name="card" fallback="💳" /> card</div>}
            {yes?.pay === "item" && <div className="lbl">use <EmoIco e={ITEMS[card.orItem!]?.icon} /></div>}
          </div>
          <div className="choice">
            <button className="btn no" onClick={() => choose("no")} disabled={!no?.ok} aria-label={`No: ${card.noLabel ?? "No"}`} title={card.noLabel ?? "No"}><Ico name="cross" fallback="✗" /><Hint k="no" /></button>
            <div className="lbl">{card.noLabel ?? "No"}</div>
          </div>
        </DecisionBubble>
      )}

      {step === "advisor" && outcome?.lesson && (
        <AdvisorTip text={outcome.lesson.text} real={outcome.lesson.realLife} wise={outcome.lesson.wise} onNext={next} />
      )}
      {step !== "advisor" && step !== "done" && advisorLine && (
        <AdvisorTip text={advisorLine.text} onNext={() => setAdvisorLine(null)} />
      )}
      {step === "done" && (
        <div className="center" style={{ background: "transparent" }}>
          <div className="card panel">
            <div className="ribbon">That's everyone!</div>
            <p className="med display">The court is closed for today.</p>
            <div className="footer"><button className="btn gold hero" onClick={next} autoFocus><Ico name="sun" fallback="☀️" /> See the day <span className="go">▶</span></button></div>
          </div>
        </div>
      )}
      {step === "reply" && <div className="hint-pill panel" style={{ bottom: "calc(var(--u)*2)" }}><Continue /></div>}
    </div>
  );
}
