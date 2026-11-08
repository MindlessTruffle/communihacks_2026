import { useEffect } from "react";
import { useGame } from "../game/store.ts";
import { useStreet, walkInput, DOORS } from "../scenes/StreetScene.tsx";
import { UI } from "../game/content/uiLines.ts";
import { speak, sfx } from "../audio/audio.ts";
import { isTouch } from "../platform/device.ts";
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
  const atGate = useStreet((s) => s.atGate);
  const door = DOORS.find((d) => d.id === nearDoor);

  useEffect(() => { speak(null, UI.streetHint); }, []);
  useEffect(() => { if (door) sfx("sparkle", { volume: 0.5 }); }, [door]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
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
      {!door && !atGate && <div className="hint-pill panel"><StreetHint /></div>}
    </div>
  );
}

function StreetHint() {
  const dev = useInput();
  const walk = useGame((s) => s.settings.walkMode);
  const touchy = (dev || (getDevice().input as string)) === "touch";
  if (dev === "gamepad") return <span className="hintrow"><Hint k="move" /> walk</span>;
  if (touchy) return <span className="hintrow"><Ico name="tap" fallback="👆" /> {walk === "tap" ? "Tap once to walk, tap again to stop" : "Hold the screen to walk"}</span>;
  if (dev === "mouse") return <span className="hintrow">{walk === "tap" ? <>Click once to walk, again to stop, or use </> : <>Hold </>}<Hint k="move" />{walk === "tap" ? "" : " or click and hold to walk"}</span>;
  return <>Hold W / ↑ or click and hold to walk</>;
}
