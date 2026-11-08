import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { create } from "zustand";
import "./intro.css";
import { useGame } from "../game/store.ts";
import { speak, sfx, stopVoice } from "../audio/audio.ts";
import { Ico } from "./icons.tsx";

// --- "How to play": 8 doodle cards hosted by Sage Ollie. Shown once per device (localStorage rc-intro-seen), replayable via openIntro(). ---

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

// ------------------------------------------------------------------ the eight scenes (viewBox 200 x 140)
function Crown() {
  return (<>
    <P d="M74 92 a26 26 0 1 0 52 0 a26 26 0 1 0 -52 0" fill="#ffe0b8" delay={0.1} dur={0.9} />
    <P d="M50 140 Q56 120 100 118 Q144 120 150 140" fill="#7fb3e8" delay={0.6} dur={0.6} />
    <P d="M91 89 v3 M109 89 v3" w={4.6} delay={1} dur={0.2} />
    <P d="M89 101 Q100 111 111 101" delay={1.1} dur={0.3} />
    <G cls="drop" delay={1.4}>
      <path d="M74 68 L78 40 L91 54 L100 34 L109 54 L122 40 L126 68 Z" fill="#f6c23a" stroke={INK} strokeWidth={3.4} strokeLinejoin="round" />
      <path d="M77 61 H123" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <circle cx="100" cy="50" r="3.2" fill="#e5484d" stroke={INK} strokeWidth={1.6} />
    </G>
    <Spark x={48} y={52} delay={2} /><Spark x={154} y={44} delay={2.2} s={1.2} /><Spark x={162} y={96} delay={2.4} s={0.8} />
  </>);
}

function AskYesNo() {
  return (<>
    <P d="M14 140 Q18 106 42 104 Q66 106 70 140" fill="#7fb3e8" delay={0.1} dur={0.6} />
    <P d="M26 84 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0" fill="#ffe0b8" delay={0.3} dur={0.7} />
    <P d="M36 82 v2 M48 82 v2" w={4} delay={0.9} dur={0.2} />
    <P d="M36 91 Q42 96 48 91" w={3} delay={1} dur={0.2} />
    <P d="M30 12 H112 Q124 12 124 24 V42 Q124 54 112 54 H68 L50 66 L54 54 H30 Q18 54 18 42 V24 Q18 12 30 12 Z" fill="#fffaf0" delay={0.9} dur={0.9} />
    <P d="M62 26 Q62 20 71 20 Q80 20 80 28 Q80 33 71 37 V41 M71 48 v1" w={4} delay={1.7} dur={0.5} />
    <G cls="pop press" delay={1.9}>
      <circle cx="128" cy="104" r="19" fill="#3cb878" stroke={INK} strokeWidth={3.4} />
      <path d="M118 104 L125 112 L139 95" fill="none" stroke="#fff" strokeWidth={5.5} strokeLinecap="round" strokeLinejoin="round" />
    </G>
    <G cls="pop press2" delay={2.2}>
      <path d="M158 86 H182 Q190 86 190 94 V116 Q190 124 182 124 H158 Q150 124 150 116 V94 Q150 86 158 86 Z" fill="#e2683f" stroke={INK} strokeWidth={3.4} />
      <path d="M161 96 L179 114 M179 96 L161 114" fill="none" stroke="#fff" strokeWidth={5.5} strokeLinecap="round" />
    </G>
    <text x="128" y="136" className="lbl" textAnchor="middle">Yes</text>
    <text x="170" y="136" className="lbl" textAnchor="middle">No</text>
  </>);
}

function Stats() {
  const items = [["people", "People", 15], ["happy", "Happy", 75], ["coin", "Gold", 135]] as const;
  return (<>
    {items.map(([n, label, x], i) => (
      <g key={n}>
        <Img n={n} x={x} y={24} s={50} delay={0.3 + i * 0.7} cls="pop wig" />
        <P d={`M${x} 88 Q${x + 25} 95 ${x + 50} 87`} delay={0.8 + i * 0.7} dur={0.5} w={3} />
        <G cls="fade" delay={0.9 + i * 0.7}><text x={x + 25} y="112" className="lbl" textAnchor="middle">{label}</text></G>
      </g>
    ))}
    <Spark x={100} y={14} delay={2.6} s={0.8} />
  </>);
}

