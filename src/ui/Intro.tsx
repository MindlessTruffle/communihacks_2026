import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { create } from "zustand";
import "./intro.css";
import { useGame } from "../game/store.ts";
import { speak, sfx, stopVoice } from "../audio/audio.ts";
import { Ico } from "./icons.tsx";

// --- "How to play": a 3-step parchment scroll hosted by Sage Ollie. Shown once per device (localStorage rc-intro-seen), replayable via openIntro(). ---

const SEEN_KEY = "rc-intro-seen";
const readSeen = () => { try { return localStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };

interface IntroStore { open: boolean; seen: boolean; show: () => void; close: () => void }
const useIntro = create<IntroStore>((set) => ({
  open: false,
  seen: readSeen(),
  show: () => set({ open: true }),
  close: () => { try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ } set({ open: false, seen: true }); },
}));

/** Open the tutorial from anywhere (admin panel "Replay tutorial", etc.). */
export function openIntro(): void { useIntro.getState().show(); }

/**
 * App hook: true while the first-ever court of a new reign should wait for the intro (Morning is not mounted
 * until it is done, so its voice and keys never collide with Ollie's). Opens the intro as a side effect.
 */
export function useIntroGate(phase: string, day: number | undefined): boolean {
  const open = useIntro((s) => s.open);
  const seen = useIntro((s) => s.seen);
  const eligible = phase === "morning" && (day ?? 99) <= 1 && !seen;
  useLayoutEffect(() => { if (eligible && !useIntro.getState().open) useIntro.getState().show(); }, [eligible]);
  return open || eligible;
}

// ------------------------------------------------------------------ doodle helpers
const INK = "#2b2118";
const v = (o: Record<string, string | number>) => o as unknown as CSSProperties;

/** A hand-inked path that draws itself; optional soft colour fill fades in as the line finishes. */
function P({ d, fill, delay = 0, dur = 0.8, w = 3.4, stroke = INK, dash }: { d: string; fill?: string; delay?: number; dur?: number; w?: number; stroke?: string; dash?: string }) {
  return (
    <>
      {fill && <path d={d} fill={fill} stroke="none" className="fl" style={v({ "--d": `${delay + dur * 0.7}s` })} />}
      <path d={d} pathLength={1} fill="none" stroke={stroke} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
        className="dr" strokeDasharray={dash} style={v({ "--d": `${delay}s`, "--dur": `${dur}s` })} />
    </>
  );
}
const G = ({ cls, delay = 0, children, style }: { cls: string; delay?: number; children: ReactNode; style?: CSSProperties }) => (
  <g className={cls} style={{ ...v({ "--d": `${delay}s` }), ...style }}>{children}</g>
);
const SPARK = "M0 -9 L2.4 -2.4 L9 0 L2.4 2.4 L0 9 L-2.4 2.4 L-9 0 L-2.4 -2.4 Z";
const Spark = ({ x, y, delay, s = 1 }: { x: number; y: number; delay: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}><G cls="pop twinkle" delay={delay}><path d={SPARK} fill="#ffd84a" stroke={INK} strokeWidth={2.2} strokeLinejoin="round" /></G></g>
);
const Img = ({ n, x, y, s, delay, cls = "pop" }: { n: string; x: number; y: number; s: number; delay: number; cls?: string }) => (
  <G cls={cls} delay={delay}><image href={`/ui/icons/${n}.png`} x={x} y={y} width={s} height={s} /></G>
);


