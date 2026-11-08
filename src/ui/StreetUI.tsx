import { useEffect, useRef } from "react";
import { useGame } from "../game/store.ts";
import { useStreet, walkInput, DOORS, interactWithCitizen } from "../scenes/StreetScene.tsx";
import { sfx } from "../audio/audio.ts";
import { Minigame } from "./Minigames.tsx";
import { Hint, Ico, useInput } from "./icons.tsx";
import { getDevice } from "../platform/device.ts";
import { BudgetScroll } from "./BudgetScroll.tsx";

export default function StreetUI() {
  const phase = useGame((s) => s.phase);
  const convo = useGame((s) => s.convo);
  const minigame = useGame((s) => s.minigame);
  const openMinigame = useGame((s) => s.openMinigame);
  const toBudget = useGame((s) => s.toBudget);
  const nearDoor = useStreet((s) => s.nearDoor);
  const nearNpc = useStreet((s) => s.nearNpc);
  const atGate = useStreet((s) => s.atGate);
  const door = DOORS.find((d) => d.id === nearDoor);
  const hint = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dayPanel = document.querySelector('.phase-dots');
    const place = () => {
      if (!hint.current || !dayPanel) return;
      const origin = hint.current.parentElement!.getBoundingClientRect().top;
      hint.current.style.setProperty('--street-hint-top', `${Math.ceil(dayPanel.getBoundingClientRect().bottom - origin + 12)}px`);
    };
    const observer = new ResizeObserver(place);
    if (dayPanel) observer.observe(dayPanel);
    window.addEventListener('resize', place);
    place();
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [nearNpc, door, atGate, convo, minigame, phase]);

  useEffect(() => { if (door) sfx("sparkle", { volume: 0.5 }); }, [door]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.repeat || (e.target instanceof HTMLElement && e.target.closest('input,textarea,select,[contenteditable="true"]'))) return;
      if (e.key.toLowerCase() === "e" && !convo && !minigame) {
        e.preventDefault(); interactWithCitizen(); return;
      }
      if (e.key === "Enter" || e.key === " ") {
        if (door && !minigame && !convo) openMinigame(door.id);
        else if (atGate && !convo) toBudget();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  useEffect(() => () => { walkInput.hold = false; }, []);

  if (phase === "budget") return <BudgetScroll />;
  if (minigame) return <Minigame id={minigame} />;
  if (convo) return null;

  return (
    <div
      className="layer"
      onPointerDown={(e) => { if (e.target === e.currentTarget) walkInput.hold = true; }}
      onPointerUp={() => { walkInput.hold = false; }}
      onPointerCancel={() => { walkInput.hold = false; }}
      onPointerLeave={() => { walkInput.hold = false; }}
    >
      {door && (
        <div className="interact">
          <button className="btn gold" onClick={() => { sfx("door"); openMinigame(door.id); }}>{door.icon} Enter {door.label}</button>
        </div>
      )}
      {atGate && (
        <div className="interact">
          <button className="btn gold" onClick={() => { sfx("door"); toBudget(); }}><Ico name="lantern" fallback="🏮" /> Go to the Night Market ▶</button>
        </div>
      )}
      {!door && !atGate && !nearNpc && <div ref={hint} className="street-walk-hint"><StreetHint /></div>}
    </div>
  );
}

function StreetHint() {
  const dev = useInput();
  const walk = useGame((s) => s.settings.walkMode);
  const touchy = (dev || (getDevice().input as string)) === "touch";
  if (dev === "gamepad") return <span className="hintrow"><Hint k="move" /> walk</span>;
  if (touchy) return <span>{walk === "tap" ? "Tap to walk / stop" : "Hold to walk"}</span>;
  return <>WASD / arrows · Move</>;
}
