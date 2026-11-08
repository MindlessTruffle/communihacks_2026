import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/store.ts";
import { sfx, speak } from "../audio/audio.ts";
import { getDevice } from "../platform/device.ts";
import { UI } from "../game/content/uiLines.ts";

export { SettingsMenu, PauseMenu, ConfirmDialog } from "./Options.tsx";

/** "/" pressed 4 times quickly (or 4 quick taps in the top-left corner on touch) opens the admin panel. */
export function useAdminShortcut() {
  const admin = useGame((s) => s.admin);
  const presses = useRef<number[]>([]);
  useEffect(() => {
    const hit = () => {
      const now = Date.now();
      presses.current = [...presses.current.filter((t) => now - t < 1500), now];
      if (presses.current.length >= 4) { presses.current = []; admin(!useGame.getState().adminOpen); }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "/" && !(e.target as HTMLElement)?.closest?.("input,textarea")) { e.preventDefault(); hit(); } };
    const onTouch = (e: PointerEvent) => { if (e.clientX < 70 && e.clientY > window.innerHeight - 70 && e.pointerType === "touch") hit(); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onTouch);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("pointerdown", onTouch); };
  }, [admin]);
}

export function AdminPanel() {
  const open = useGame((s) => s.adminOpen);
  const cmd = useGame((s) => s.adminCmd);
  const admin = useGame((s) => s.admin);
  const playWinDemo = useGame((s) => s.playWinDemo);
  const run = useGame((s) => s.run);
  const phase = useGame((s) => s.phase);
  if (!open) return null;
  const B = ({ c, n, children, danger }: { c: string; n?: number; children: React.ReactNode; danger?: boolean }) =>
    <button className={danger ? "danger" : ""} onClick={() => { sfx("tap"); cmd(c, n); }}>{children}</button>;
  return (
    <div className="admin panel" role="dialog" aria-label="Admin panel">
      <h2>🛠️ Admin</h2>
      <div className="small" style={{ marginBottom: 10 }}>phase: {phase} · day {run?.day} · 🪙{run?.gold} · 😊{run?.happiness} · 👥{run?.people}</div>
      {!run ? <p>Start a reign first.</p> : (
        <div className="grid">
          <B c="lose" danger>💀 Lose run now</B>
          <B c="gold" n={100}>+100 gold</B>
          <B c="gold" n={-100}>−100 gold</B>
          <B c="happy" n={20}>+20 happy</B>
          <B c="happy" n={-20}>−20 happy</B>
          <B c="people" n={100}>+100 people</B>
          <B c="day" n={5}>Day +5 (unlocks)</B>
          <B c="skipCourt">Skip court</B>
          <B c="toStreet">→ Evening street</B>
          <B c="toMarket">→ Budget/market</B>
          <B c="nextDay">→ Sleep / next day</B>
          <button onClick={() => { sfx("tap"); playWinDemo(); }}>▶ Budget-win cutscene</button>
          <button onClick={() => { sfx("tap"); admin(false); import("./Intro.tsx").then((m) => m.openIntro()); }}>▶ Replay tutorial</button>
          <button onClick={() => admin(false)}>Close</button>
        </div>
      )}
    </div>
  );
}

export function RotatePrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const check = () => setShow(getDevice().form === "phone" && getDevice().orientation === "portrait");
    check();
    window.addEventListener("rc-device", check);
    return () => window.removeEventListener("rc-device", check);
  }, []);
  useEffect(() => { if (show) speak(null, UI.rotate); }, [show]);
  if (!show) return null;
  return <div className="rotate" role="alert"><div><div className="phone" />{UI.rotate}</div></div>;
}
