// Game options screen (tabs), pause menu and confirm dialog. Re-exported from Menus.tsx.
import { useEffect, useRef, useState } from "react";
import { useGame, type Settings } from "../game/store.ts";
import { sfx, speak } from "../audio/audio.ts";
import { GEM_COLORS, GEM_LABEL, GemIcon } from "./icons.tsx";
import { GEMS } from "../game/types.ts";
import { isTouch } from "../platform/device.ts";
import { useDialog } from "../platform/a11y.tsx";

// ------------------------------------------------------------------ small option widgets
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={"toggle " + (on ? "on" : "")} onClick={() => { sfx("tap"); onChange(!on); }}>
      <span className="toggle-txt" aria-hidden="true">{on ? "ON" : "OFF"}</span>
    </button>
  );
}

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: { v: T; label: string; aria?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.v)} role="radio" aria-checked={value === o.v} aria-label={o.aria} className={"seg-btn " + (value === o.v ? "on" : "")}
          onClick={() => { sfx("tap"); onChange(o.v); }}>{value === o.v ? "✓ " : ""}{o.label}</button>
      ))}
    </div>
  );
}

function Slider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <span className="slider">
      <input type="range" min={0} max={1} step={0.1} value={value} aria-label={label} aria-valuetext={`${Math.round(value * 100)} percent`}
        onChange={(e) => onChange(+e.target.value)} onPointerUp={() => sfx("tap")} onKeyUp={() => sfx("tap")} />
      <b aria-hidden="true">{Math.round(value * 100)}</b>
    </span>
  );
}

function Row({ icon, label, hint, children }: { icon: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="opt-row">
      <div className="opt-label"><span aria-hidden="true">{icon}</span> <span>{label}</span>{hint && <small>{hint}</small>}</div>
      <div className="opt-ctl">{children}</div>
    </div>
  );
}

const TEXT_STEPS = [
  { v: 1, label: "A", aria: "Normal text" },
  { v: 1.15, label: "A+", aria: "Large text" },
  { v: 1.3, label: "A++", aria: "Extra large text" },
  { v: 1.5, label: "A+++", aria: "Biggest text" },
];

const QUALITY_KEY = "rc-quality";
type Q = "auto" | "high" | "low";
const readQuality = (): Q => { try { const q = localStorage.getItem(QUALITY_KEY); return q === "high" || q === "low" ? q : "auto"; } catch { return "auto"; } };

const TABS = [
  { id: "gameplay", icon: "🎮", label: "Gameplay" },
  { id: "audio", icon: "🔊", label: "Audio" },
  { id: "display", icon: "🖥️", label: "Display" },
  { id: "access", icon: "♿", label: "Access" },
  { id: "controls", icon: "🕹️", label: "Controls" },
] as const;
type TabId = (typeof TABS)[number]["id"];

function TextSizeRow({ s, set }: { s: Settings; set: (p: Partial<Settings>) => void }) {
  return (
    <>
      <Row icon="🔤" label="Text size"><Seg label="Text size" value={s.textScale} options={TEXT_STEPS} onChange={(v) => set({ textScale: v })} /></Row>
      <div className="opt-sample display">The royal baker has 3 loaves of bread.</div>
    </>
  );
}

function ControlsTab() {
  const rows: [string, string, string, string][] = [
    ["Walk", "W A S D or arrow keys", "Left stick", "Hold the screen (or use the joystick)"],
    ["Look around", "Move the mouse", "Right stick", "Drag with your finger"],
    ["Yes  ✓", "Y", "X button", "Tap ✓"],
    ["No  ✗", "N", "B button", "Tap ✗"],
    ["Continue / Pick", "Enter or Space", "A button", "Tap the button"],
    ["Pause menu", "Esc", "Start button", "Tap ⚙"],
    ["Move between buttons", "Tab, Shift+Tab", "D-pad", "Tap"],
    ["Back", "Esc", "B button (in menus)", "Tap Back"],
  ];
  return (
    <div className="ctl-table" role="table" aria-label="Controls">
      <div className="ctl-head" role="row"><span role="columnheader">Action</span><span role="columnheader">⌨️ Keyboard</span><span role="columnheader">🎮 Gamepad</span><span role="columnheader">👆 Touch</span></div>
      {rows.map((r) => (
        <div className="ctl-row" role="row" key={r[0]}>
          <b role="rowheader">{r[0]}</b><span role="cell">{r[1]}</span><span role="cell">{r[2]}</span><span role="cell">{r[3]}</span>
        </div>
      ))}
      <p className="ctl-note">Nothing needs re-mapping: every action works with keyboard, gamepad, mouse and touch at the same time.</p>
    </div>
  );
}