function NeedWant() {
  return (<>
    <Img n="bread" x={18} y={26} s={62} delay={0.3} />
    <Img n="cake" x={120} y={26} s={62} delay={0.9} cls="pop dim" />
    <G cls="pop" delay={1.7}>
      <circle cx="84" cy="30" r="15" fill="#3cb878" stroke={INK} strokeWidth={3.2} />
      <path d="M76 30 L82 37 L93 23" fill="none" stroke="#fff" strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
    </G>
    <P d="M86 66 Q101 44 116 66 M108 60 L116 66 L120 56" w={3} delay={2.2} dur={0.6} />
    <G cls="fade" delay={1.1}><text x="49" y="104" className="lbl" textAnchor="middle">Need</text></G>
    <G cls="fade" delay={1.5}><text x="151" y="104" className="lbl" textAnchor="middle">Want</text></G>
    <P d="M20 110 Q49 117 78 109" w={3} delay={1.2} dur={0.5} /><P d="M122 110 Q151 117 180 109" w={3} delay={1.6} dur={0.5} />
  </>);
}

function Evening() {
  return (<>
    <P d="M36 46 Q50 18 64 46" w={3} delay={0.1} dur={0.5} />
    <P d="M34 48 H66 L62 56 H38 Z" fill="#8a6a3c" delay={0.4} dur={0.5} />
    <P d="M40 56 H60 Q70 78 66 104 Q66 112 58 112 H42 Q34 112 34 104 Q30 78 40 56 Z" fill="#ffe27a" delay={0.7} dur={0.9} />
    <P d="M36 112 H64 V119 H36 Z" fill="#8a6a3c" delay={1.4} dur={0.4} />
    <G cls="pop flame" delay={1.9}><path d="M50 102 Q40 90 50 74 Q60 90 50 102 Z" fill="#f08a24" stroke={INK} strokeWidth={2.4} strokeLinejoin="round" /></G>
    <G cls="fade rays" delay={2.1}>
      <path d="M50 52 V44 M72 70 L80 66 M28 70 L20 66 M73 100 L81 104 M27 100 L19 104" stroke="#e0a018" strokeWidth={3.4} strokeLinecap="round" />
    </G>
    <P d="M98 14 H168 Q180 14 180 26 V46 Q180 58 168 58 H118 L104 72 L108 58 H98 Q86 58 86 46 V26 Q86 14 98 14 Z" fill="#fffaf0" delay={1.6} dur={0.9} />
    <G cls="pop" delay={2.5}><path d="M133 48 C112 36 118 22 127 26 C131 28 133 31 133 31 C133 31 135 28 139 26 C148 22 154 36 133 48 Z" fill="#ee5b6b" stroke={INK} strokeWidth={2.8} strokeLinejoin="round" /></G>
    <G cls="pop roll" delay={3}>
      <rect x="124" y="86" width="40" height="40" rx="9" fill="#fff" stroke={INK} strokeWidth={3.4} />
      <circle cx="134" cy="96" r="3" fill={INK} /><circle cx="154" cy="96" r="3" fill={INK} /><circle cx="144" cy="106" r="3" fill={INK} />
      <circle cx="134" cy="116" r="3" fill={INK} /><circle cx="154" cy="116" r="3" fill={INK} />
    </G>
  </>);
}

function Market() {
  const rows = [38, 66, 94];
  return (<>
    <P d="M20 14 H92 Q100 14 100 22 V126 H28 Q20 126 20 118 Z" fill="#fffaf0" delay={0.1} dur={0.9} />
    <P d="M32 28 H80" w={3.4} delay={0.9} dur={0.3} />
    {rows.map((y, i) => (
      <g key={y}>
        <P d={`M30 ${y} h13 v13 h-13 Z`} w={2.8} delay={1.1 + i * 0.25} dur={0.3} />
        <P d={`M52 ${y + 7} H88`} w={3} delay={1.2 + i * 0.25} dur={0.3} />
        <P d={`M31 ${y + 6} L36 ${y + 12} L45 ${y - 3}`} w={4.2} stroke="#2f9e5e" delay={2.0 + i * 0.9} dur={0.35} />
      </g>
    ))}
    <G cls="pen" delay={0}><path d="M0 0 L5 -6 L24 -25 L31 -18 L11 1 Z M24 -25 L31 -18" fill="#e5484d" stroke={INK} strokeWidth={2.6} strokeLinejoin="round" /></G>
    {[0, 1, 2].map((i) => (
      <G key={i} cls="pop" delay={3.2 + i * 0.25}>
        <path d={`M126 ${116 - i * 12} v8 a24 8 0 0 0 48 0 v-8`} fill="#e0a018" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
        <ellipse cx="150" cy={116 - i * 12} rx="24" ry="8" fill="#ffd84a" stroke={INK} strokeWidth={3} />
      </G>
    ))}
    <P d="M118 30 Q150 14 182 30" w={3} dash="0.04 0.05" delay={3.4} dur={0.6} />
  </>);
}