// ------------------------------------------------------------------ the three scenes (viewBox 200 x 140)
function Ruler() {
  return (<>
    <g transform="translate(-34 14) scale(.8)">
      <P d="M74 92 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0" fill="#ffe0b8" delay={0.1} dur={0.9} />
      <P d="M50 140 Q56 120 100 118 Q144 120 150 140" fill="#7fb3e8" delay={0.6} dur={0.6} />
      <P d="M91 89 v3 M109 89 v3" w={4.6} delay={1} dur={0.2} />
      <P d="M89 101 Q100 111 111 101" delay={1.1} dur={0.3} />
      <G cls="drop" delay={1.4}>
        <path d="M74 68 L78 40 L91 54 L100 34 L109 54 L122 40 L126 68 Z" fill="#f6c23a" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" />
        <path d="M77 61 H123" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        <circle cx="100" cy="50" r="3.2" fill="#e5484d" stroke={INK} strokeWidth={1.6} />
      </G>
    </g>
    <P d="M88 12 H166 Q178 12 178 24 V40 Q178 52 166 52 H116 L100 66 L104 52 H88 Q76 52 76 40 V24 Q76 12 88 12 Z" fill="#fffaf0" delay={1.7} dur={0.8} />
    <P d="M118 25 Q118 19 127 19 Q136 19 136 27 Q136 32 127 36 V39 M127 46 v1" w={4} delay={2.3} dur={0.5} />
    <G cls="pop press" delay={2.6}>
      <circle cx="108" cy="104" r="19" fill="#3cb878" stroke={INK} strokeWidth={3.4} />
      <path d="M98 104 L105 112 L119 95" fill="none" stroke="#fff" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
    </G>
    <G cls="pop press2" delay={2.9}>
      <path d="M142 86 H166 Q174 86 174 94 V116 Q174 124 166 124 H142 Q134 124 134 116 V94 Q134 86 142 86 Z" fill="#e2683f" stroke={INK} strokeWidth={3.4} />
      <path d="M145 96 L163 114 M163 96 L145 114" fill="none" stroke="#fff" strokeWidth={5.5} strokeLinecap="round" />
    </G>
    <Spark x={24} y={22} delay={3.3} s={0.9} /><Spark x={186} y={80} delay={3.5} s={0.7} />
  </>);
}

function Watch() {
  const items = [["people", "People", 18], ["happy", "Happy", 83], ["coin", "Gold", 148]] as const;
  return (<>
    {items.map(([n, label, x], i) => (
      <g key={n}>
        <Img n={n} x={x} y={2} s={34} delay={0.2 + i * 0.5} cls="pop wig" />
        <G cls="fade" delay={0.6 + i * 0.5}><text x={x + 17} y="49" className="lbl small" textAnchor="middle">{label}</text></G>
      </g>
    ))}
    <P d="M10 60 Q100 66 190 59" w={2.6} delay={1.8} dur={0.7} />
    <Img n="bread" x={20} y={70} s={46} delay={2.2} />
    <Img n="cake" x={128} y={70} s={46} delay={2.9} cls="pop dim" />
    <G cls="pop" delay={3.0}>
      <circle cx="64" cy="76" r="11" fill="#3cb878" stroke={INK} strokeWidth={2.8} />
      <path d="M58 76 L62 81 L71 70" fill="none" stroke="#fff" strokeWidth={3.8} strokeLinecap="round" strokeLinejoin="round" />
    </G>
    <P d="M82 100 H110 M102 94 L110 100 L102 106" w={3} delay={3.2} dur={0.5} />
    <G cls="fade" delay={3.4}><text x="43" y="132" className="lbl" textAnchor="middle">Needs</text></G>
    <G cls="fade" delay={3.8}><text x="151" y="132" className="lbl" textAnchor="middle">Wants</text></G>
  </>);
}

