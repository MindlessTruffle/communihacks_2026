import { useEffect, useState } from "react";
import { useGame } from "../game/store.ts";
import { UNLOCKS } from "../game/content/economy.ts";
import { ADVISOR } from "../game/content/advisor.ts";
import { UI } from "../game/content/uiLines.ts";
import { unlocked } from "../game/sim/sim.ts";
import { speak, sfx, stopVoice } from "../audio/audio.ts";
import { SpeechPanel, AdvisorTip } from "./CourtUI.tsx";
import { Treasury } from "./Treasury.tsx";
import { Continue, EmoIco, Ico, UnlockIco } from "./icons.tsx";

/** A new tool unlocks: its presenter walks into court and explains it in 3 short lines. */
function UnlockIntro({ id }: { id: string }) {
  const u = UNLOCKS.find((x) => x.id === id)!;
  const dismiss = useGame((s) => s.dismissUnlock);
  const [i, setI] = useState(0);
  const lines = [...u.intro];
  useEffect(() => { if (i === 0) sfx("unlock"); }, [i]);
  useEffect(() => {
    if (i < lines.length) speak(u.presenter, lines[i]);
    else speak("advisor", u.realLife);
  }, [i]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => { stopVoice(); sfx("page"); if (i < lines.length) setI(i + 1); else dismiss(); };
  return (
    <div className="layer" onClick={next}>
      {i < lines.length ? (
        <SpeechPanel who={u.presenter} text={lines[i]} onReplay={() => speak(u.presenter, lines[i])}
          extra={<div className="cost"><UnlockIco id={u.id} fallback={u.icon} /> {u.name} — NEW!</div>} tag={`${i + 1} / ${lines.length}`} />
      ) : (
        <AdvisorTip text={`New: ${u.name}!`} real={u.realLife} onNext={next} />
      )}
      {i < lines.length && <div className="hint-pill panel"><Continue /></div>}
    </div>
  );
}

export function Morning() {
  const run = useGame((s) => s.run)!;
  const morning = useGame((s) => s.morning);
  const unlockIntro = useGame((s) => s.unlockIntro);
  const treasuryOpen = useGame((s) => s.treasuryOpen);
  const setTreasury = useGame((s) => s.setTreasury);
  const close = useGame((s) => s.closeMorning);
  const hasTreasury = unlocked(run, "treasury") || unlocked(run, "goals");

  useEffect(() => {
    if (!unlockIntro && !treasuryOpen) { sfx("scroll"); speak(null, UI.goodMorning); }
  }, [unlockIntro, treasuryOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === "Enter" || e.key === " ") && !unlockIntro && !treasuryOpen) close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unlockIntro, treasuryOpen, close]);

  if (unlockIntro) return <UnlockIntro id={unlockIntro} />;
  if (treasuryOpen) return <Treasury onClose={() => setTreasury(false)} />;
  const lines = morning?.lines ?? [];
  const total = lines.reduce((a, l) => a + l.gold, 0);
  return (
    <div className="center">
      <div className="card panel">
        <div className="ribbon">Day {run.day}</div>
        <div className="big display" style={{ marginBottom: "calc(var(--u)*1)" }}><Ico name="sun" fallback="☀️" /> {UI.goodMorning}</div>
        <div className="rows">
          {lines.map((l, i) => (
            <div key={i} className="row" style={{ animation: `pop .3s ${i * 0.12}s both` }}>
              <span className="ico-cell"><EmoIco e={l.icon} /></span><span>{l.text}</span>
              <span className={l.gold >= 0 ? "pos" : "neg"} style={{ marginLeft: "auto" }}>{l.gold >= 0 ? "+" : ""}{l.gold} <Ico name="coin" fallback="🪙" /></span>
            </div>
          ))}
        </div>
        {lines.length > 1 && <div className="med display">Total: <span className={total >= 0 ? "pos" : "neg"}>{total >= 0 ? "+" : ""}{total}</span> <Ico name="coin" fallback="🪙" /></div>}
        {run.day % 7 >= 4 && <p className="small" style={{ fontWeight: 700 }}><Ico name="crown" fallback="🏰" /> {run.day % 7 === 6 ? ADVISOR.upkeepTomorrow : ADVISOR.upkeepSoon}</p>}
        <div className="footer stack">
          <button className="btn gold hero" autoFocus onClick={() => { sfx("click"); stopVoice(); close(); }}><Ico name="crown" fallback="👑" /> Open the court <span className="go">▶</span></button>
          {hasTreasury && <button className="btn ghost sm" onClick={() => { sfx("door"); setTreasury(true); }}><Ico name="vault" fallback="🏦" /> Treasury</button>}
        </div>
      </div>
    </div>
  );
}
