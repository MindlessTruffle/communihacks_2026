import { useEffect, useRef, useState } from "react";
import { useGame } from "../game/store.ts";
import { CoinIcon, HappyIcon, Ico, PeopleIcon } from "./icons.tsx";
import { sfx } from "../audio/audio.ts";
import { haptic } from "../platform/device.ts";

function Stat({ value, icon, kind }: { value: number; icon: React.ReactNode; kind: string }) {
  const prev = useRef(value);
  const [floats, setFloats] = useState<{ id: number; d: number }[]>([]);
  const [bump, setBump] = useState(0);
  useEffect(() => {
    const d = value - prev.current;
    prev.current = value;
    if (!d) return;
    const id = Date.now() + Math.random();
    setFloats((f) => [...f, { id, d }]);
    setBump((b) => b + 1);
    setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1700);
    if (kind === "gold") sfx(d > 0 ? "coinIn" : "coinOut", { volume: 0.7 });
    if (kind === "happiness" && d > 0) sfx("good", { volume: 0.5 });
    haptic(d > 0 ? "success" : "soft");
  }, [value, kind]);
  return (
    <div className={"stat" + (bump ? " bump" : "")} key={bump} data-stat={kind} data-pop={bump ? bump : undefined} aria-label={`${kind} ${value}`}>
      <span className="ico">{icon}</span>
      <span>{value}</span>
      {floats.map((f) => <span key={f.id} className={"float " + (f.d > 0 ? "up" : "down")}>{f.d > 0 ? "+" : ""}{f.d}</span>)}
    </div>
  );
}

export function Stats() {
  const run = useGame((s) => s.run);
  if (!run) return null;
  return (
    <div className="stats panel">
      <Stat value={run.people} icon={<PeopleIcon />} kind="people" />
      <Stat value={run.happiness} icon={<HappyIcon sad={run.happiness < 30} />} kind="happiness" />
      <Stat value={run.gold} icon={<CoinIcon />} kind="gold" />
    </div>
  );
}

export function PhaseDots() {
  const phase = useGame((s) => s.phase);
  const day = useGame((s) => s.run?.day ?? 0);
  const i = phase === "morning" || phase === "court" || phase === "summary" ? 0 : phase === "street" ? 1 : 2;
  return (
    <div className="phase-dots panel" aria-label={`Day ${day}`}>
      <span className="display" style={{ fontSize: "calc(var(--u)*2.2)", opacity: 1, filter: "none" }}>Day {day}</span>
      <span className={i === 0 ? "on" : ""}><Ico name="sun" fallback="☀️" /></span>
      <span className={i === 1 ? "on" : ""}><Ico name="lantern" fallback="🏮" /></span>
      <span className={i === 2 ? "on" : ""}><Ico name="moon" fallback="🌙" /></span>
    </div>
  );
}

export function MenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="corner-btn" style={{ left: "calc(var(--u)*1.5 + var(--safe-l))", top: "calc(var(--u)*1.5 + var(--safe-t))" }}
      onClick={() => { sfx("click"); onClick(); }} aria-label="Menu and settings"><Ico name="gear" fallback="⚙️" /></button>
  );
}