function SettingsPanel({ tab }: { tab: TabId }) {
  const s = useGame((st) => st.settings);
  const setS = useGame((st) => st.setSettings);
  const run = useGame((st) => st.run);
  const [q, setQ] = useState<Q>(readQuality);
  const [fs, setFs] = useState(!!document.fullscreenElement);
  useEffect(() => {
    const f = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  const canFs = !!document.documentElement.requestFullscreen;
  const applyQuality = () => { try { localStorage.setItem(QUALITY_KEY, q); } catch { /* ignore */ } location.reload(); };

  if (tab === "gameplay") return (
    <>
      {run && (
        <div className="crest" aria-label="Royal crest gems">
          {GEMS.map((g) => (
            <div key={g} className="crest-gem" style={{ opacity: run.gems[g] ? 1 : 0.35 }}>
              <div className="crest-ico"><GemIcon color={GEM_COLORS[g]} /></div>
              <div className="small display">{GEM_LABEL[g]} {run.gems[g]}</div>
            </div>
          ))}
        </div>
      )}
      <Row icon="💬" label="Talk with AI characters" hint="Off = pick answers from buttons instead."><Toggle label="Talk with AI characters" on={s.aiChat} onChange={(v) => setS({ aiChat: v })} /></Row>
      <Row icon="🚶" label="Walking" hint={s.walkMode === "hold" ? "Hold the screen to walk." : "Tap once to start walking, tap again to stop."}>
        <Seg label="Walking style" value={s.walkMode} options={[{ v: "hold", label: "Hold" }, { v: "tap", label: "Tap" }]} onChange={(v) => setS({ walkMode: v })} />
      </Row>
      <Row icon="🐢" label="Game speed" hint="There are no timers in this game. Take all the time you like.">
        <Seg label="Game speed" value={s.gameSpeed} options={[{ v: 0.75, label: "Slow" }, { v: 1, label: "Normal" }, { v: 1.25, label: "Fast" }]} onChange={(v) => setS({ gameSpeed: v })} />
      </Row>
    </>
  );

  if (tab === "audio") return (
    <>
      <Row icon="🔊" label="Everything"><Slider label="Master volume" value={s.master} onChange={(v) => setS({ master: v })} /></Row>
      <Row icon="🎵" label="Music"><Slider label="Music volume" value={s.music} onChange={(v) => setS({ music: v })} /></Row>
      <Row icon="🔔" label="Sounds"><Slider label="Sound effects volume" value={s.sfx} onChange={(v) => setS({ sfx: v })} /></Row>
      <Row icon="🗣️" label="Voices"><Slider label="Voice volume" value={s.voice} onChange={(v) => setS({ voice: v })} /></Row>
      <Row icon="📖" label="Read everything aloud"><Toggle label="Read everything aloud" on={s.readAloud} onChange={(v) => { setS({ readAloud: v }); if (v) setTimeout(() => speak(null, "I will read to you."), 60); }} /></Row>
      <Row icon="💬" label="Subtitles" hint="Show the words for voiced lines."><Toggle label="Subtitles" on={s.subtitles} onChange={(v) => setS({ subtitles: v })} /></Row>
    </>
  );

  if (tab === "display") return (
    <>
      <Row icon="✨" label="Graphics" hint={q === "auto" ? "Auto picks the best for this device." : q === "low" ? "Low: smoother on older phones and tablets." : "High: shadows, glow and soft light."}>
        <Seg label="Graphics quality" value={q} options={[{ v: "auto", label: "Auto" }, { v: "high", label: "High" }, { v: "low", label: "Low" }]} onChange={setQ} />
      </Row>
      {q !== readQuality() && (
        <div className="opt-apply"><span>The game screen needs to restart. Your progress is saved.</span><button className="btn gold" onClick={applyQuality}>Apply &amp; restart ↻</button></div>
      )}
      {canFs && <Row icon="⛶" label="Full screen"><Toggle label="Full screen" on={fs} onChange={(v) => { if (v) document.documentElement.requestFullscreen?.({ navigationUI: "hide" } as FullscreenOptions).catch(() => {}); else document.exitFullscreen?.().catch(() => {}); }} /></Row>}
      <TextSizeRow s={s} set={setS} />
      <Row icon="🐌" label="Less motion" hint="Calmer animations and camera."><Toggle label="Less motion" on={s.reduceMotion} onChange={(v) => setS({ reduceMotion: v })} /></Row>
    </>
  );

  if (tab === "access") return (
    <>
      <Row icon="📖" label="Read everything aloud"><Toggle label="Read everything aloud" on={s.readAloud} onChange={(v) => setS({ readAloud: v })} /></Row>
      <Row icon="💬" label="Subtitles"><Toggle label="Subtitles" on={s.subtitles} onChange={(v) => setS({ subtitles: v })} /></Row>
      <TextSizeRow s={s} set={setS} />
      <Row icon="🌓" label="High contrast" hint="Stronger lines and colours."><Toggle label="High contrast" on={s.highContrast} onChange={(v) => setS({ highContrast: v })} /></Row>
      <Row icon="🎨" label="Colour-blind friendly" hint="Safe colours, plus ▲ ▼ shapes."><Toggle label="Colour-blind friendly colours" on={s.colorBlind} onChange={(v) => setS({ colorBlind: v })} /></Row>
      <Row icon="🅰️" label="Easy-read font" hint="A font made to be easier to read."><Toggle label="Dyslexia friendly font" on={s.dyslexiaFont} onChange={(v) => setS({ dyslexiaFont: v })} /></Row>
      <Row icon="🐌" label="Less motion"><Toggle label="Less motion" on={s.reduceMotion} onChange={(v) => setS({ reduceMotion: v })} /></Row>
    </>
  );
  return <ControlsTab />;
}

/** Full options screen. Esc / pad B closes it (via the global "rc-back" event). */
export function SettingsMenu({ onClose, listenBack = true }: { onClose: () => void; listenBack?: boolean }) {
  const resetSettings = useGame((st) => st.resetSettings);
  const [tab, setTab] = useState<TabId>("gameplay");
  const [confirmReset, setConfirmReset] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { initial: '[role="tab"][aria-selected="true"]' });
  useEffect(() => {
    if (!listenBack) return;
    const h = () => (confirmReset ? setConfirmReset(false) : onClose());
    window.addEventListener("rc-back", h);
    return () => window.removeEventListener("rc-back", h);
  }, [onClose, listenBack, confirmReset]);
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (n < 0) return;
    e.preventDefault();
    const t = TABS[(n + TABS.length) % TABS.length];
    setTab(t.id); sfx("tap");
    requestAnimationFrame(() => document.getElementById("tab-" + t.id)?.focus());
  };
  return (
    <div className="center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="opts panel" role="dialog" aria-modal="true" aria-labelledby="opts-title" ref={ref}>
        <div className="ribbon opts-ribbon" id="opts-title">Options</div>
        <div className="opts-tabs" role="tablist" aria-label="Options sections" onKeyDown={onTabKey}>
          {TABS.map((t) => (
            <button key={t.id} id={"tab-" + t.id} role="tab" aria-selected={tab === t.id} aria-controls="opts-panel" tabIndex={tab === t.id ? 0 : -1}
              className={"opts-tab " + (tab === t.id ? "on" : "")} onClick={() => { sfx("tap"); setTab(t.id); }}>
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="opts-body" id="opts-panel" role="tabpanel" aria-labelledby={"tab-" + tab}>
          <SettingsPanel tab={tab} />
        </div>
        <div className="opts-foot">
          {confirmReset ? (
            <>
              <span className="display">Put all options back?</span>
              <button className="btn" onClick={() => { sfx("click"); resetSettings(); setConfirmReset(false); }}>Yes, reset</button>
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>No</button>
            </>
          ) : (
            <>
              <button className="btn ghost" onClick={() => { sfx("click"); setConfirmReset(true); }}>↺ Reset to defaults</button>
              <button className="btn gold" onClick={() => { sfx("click"); onClose(); }}>◀ Back</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ confirm + pause
export function ConfirmDialog({ title, body, yes, no, onYes, onNo, danger }: { title: string; body: string; yes: string; no: string; onYes: () => void; onNo: () => void; danger?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { initial: "[data-safe]" });
  useEffect(() => { window.addEventListener("rc-back", onNo); return () => window.removeEventListener("rc-back", onNo); }, [onNo]);
  return (
    <div className="center" style={{ zIndex: 40 }}>
      <div className="card panel confirm" role="alertdialog" aria-modal="true" aria-labelledby="cf-t" aria-describedby="cf-b" ref={ref}>
        <div className="ribbon" id="cf-t">{title}</div>
        <p className="big display" id="cf-b">{body}</p>
        <div className="footer">
          <button className="btn gold" data-safe onClick={() => { sfx("click"); onNo(); }}>{no}</button>
          <button className={"btn " + (danger ? "" : "ghost")} onClick={() => { sfx("click"); onYes(); }}>{yes}</button>
        </div>
      </div>
    </div>
  );
}

/** Esc / gamepad Start. The game never runs on a timer, so this is just a place for options. */
export function PauseMenu({ onClose }: { onClose: () => void }) {
  const quit = useGame((s) => s.quitToTitle);
  const day = useGame((s) => (["title", "setup", "reign-review", "reign-end"].includes(s.phase) ? undefined : s.run?.day));
  const [view, setView] = useState<"main" | "settings" | "quit">("main");
  useEffect(() => {
    if (view === "settings") return; // the settings screen handles Back itself
    const h = () => (view === "quit" ? setView("main") : onClose());
    window.addEventListener("rc-back", h);
    return () => window.removeEventListener("rc-back", h);
  }, [view, onClose]);
  if (view === "settings") return <SettingsMenu onClose={() => setView("main")} />;
  if (view === "quit") return <ConfirmDialog title="Leave the kingdom?" body="Your reign is saved. You can come back with Continue." yes="Go to title" no="Keep playing" danger onNo={() => setView("main")} onYes={() => { onClose(); quit(); }} />;
  return <PauseCard day={day} setView={setView} onClose={onClose} />;
}

function PauseCard({ day, setView, onClose }: { day?: number; setView: (v: "settings" | "quit") => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, { initial: "[data-autofocus]" });
  const inRun = day !== undefined;
  return (
    <div className="center" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="card panel pause" role="dialog" aria-modal="true" aria-labelledby="pause-t" ref={ref}>
        <div className="ribbon" id="pause-t">Paused</div>
        {inRun && <p className="med display">Day {day}. Take your time.</p>}
        <div className="pause-btns">
          <button className="btn gold" data-autofocus onClick={() => { sfx("click"); onClose(); }}>▶ Keep playing</button>
          <button className="btn" onClick={() => { sfx("click"); setView("settings"); }}>⚙️ Options</button>
          {inRun && <button className="btn ghost" onClick={() => { sfx("click"); setView("quit"); }}>🏠 Title screen</button>}
        </div>
        <div className="tap-hint">{isTouch() ? "Your reign saves by itself." : "Press Esc to keep playing. Your reign saves by itself."}</div>
      </div>
    </div>
  );
}