function Plan() {
  const rows = [38, 66, 94];
  return (<>
    <P d="M10 12 H86 Q94 12 94 20 V128 H18 Q10 128 10 120 Z" fill="#fffaf0" delay={0.1} dur={0.9} />
    <P d="M22 27 H74" w={3.4} delay={0.9} dur={0.3} />
    {rows.map((y, i) => (
      <g key={y}>
        <P d={`M20 ${y} h13 v13 h-13 Z`} w={2.8} delay={1.1 + i * 0.25} dur={0.3} />
        <P d={`M42 ${y + 7} H82`} w={3} delay={1.2 + i * 0.25} dur={0.3} />
        <P d={`M21 ${y + 6} L26 ${y + 12} L35 ${y - 3}`} w={4.2} stroke="#2f9e5e" delay={2.0 + i * 0.9} dur={0.35} />
      </g>
    ))}
    <G cls="pen" delay={0}><path d="M0 0 L5 -6 L24 -25 L31 -18 L11 1 Z M24 -25 L31 -18" fill="#e5484d" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" /></G>
    <g transform="translate(79 52) scale(.62)">
      <P d="M70 34 H130 M72 34 Q60 46 60 70 V118 Q60 130 72 130 H128 Q140 130 140 118 V70 Q140 46 128 34" w={4.2} fill="#e8f3f5" delay={3.2} dur={0.8} />
      {[[84, 118], [116, 118], [100, 118], [92, 104], [108, 104], [100, 90]].map(([x, y], i) => (
        <G key={i} cls="coin" delay={3.9 + i * 0.3}>
          <circle cx={x} cy={y} r="10.5" fill="#ffd84a" stroke={INK} strokeWidth={3} />
          <path d={`M${x - 4} ${y} h8`} stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
        </G>
      ))}
    </g>
    <P d="M172 112 V44 M159 58 L172 42 L185 58" w={4.4} stroke="#2f9e5e" delay={5.6} dur={0.7} />
    <Spark x={130} y={26} delay={6.2} s={0.9} /><Spark x={104} y={40} delay={6.4} s={0.6} />
  </>);
}

interface Step { lines: string[]; scene: () => ReactNode; cues: [number, string, number?][] }
const STEPS: Step[] = [
  { lines: ["You are the ruler!", "People ask for help.", "Tap ✓ or ✗."], scene: Ruler,
    cues: [[250, "scribble"], [1550, "boing"], [2650, "yes"], [2950, "no"], [3350, "sparkle"]] },
  { lines: ["Watch your people, happiness and gold.", "Needs first. Wants later."], scene: Watch,
    cues: [[300, "pop", 0.9], [800, "pop", 1.05], [1300, "pop", 1.2], [2300, "pop"], [3000, "good"], [3400, "scribble"]] },
  { lines: ["At night, make a shopping list.", "Stick to your budget.", "Save gold, and your kingdom grows!"], scene: Plan,
    cues: [[150, "page"], [1000, "scribble"], [2100, "tick"], [3000, "tick"], [3900, "tick"], [4300, "coinIn"], [4900, "coinIn"], [5700, "growth"]] },
];

// ------------------------------------------------------------------ Esc skips the intro before App's pause-menu handler sees it (module-level capture listener)
const esc = { skip: null as null | (() => void) };
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (!esc.skip) return;
    if (e.key === "Escape") { e.stopImmediatePropagation(); e.preventDefault(); if (!e.repeat) esc.skip(); }
  }, true);
}

export function Intro() {
  const open = useIntro((s) => s.open);
  return open ? <IntroScroll /> : null;
}

const OPEN_MS = 950, ROLL_MS = 700, CLOSE_MS = 750;