function Jar() {
  return (<>
    <P d="M70 34 H130 M72 34 Q60 46 60 70 V118 Q60 130 72 130 H128 Q140 130 140 118 V70 Q140 46 128 34" w={3.6} fill="#e8f3f5" delay={0.1} dur={1} />
    {[[84, 118], [116, 118], [100, 118], [92, 104], [108, 104], [100, 90]].map(([x, y], i) => (
      <G key={i} cls="coin" delay={0.7 + i * 0.4}>
        <circle cx={x} cy={y} r="10.5" fill="#ffd84a" stroke={INK} strokeWidth={2.8} />
        <path d={`M${x - 4} ${y} h8`} stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      </G>
    ))}
    <P d="M166 118 V44 M150 60 L166 42 L182 60" w={5} stroke="#2f9e5e" delay={2.9} dur={0.7} />
    <Spark x={22} y={50} delay={3.7} s={0.9} /><Spark x={36} y={110} delay={3.9} s={0.7} />
  </>);
}

function Go() {
  return (<>
    <P d="M52 130 V58 H62.7 V68 H73.3 V58 H84 V68 H94.7 V58 H105.3 V68 H116 V58 H126.7 V68 H137.3 V58 H148 V130 Z" fill="#d9c9a3" delay={0.1} dur={1.1} />
    <path d="M88 130 V102 Q88 88 100 88 Q112 88 112 102 V130 Z" fill="#ffe27a" />
    <G cls="door" delay={1.6}><path d="M88 130 V102 Q88 88 100 88 Q112 88 112 102 V130 Z" fill="#8a6a3c" stroke={INK} strokeWidth={3} strokeLinejoin="round" /></G>
    <P d="M88 130 V102 Q88 88 100 88 Q112 88 112 102 V130" w={3.4} delay={1.1} dur={0.5} />
    <P d="M100 58 V24" w={3.2} delay={1.2} dur={0.3} />
    <G cls="pop flag" delay={1.6}><path d="M100 24 L128 33 L100 42 Z" fill="#e5484d" stroke={INK} strokeWidth={3} strokeLinejoin="round" /></G>
    <Spark x={34} y={50} delay={2.2} s={1.1} /><Spark x={168} y={46} delay={2.4} /><Spark x={170} y={104} delay={2.6} s={0.8} />
  </>);
}

interface Step { lines: string[]; scene: () => ReactNode; cues: [number, string, number?][] }
const STEPS: Step[] = [
  { lines: ["You are the new ruler!"], scene: Crown, cues: [[250, "scribble"], [1550, "boing"], [1800, "sparkle"]] },
  { lines: ["People visit you.", "They ask for things.", "Tap yes or no."], scene: AskYesNo, cues: [[200, "scribble"], [1050, "pop"], [2050, "yes"], [2350, "no"]] },
  { lines: ["Watch three things.", "People. Happiness. Gold."], scene: Stats, cues: [[400, "pop", 0.9], [1100, "pop", 1.05], [1800, "coinIn"]] },
  { lines: ["Needs come first.", "Wants come later."], scene: NeedWant, cues: [[400, "pop"], [1000, "pop", 1.15], [1800, "good"], [2300, "scribble"]] },
  { lines: ["In the evening, walk the town.", "Talk kindly.", "Play mini games."], scene: Evening, cues: [[200, "scribble"], [2000, "sparkle"], [2600, "pop"], [3100, "boing"]] },
  { lines: ["At night, go to the market.", "Make a list.", "Stick to your budget."], scene: Market, cues: [[150, "page"], [1000, "scribble"], [2100, "tick"], [3000, "tick"], [3900, "tick"], [4000, "coinIn"]] },
  { lines: ["Save your money.", "It grows over time."], scene: Jar, cues: [[900, "coinIn"], [1300, "coinIn"], [1700, "coinIn"], [3000, "growth"]] },
  { lines: ["Ready?", "Let's go!"], scene: Go, cues: [[200, "scribble"], [1700, "door"], [1900, "fanfare"]] },
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
  return open ? <IntroCard /> : null;
}

