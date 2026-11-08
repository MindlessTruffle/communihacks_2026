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

export function SpeechPanel({ who, text, extra, onReplay, tag }: { who: string; text: string; extra?: React.ReactNode; onReplay?: () => void; tag?: string }) {
  const ch = CHARACTERS[who];
  return (
    <div className="speech panel bounce" key={who + text} role="dialog" aria-live="polite" aria-label={`${ch?.name}: ${text}`}>
      {onReplay && <button className="replay" onClick={onReplay} aria-label="Hear it again"><Ico name="speaker" fallback="🔊" /></button>}
      <div className="name" style={{ color: ch?.color }}>{ch?.name}</div>
      <div className="text">{text}</div>
      {extra}
      {tag ? <div className="tag">{tag}</div> : null}
    </div>
  );
}

/** Everything that must never be covered by the decision bubble (measured live, so it works at any bracket / text size). */
const OBSTACLES = ".phase-dots, .corner-btn, .stats, .speech, .advisor-tip, .hint-pill, .captions, .wallet, .list-pin";
type R = { l: number; t: number; r: number; b: number };
const ix = (a: R, b: R) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));

/** Compact thought bubble beside the ruler's head. Re-projected every frame; clamped to the viewport and pushed clear of all HUD rects. */
export function DecisionBubble({ anchor, children }: { anchor: [number, number]; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const anchorRef = useRef(anchor); anchorRef.current = anchor;
  useEffect(() => {
    let raf = 0; let last = ""; let sig0 = "";
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = ref.current; if (!el) return;
      const W = window.innerWidth, H = window.innerHeight, pad = 8;
      const w = el.offsetWidth, h = el.offsetHeight;
      const ax = (anchorRef.current[0] / 100) * W, ay = (anchorRef.current[1] / 100) * H;
      // owl head anchor (useAnchors "owl", added by the scene code): another uncoverable rect; bubble goes to the side away from it
      const owlA = (useAnchors.getState() as unknown as { owl?: [number, number] }).owl;
      const ox = owlA ? (owlA[0] / 100) * W : -1, oy = owlA ? (owlA[1] / 100) * H : -1;
      const gap = Math.max(10, W * 0.012);
      const obs: R[] = [];
      document.querySelectorAll(OBSTACLES).forEach((o) => {
        const rc = o.getBoundingClientRect(); const cs = getComputedStyle(o);
        if (rc.width > 2 && rc.height > 2 && cs.visibility !== "hidden" && cs.display !== "none") obs.push({ l: rc.left - 6, t: rc.top - 6, r: rc.right + 6, b: rc.bottom + 6 });
      });
      const sig = [W, H, w, h, Math.round(ax), Math.round(ay), Math.round(ox), Math.round(oy), obs.map((o) => [o.l, o.t, o.r, o.b].map(Math.round).join(".")).join("|")].join("/");
      if (sig === sig0) return; sig0 = sig;
      const hs = Math.max(36, W * 0.035); // keep the head itself uncovered
      obs.push({ l: ax - hs, t: ay - hs, r: ax + hs, b: ay + hs });
      if (owlA) obs.push({ l: ox - hs, t: oy - hs, r: ox + hs, b: oy + hs });
      // preferred spot: beside the ruler's head, on the side away from the owl (default: right)
      const side = owlA && ox >= ax ? -1 : 1;
      const px = side > 0 ? ax + hs + gap * 0.3 : ax - hs - gap * 0.3 - w, py = ay - h * 0.8;
      let best = { x: px, y: py, s: Infinity };
      const maxX = Math.max(pad, W - w - pad), maxY = Math.max(pad, H - h - pad);
      const step = 12;
      for (let y = pad; y <= maxY; y += step) for (let x = pad; x <= maxX; x += step) {
        const r: R = { l: x, t: y, r: x + w, b: y + h };
        let ov = 0; for (const o of obs) ov += ix(r, o);
        const d = Math.hypot(x - px, y - py);
        const sc = ov * 1000 + d;
        if (sc < best.s) best = { x, y, s: sc };
      }
      const key = Math.round(best.x) + "," + Math.round(best.y);
      if (key !== last) { last = key; el.style.left = Math.round(best.x) + "px"; el.style.top = Math.round(best.y) + "px"; }
      el.style.visibility = "visible";
    };
    tick();
    return () => cancelAnimationFrame(raf);
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
  const run = useGame((s) => s.run)!;
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
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

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
          extra={<>
            {step === "ask" && card && (
        <div className="chat-decisions">
          <div className="choice">
            <button className="btn yes" onClick={() => choose("yes")} disabled={!yes?.ok} aria-label={`Yes: ${card.yesLabel ?? "Yes"}`}><Ico name="check" fallback="✓" /><Hint k="yes" /></button>
            <div className="lbl">{card.yesLabel ?? "Yes"}</div>
            <div className="choice-price"><CoinIcon /> {yes?.cost ?? card.cost ?? 0}</div>
            {yes && !yes.ok && <div className="need">Need {yes.cost} <Ico name="coin" fallback="🪙" /></div>}
            {yes?.pay === "credit" && <div className="need"><Ico name="card" fallback="💳" /> card</div>}
            {yes?.pay === "item" && <div className="lbl">use <EmoIco e={ITEMS[card.orItem!]?.icon} /></div>}
          </div>
          <div className="choice">
            <button className="btn no" onClick={() => choose("no")} disabled={!no?.ok} aria-label={`No: ${card.noLabel ?? "No"}`}><Ico name="cross" fallback="✗" /><Hint k="no" /></button>
            <div className="lbl">{card.noLabel ?? "No"}</div>
          </div>
        </div>
      )}

</>}
        />
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
            <div className="footer"><button className="btn gold" onClick={next} autoFocus>See the day ▶</button></div>
          </div>
        </div>
      )}
      {step === "reply" && <div className="hint-pill panel" style={{ bottom: "calc(var(--u)*2)" }}><Continue /></div>}
    </div>
  );
}
