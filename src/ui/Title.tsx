import { useEffect, useRef, useState } from "react";
import "@fontsource/bodoni-moda/700.css";
import "./title.css";
import { intro, smoothProgress } from "../scenes/anchors.ts";
import { Continue, Ico } from "./icons.tsx";
import { useGame, loadSave } from "../game/store.ts";
import { RULER_MODELS } from "../game/content/characters.ts";
import { UI } from "../game/content/uiLines.ts";
import { ADVISOR } from "../game/content/advisor.ts";
import { speak, sfx, unlockAudio, playMusic, stopVoice } from "../audio/audio.ts";
import { goNative } from "../platform/device.ts";
import type { RunState } from "../game/types.ts";
import { GummyPortrait } from "../characters/gummy/GummyPortrait.tsx";
import { GummyColors, GUMMY_PALETTE } from './GummyColors.tsx';
import { useNotebook } from '../game/notebook.ts';

// --- Title screen: ivory serif title over a painted cloud bank + three snowy peaks, ONE START button, quintic camera descent to the court. ---
let descending = false;
const titleEsc = { skip: null as null | (() => void) };
// Registered at module load (before App's own capture handler) so Esc during the descent skips it instead of opening the pause menu.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && descending && titleEsc.skip) { e.stopImmediatePropagation(); e.preventDefault(); titleEsc.skip(); }
  }, true);
}
const DESCENT_MS = 2000, FADE_MS = 180;

export function Title() {
  const goto = useGame((s) => s.goto);
  const cont = useGame((s) => s.continueGame);
  const reduce = useGame((s) => s.settings.reduceMotion);
  const hasSave = !!loadSave();
  const root = useRef<HTMLDivElement>(null);
  const [going, setGoing] = useState(false);
  const raf = useRef(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const done = useRef(false);

  const startRef = useRef<() => void>(() => {});
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector(".notebook")) return; if ((e.key === "Enter" || e.key === " ") && !(e.target as HTMLElement)?.closest?.("button")) { e.preventDefault(); startRef.current(); } };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  useEffect(() => { intro.progress = 0; descending = false; return () => { cancelAnimationFrame(raf.current); clearTimeout(fadeTimer.current); descending = false; titleEsc.skip = null; }; }, []);

  const finish = () => {
    if (done.current) return;
    done.current = true;
    cancelAnimationFrame(raf.current);
    intro.progress = 1;
    descending = false; titleEsc.skip = null;
    goto("setup"); speak(null, UI.chooseRuler);
  };
  const set = (name: string, v: string) => root.current?.style.setProperty(name, v);
  const start = () => {
    if (going) return;
    unlockAudio(); goNative(); sfx("fanfare"); playMusic("title");
    setGoing(true); descending = true; titleEsc.skip = finish;
    if (reduce) { // ~180 ms crossfade, no camera travel
      intro.progress = 1;
      set("--fade", "0");
      fadeTimer.current = setTimeout(finish, FADE_MS);
      return;
    }
    let previous = performance.now(), elapsed = 0;
    const tick = (now: number) => {
      // Don't skip the whole descent when one expensive render stalls a frame.
      elapsed += Math.min(64, Math.max(0, now - previous)); previous = now;
      const t = Math.min(1, elapsed / DESCENT_MS);
      intro.progress = t;
      const p = smoothProgress(t);
      set("--cloud-back", `${p * 80}vh`); set("--cloud-front", `${p * 110}vh`);
      set("--fade", String(Math.max(0, 1 - p * 5)));       // title + button fade out in the first fifth
      set("--veil", String(Math.sin(Math.PI * t) ** 4 * .92)); // pass through a cloud, then reveal the court
      if (t >= 1) finish(); else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  startRef.current = start;
  return (
    <div ref={root} className={"tt-root" + (going ? " going" : "") + (reduce ? " reduced" : "")} >
      <div className="tt-tint" aria-hidden="true" />
      <div className="tt-clouds tt-back" aria-hidden="true" />
      <div className="tt-clouds tt-front" aria-hidden="true" />
      <div className="tt-content">
        <h1 className="tt-title"><span>Royal</span><span>Concerns</span></h1>
        <div className="tt-actions">
          <button className="tt-start" onClick={start} disabled={going} aria-label="Start"><span>Start</span></button>
            <div className="tt-secondary">
              {hasSave && <button className="tt-link" disabled={going} onClick={() => { unlockAudio(); goNative(); sfx("click"); cont(); }}>Continue</button>}
              <button className="tt-link tt-notebook" disabled={going} onClick={() => useNotebook.getState().show(true)}><img src="/ui/notebook-book.svg" alt="" draggable={false} /><span>Notebook</span></button>
              <button className="tt-link" disabled={going} onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))}>Options</button>
            </div>
        </div>
      </div>
      <div className="tt-veil" aria-hidden="true" />
    </div>
  );
}