function IntroCard() {
  const close = useIntro((s) => s.close);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const [step, setStep] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const touched = useRef(false);
  const stepRef = useRef(0);
  stepRef.current = step;
  const last = step === STEPS.length - 1;
  const cur = STEPS[step];

  const finish = useCallback((done: boolean) => {
    stopVoice();
    if (done) sfx("sparkle");
    close();
  }, [close]);

  const go = useCallback((dir: 1 | -1, byUser: boolean) => {
    if (byUser) touched.current = true;
    const n = stepRef.current + dir;
    if (n < 0) return;
    if (n >= STEPS.length) { finish(true); return; }
    setStep(n);
  }, [finish]);

  // Esc = skip (the module-level capture listener above calls this).
  useEffect(() => { esc.skip = () => finish(false); return () => { esc.skip = null; stopVoice(); }; }, [finish]);

  // Keys: Space / Enter / -> next (pad A arrives as Enter), <- back. Swallowed so the game under us never sees them.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const key = e.key;
      const mine = key === "Enter" || key === " " || key === "ArrowRight" || key === "ArrowLeft" || key === "y" || key === "n" || key === "Backspace";
      if (!mine) return;
      if ((key === "Enter" || key === " ") && t?.closest?.("[data-native]")) return; // let a focused Skip / Back / Hear-again button do its own thing
      e.stopImmediatePropagation(); e.preventDefault();
      if (e.repeat) return;
      if (key === "ArrowLeft" || key === "Backspace") go(-1, true);
      else if (key === "Enter" || key === " " || key === "ArrowRight") go(1, true);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [go]);

  // Each card: page-flip, sound cues timed to the doodle, Ollie's voice. Auto-advance only after a real voice ends and only if untouched.
  const say = useCallback((auto: boolean) => {
    const text = STEPS[stepRef.current].lines.join(" ");
    const t0 = performance.now();
    const idx = stepRef.current;
    setSpeaking(true);
    return speak("advisor", text, { caption: false }).then(() => {
      if (stepRef.current !== idx) return;
      setSpeaking(false);
      const real = performance.now() - t0 > 900; // muted / no voice resolves instantly: never auto-advance then
      if (auto && real && !touched.current && idx < STEPS.length - 1) {
        const id = window.setTimeout(() => { if (!touched.current && stepRef.current === idx) go(1, false); }, 1200);
        timers.current.push(id);
      }
    });
  }, [go]);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    sfx(step === 0 ? "scroll" : "page");
    const cues = reduce ? cur.cues.slice(0, 1).map(([, n, r]) => [150, n, r] as [number, string, number?]) : cur.cues;
    const ids = cues.map(([ms, name, rate]) => window.setTimeout(() => sfx(name, rate ? { rate } : {}), ms));
    timers.current = ids;
    void say(true);
    return () => { ids.forEach(window.clearTimeout); timers.current.forEach(window.clearTimeout); timers.current = []; };
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const Scene = cur.scene;
  return (
    <div className={"intro" + (reduce ? " rm" : "")} role="dialog" aria-modal="true" aria-label="How to play">
      <div className="in-card" onClick={() => go(1, true)}>
        <div className="in-head">
          <div className={"in-ollie" + (speaking ? " talk" : "")}><Ico name="owl" fallback="🦉" /><b>Sage Ollie</b></div>
          <div className="in-head-btns" onClick={(e) => e.stopPropagation()}>
            <button data-native className="in-btn small" aria-label="Hear it again" onClick={(e) => { e.currentTarget.blur(); touched.current = true; void say(false); sfx("tap"); }}>
              <Ico name="speaker" fallback="🔊" /><span className="in-lbl">Again</span>
            </button>
            <button data-native className="in-btn small" onClick={() => { sfx("click"); finish(false); }}>Skip intro</button>
          </div>
        </div>
        <div className="in-body">
          <div className="in-stage">
            <svg key={step} viewBox="0 0 200 140" role="img" aria-label={cur.lines.join(" ")}>
              <defs>
                <filter id="in-wobble" x="-5%" y="-5%" width="110%" height="110%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="4" result="t" />
                  <feDisplacementMap in="SourceGraphic" in2="t" scale="3.4" xChannelSelector="R" yChannelSelector="G" />
                </filter>
              </defs>
              <g filter="url(#in-wobble)"><Scene /></g>
            </svg>
          </div>
          <div className="in-text" aria-live="polite" key={"t" + step}>
            {cur.lines.map((l, i) => <p key={i} style={v({ "--i": i })}>{l}</p>)}
          </div>
        </div>
        <div className="in-foot" onClick={(e) => e.stopPropagation()}>
          <button data-native className="in-btn" style={{ visibility: step === 0 ? "hidden" : "visible" }} onClick={(e) => { e.currentTarget.blur(); sfx("click"); go(-1, true); }} aria-label="Back">◀ Back</button>
          <div className="in-dots" role="img" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => <i key={i} className={i === step ? "on" : i < step ? "done" : ""} />)}
          </div>
          <button data-native className="in-btn go" onClick={(e) => { e.currentTarget.blur(); go(1, true); }}>{last ? "Let's go!" : "Next ▶"}</button>
        </div>
      </div>
    </div>
  );
}