function IntroScroll() {
  const close = useIntro((s) => s.close);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(-1); // highest step whose doodle + text have started animating
  const [closing, setClosing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const stepRef = useRef(0);
  const closingRef = useRef(false);
  const lastGo = useRef(0);
  stepRef.current = step;
  const last = step === STEPS.length - 1;

  const finish = useCallback((done: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    stopVoice();
    sfx(done ? "sparkle" : "scrollClose");
    if (done) window.setTimeout(() => sfx("scrollClose"), 150);
    setClosing(true);
    window.setTimeout(close, reduce ? 220 : CLOSE_MS);
  }, [close, reduce]);

  const next = useCallback(() => {
    if (closingRef.current) return;
    const now = performance.now();
    if (now - lastGo.current < (reduce ? 120 : 420)) return; // ignore double taps while the paper is still rolling
    lastGo.current = now;
    const n = stepRef.current + 1;
    if (n >= STEPS.length) finish(true); else setStep(n);
  }, [finish, reduce]);

  useEffect(() => { esc.skip = () => finish(false); return () => { esc.skip = null; stopVoice(); }; }, [finish]);

  // Keys: Space / Enter / -> = Next (gamepad A arrives as Enter). y / n / <- / Backspace are swallowed (pad B arrives as "n"): nothing to go back to.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const key = e.key;
      const mine = key === "Enter" || key === " " || key === "ArrowRight" || key === "ArrowLeft" || key === "y" || key === "n" || key === "Backspace";
      if (!mine) return;
      if ((key === "Enter" || key === " ") && t?.closest?.("[data-native]")) return; // a focused Skip link does its own click
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.repeat) return;
      if (key === "Enter" || key === " " || key === "ArrowRight") next();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [next]);
  useEffect(() => {
    const b = (e: Event) => e.stopImmediatePropagation(); // rc-back (gamepad B): swallow, there is no Back
    window.addEventListener("rc-back", b, true);
    return () => window.removeEventListener("rc-back", b, true);
  }, []);

  // Per step: paper sound, doodle starts once the paper has rolled into place, SFX cues timed to the doodle, Ollie's voice.
  useEffect(() => {
    const base = reduce ? 0 : step === 0 ? OPEN_MS - 150 : ROLL_MS - 100;
    const ids: number[] = [];
    const at = (ms: number, f: () => void) => { ids.push(window.setTimeout(f, ms)); };
    sfx(step === 0 ? "scrollOpen" : "scrollWind");
    if (!reduce && step === 0) at(OPEN_MS - 80, () => sfx("woodThunk"));
    if (!reduce && step > 0) at(ROLL_MS - 60, () => sfx("woodThunk", { volume: 0.6 }));
    at(base, () => setShown((s) => Math.max(s, step)));
    const cues = reduce ? STEPS[step].cues.slice(0, 1).map(([, n, r]) => [0, n, r] as [number, string, number?]) : STEPS[step].cues;
    cues.forEach(([ms, name, rate]) => at(base + ms, () => sfx(name, rate ? { rate } : {})));
    at(base, () => {
      setSpeaking(true);
      void speak("advisor", STEPS[step].lines.join(" "), { caption: false }).then(() => { if (stepRef.current === step) setSpeaking(false); });
    });
    return () => ids.forEach(window.clearTimeout);
  }, [step, reduce]);

  const cur = STEPS[step];
  const cls = "sc" + (reduce ? " rm" : "") + (closing ? " closing" : "");
  return (
    <div className={cls} style={v({ "--step": step })} role="dialog" aria-modal="true" aria-label="How to play">
      <div className="sc-wrap">
        <div className="sc-rod top"><i className="coil" /><i className="peg l" /><i className="peg r" /></div>
        <div className="sc-paper" onClick={next}>
          <div className="sc-view">
            <div className="sc-reel">
              {STEPS.map((s, i) => {
                const Scene = s.scene;
                return (
                  <section key={i} className={"sc-page" + (shown >= i ? " go" : "")} aria-hidden={i !== step} aria-live={i === step ? "polite" : undefined}>
                    <div className="sc-stage"><svg viewBox="0 0 200 140" role="img" aria-label={s.lines.join(" ")}>
                      <defs>
                        <filter id={"sc-wobble" + i} x="-5%" y="-5%" width="110%" height="110%">
                          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="t" />
                          <feDisplacementMap in="SourceGraphic" in2="t" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
                        </filter>
                      </defs>
                      {shown >= i && <g filter={`url(#sc-wobble${i})`}><Scene /></g>}
                    </svg></div>
                    <div className="sc-text">{s.lines.map((l, j) => <p key={j} style={v({ "--i": j })}>{l}</p>)}</div>
                  </section>
                );
              })}
            </div>
          </div>
          <div className="sc-foot">
            <div className={"sc-ollie" + (speaking ? " talk" : "")} aria-hidden="true"><Ico name="owl" fallback="🦉" /></div>
            <button className="sc-next" onClick={(e) => { e.stopPropagation(); e.currentTarget.blur(); sfx("click"); next(); }}>
              {last ? "Let's go!" : "Next"} <span aria-hidden="true">▶</span>
            </button>
            <button data-native className="sc-skip" onClick={(e) => { e.stopPropagation(); sfx("click"); finish(false); }}>Skip</button>
          </div>
        </div>
        <div className="sc-rod bottom">
          <i className="coil" /><i className="peg l" /><i className="peg r" />
          <div className="sc-pips" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}: ${cur.lines[0]}`}>
            {STEPS.map((_, i) => <b key={i} className={i === step ? "on" : i < step ? "done" : ""} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