export function Setup() {
  const newGame = useGame((s) => s.newGame);
  const [title, setTitle] = useState<RunState["rulerTitle"]>("Ruler");
  const [model, setModel] = useState(RULER_MODELS[0].id);
  const [color, setColor] = useState<string>(GUMMY_PALETTE[0][1]);
  useEffect(() => { useGame.getState().setPreviewColor(color); useGame.getState().setPreviewRuler(model); }, [color, model]);
  const [step, setStep] = useState(0);
  const intro = ADVISOR.intro;

  if (step > 0) {
    const i = step - 1;
    return (
      <div className="center" onClick={() => {
        stopVoice(); sfx("page");
        if (i + 1 < intro.length) { setStep(step + 1); speak("advisor", intro[i + 1]); }
        else newGame({ title, model, color, name: "" });
      }}>
        <div className="card panel">
          <div className="ribbon"><Ico name="owl" fallback="🦉" /> Sage Ollie</div>
          <p className="big display">{intro[i]}</p>
          <div className="tap-hint"><Continue /></div>
        </div>
      </div>
    );
  }

  return (
    <div className="center" style={{ background: "transparent" }}>
      <div className="card panel ruler-setup" style={{ width: "calc(var(--u)*62)" }}>
        <h2 className="setup-title">Who will rule?</h2>
        <div className="pick" role="radiogroup" aria-label="Choose your ruler" style={{ flexWrap: "wrap", gap: "calc(var(--u)*.8)" }}>
          {RULER_MODELS.map((m) => (
            <button key={m.id} className={"btn ghost opt " + (model === m.id ? "on" : "")} style={{ minWidth: "calc(var(--u)*7)", height: "calc(var(--u)*8.6)", padding: 0 }}
              aria-checked={model === m.id} aria-label={`Ruler ${m.label}`} role="radio" onClick={() => { sfx("tap"); setModel(m.id); useGame.getState().setPreviewRuler(m.id); }}>
              <GummyPortrait id={m.id} color={model === m.id ? color : undefined} />
            </button>
          ))}
        </div>
        <GummyColors color={color} onChange={setColor} />
        <p className="med display" style={{ marginTop: "calc(var(--u)*1)" }}>{UI.chooseTitle}</p>
        <div className="pick" role="radiogroup">
          {(["King", "Queen", "Ruler"] as const).map((t) => (
            <button key={t} className={"btn opt " + (title === t ? "on" : "")} role="radio" aria-checked={title === t}
              onClick={() => { sfx("tap"); setTitle(t); }}>
              <Ico name="crown" fallback={t === "King" ? "🤴" : t === "Queen" ? "👸" : "👑"} /> {t}
            </button>
          ))}
        </div>
        <div className="footer">
          <button className="btn gold" onClick={() => { sfx("fanfare"); setStep(1); speak("advisor", intro[0]); }}>Begin ▶</button>
        </div>
      </div>
    </div>
  );
}

export function ReignEnd() {
  const report = useGame((s) => s.report);
  const goto = useGame((s) => s.goto);
  if (!report) return null;
  return (
    <div className="center">
      <div className="card panel" style={{ width: "calc(var(--u)*62)" }}>
        <div className="ribbon">Reign complete!</div>
        <div className="rows">
          <div className="row"><Ico name="calendar" fallback="📅" /> Days ruled: {report.days}</div>
          <div className="row"><Ico name="coin" fallback="💰" /> Total wealth: {report.netWorth}</div>
          <div className="row"><Ico name="star" fallback="🌟" /> Wise choices: {report.wiseCount}</div>
          <div className="row"><Ico name="heart" fallback="💛" /> Kind moments: {report.kindness}</div>
          <div className="row"><Ico name="basket" fallback="🛒" /> Market stars: {report.avgStars} / 3</div>
        </div>
        {report.good.length > 0 && <p className="med display pos">Great at: {report.good.slice(0, 3).join(", ")}</p>}
        {report.tips[0] && <p className="med" style={{ fontWeight: 700 }}><Ico name="bulb" fallback="💡" /> {report.tips[0]}</p>}
        <div className="footer">
          <button className="btn gold" autoFocus onClick={() => { sfx("fanfare"); speak(null, UI.newReign); goto("setup"); }}><Ico name="crown" fallback="👑" /> New Reign</button>
        </div>
      </div>
    </div>
  );
}
