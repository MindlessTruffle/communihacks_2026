import { useEffect } from "react";
import { useGame } from "../game/store.ts";
import { courtSummary } from "../game/sim/sim.ts";
import { summarySentence, ADVISOR } from "../game/content/advisor.ts";
import { speak, sfx, stopVoice } from "../audio/audio.ts";
import { CoinIcon, HappyIcon, Ico, PeopleIcon } from "./icons.tsx";

export function Summary() {
  const run = useGame((s) => s.run)!;
  const startEvening = useGame((s) => s.startEvening);
  const { dp, dh, dg } = courtSummary(run);
  const sentence = summarySentence(dp, dh, dg);
  const readAloud = useGame((s) => s.settings.readAloud);

  useEffect(() => {
    sfx("dayDone");
    if (readAloud) {
      const say = `Day ${run.day} complete! People ${dp >= 0 ? "plus" : "minus"} ${Math.abs(dp)}. Happiness ${dh >= 0 ? "plus" : "minus"} ${Math.abs(dh)}. Wealth ${dg >= 0 ? "plus" : "minus"} ${Math.abs(dg)}.`;
      speak(null, say).then(() => speak(null, sentence));
    } else speak(null, sentence);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = () => { stopVoice(); sfx("click"); speak("advisor", ADVISOR.evening); startEvening(); };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (document.querySelector(".notebook")) return; if (e.key === " " || e.key === "Enter") go(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  const cls = (n: number) => (n > 0 ? "pos" : n < 0 ? "neg" : "neu");
  const fmt = (n: number) => (n >= 0 ? "+" : "") + n;
  return (
    <div className="center" onClick={go}>
      <div className="card panel" role="dialog" aria-label={`Day ${run.day} complete`}>
        <div className="ribbon">Day {run.day} complete!</div>
        <div className="rows">
          <div className="row"><span style={{ width: "1.4em", height: "1.4em" }}><PeopleIcon /></span><span>Population</span><span className={cls(dp)}>{fmt(dp)}</span></div>
          <div className="row"><span style={{ width: "1.4em", height: "1.4em" }}><HappyIcon sad={dh < 0} /></span><span className={cls(dh)}>Happiness {fmt(dh)}</span></div>
          <div className="row"><span style={{ width: "1.4em", height: "1.4em" }}><CoinIcon /></span><span className={cls(dg)}>Wealth {fmt(dg)}</span></div>
        </div>
        <div style={{ fontSize: "calc(var(--u)*7)", lineHeight: 1.1 }}>{dh >= 0 && dp >= 0 ? <Ico name="house" fallback="🏠" /> : "🏚️"}</div>
        <div className="big display">{sentence}</div>
        <div className="footer"><button className="btn gold hero" autoFocus onClick={(e) => { e.stopPropagation(); go(); }}><Ico name="lantern" fallback="🏮" /> Continue <span className="go">▶</span></button></div>
      </div>
    </div>
  );
}
