// Multiplayer simulation ("party mode" preview): a scripted ~40 s showcase of a 10-player classroom match, Day 1.
// Mounted by App.tsx in place of the normal scene + UI while `useSim().open`. The real run (useGame) is frozen (its canvas is paused, its
// UI is hidden and deaf to the keyboard) and is not written to; everything here lives in simStore.ts.
import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { getDevice } from "../platform/device.ts";
import { HIGH, RENDERER_TONEMAPPING } from "../scenes/look.tsx";
import { playMusic, currentMusic, sfx } from "../audio/audio.ts";
import { vfx } from "../fx/vfx.ts";
import "./sim.css";
import { JOIN_AT, JOIN_ORDER, LOBBY_PRESS_AT, T, VISITS, VISIT_LEN, VISIT_START, VERDICT_AT, STREET_COINS, STREET_DOOR_PLAYERS, MARKET_SAVE } from "./simData.ts";
import { ORDER, simClock, useSim, type Section } from "./simStore.ts";
import { SimUI } from "./SimUI.tsx";
import { TagProjector } from "./simActors.tsx";
import { SimCourtScene } from "./SimCourt.tsx";
import { SimStreetScene, STREET_POP_AT } from "./SimStreet.tsx";
import { SimMarketScene, MARKET_PAY_AT } from "./SimMarket.tsx";

const sceneKey = (s: Section) => (s === "lobby" || s === "court" ? "court" : s === "street" ? "street" : "market");
const MUSIC: Record<Section, string> = { lobby: "title", court: "court", street: "street", market: "market", end: "title" };
const TITLE: Partial<Record<Section, string>> = { court: "Morning court", street: "Evening street", market: "Night market" };
const POST_START = 0.9; // seconds from "Start Day 1" pressed to the curtain

interface Ev { at: number; essential?: boolean; run(skipped: boolean): void }

function lobbyEvents(): Ev[] {
  const ev: Ev[] = JOIN_ORDER.map((p, j) => ({
    at: JOIN_AT[j], essential: true,
    run: (skipped) => {
      const st = useSim.getState();
      if (!st.joined.includes(p)) st.patch({ joined: [...st.joined, p] });
      if (!skipped) { sfx("pop", { volume: 0.5, rate: 0.95 + j * 0.03 }); sfx("good", { volume: 0.45, rate: 0.85 + j * 0.06 }); }
    },
  }));
  ev.push({ at: LOBBY_PRESS_AT, run: () => { if (!useSim.getState().startPressed) { useSim.getState().patch({ startPressed: true }); } } });
  return ev;
}

function courtEvents(): Ev[] {
  const ev: Ev[] = [];
  VISITS.forEach((v, k) => {
    const s = VISIT_START + k * VISIT_LEN;
    ev.push({ at: s, run: () => { useSim.getState().patch({ visit: k, visitStep: "ask", votes: { yes: [], no: [] }, verdict: null }); sfx("door", { volume: 0.3 }); } });
    v.votes.forEach((c, p) => {
      const fl = v.flips.find((f) => f[0] === p), other = c === "yes" ? "no" : "yes";
      const add = (col: "yes" | "no") => { const st = useSim.getState(); if (st.visit === k) st.patch({ votes: { ...st.votes, [col]: [...st.votes[col], p] } }); };
      const tick = (col: "yes" | "no") => { sfx("tick", { volume: 0.5, rate: col === "yes" ? 1.3 : 0.78 }); sfx("pop", { volume: 0.22, rate: col === "yes" ? 1.2 : 0.9 }); };
      if (fl) {
        ev.push({ at: s + fl[1], run: () => { add(other); tick(other); } });
        ev.push({ at: s + v.at[p], run: () => {
          const st = useSim.getState(); if (st.visit !== k) return;
          st.patch({ votes: { ...st.votes, [other]: st.votes[other].filter((x) => x !== p) } }); add(c); tick(c); sfx("hmm", { volume: 0.25 });
        } });
      } else ev.push({ at: s + v.at[p], run: () => { add(c); tick(c); } });
    });
    ev.push({
      at: s + VERDICT_AT, essential: true,
      run: (skipped) => {
        const st = useSim.getState(), d = v.delta;
        st.patch({
          visit: k, visitStep: "verdict", verdict: { choice: v.choice, yes: v.yes, no: v.no, line: v.choice === "yes" ? v.yesLine : v.noLine },
          gold: st.gold + d.gold, happiness: Math.min(100, st.happiness + d.happiness), people: st.people + d.people,
        });
        if (skipped) return;
        sfx("stamp", { volume: 0.7 }); sfx(v.choice === "yes" ? "yes" : "no", { volume: 0.8 });
        if (d.happiness + d.people + d.gold >= 0) sfx("good", { volume: 0.5 });
        // per-player coin trickles: the voters who won send coins to the class pile (or spend them)
        const goldEl = document.querySelector<HTMLElement>('[data-sim-stat="gold"]');
        const winners = v.votes.map((c, i) => (c === v.choice ? i : -1)).filter((i) => i >= 0);
        if (d.gold > 0) winners.forEach((i, n) => setTimeout(() => {
          const r = document.querySelector<HTMLElement>(`[data-sticker="${i}"]`)?.getBoundingClientRect();
          vfx.coinsTo(goldEl, 1, r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : undefined);
        }, n * 70));
        else if (d.gold < 0 && goldEl) { vfx.burst("coins", goldEl, { n: 6 }); sfx("coinOut", { volume: 0.7 }); }
        else if (d.people > 0 || d.happiness > 0) vfx.burst("stars", vfx.pct(50, 70), { n: 10 });
      },
    });
  });
  return ev;
}

function streetEvents(): Ev[] {
  // door players come back from the minigame with coins (mirrors SimStreet's T_POP; timing is approximate on purpose, the HUD just counts up)
  return [{ at: STREET_POP_AT, essential: true, run: (skipped) => { const st = useSim.getState(); st.patch({ gold: st.gold + STREET_COINS * STREET_DOOR_PLAYERS.length }); if (!skipped) { sfx("coinIn", { volume: 0.7 }); } } }];
}
function marketEvents(): Ev[] {
  return [{
    at: MARKET_PAY_AT + 1.2, essential: true,
    run: (skipped) => {
      const total = MARKET_SAVE.reduce((a, b) => a + b, 0), st = useSim.getState();
      st.patch({ gold: st.gold + total, saved: total, caption: "At the till: the class saved " + total + " gold!" });
      if (!skipped) { sfx("coinIn", { volume: 0.8 }); vfx.burst("coins", document.querySelector<HTMLElement>('[data-sim-stat="gold"]') ?? vfx.pct(12, 12), { n: 8 }); }
    },
  }];
}
const eventsFor = (s: Section): Ev[] => (s === "lobby" ? lobbyEvents() : s === "court" ? courtEvents() : s === "street" ? streetEvents() : s === "market" ? marketEvents() : []).sort((a, b) => a.at - b.at);
const DUR: Record<Section, number> = { lobby: Infinity, court: T.court, street: T.street, market: T.market, end: Infinity };

export default function MultiplayerSim() {
  const section = useSim((s) => s.section);
  const runId = useSim((s) => s.runId);

  // Director: advances the section clock, fires timeline events, switches sections behind a curtain.
  useEffect(() => {
    let raf = 0, last = performance.now(), closing = false, lifting = false, pressedAt = -1;
    let cur: Section = "lobby", evs = eventsFor("lobby"), idx = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (fn: () => void, ms: number) => { const h = setTimeout(() => { timers.delete(h); fn(); }, ms); timers.add(h); };
    playMusic(MUSIC.lobby);

    const enter = (next: Section) => {
      cur = next; simClock.section = next; simClock.t = 0; evs = eventsFor(next); idx = 0; pressedAt = -1;
      const sameScene = sceneKey(next) === sceneKey(useSim.getState().section);
      useSim.getState().patch({ section: next, ready: sameScene, bubbles: {}, caption: null });
      playMusic(MUSIC[next]);
      if (next === "end") { sfx("dayDone", { volume: 0.9 }); later(() => sfx("stars", { volume: 0.6 }), 700); useSim.getState().patch({ curtain: false }); }
      closing = false;
    };
    const goTo = (next: Section) => {
      if (closing) return;
      closing = true;
      if (next === "end") { enter(next); return; }
      useSim.getState().patch({ curtain: true, title: TITLE[next] ?? null });
      sfx("whoosh", { volume: 0.55 });
      later(() => enter(next), 400);
    };
    const finish = () => { // run what the section still owes the state (skip)
      while (idx < evs.length) { const e = evs[idx++]; if (e.essential) e.run(true); }
    };
    const skip = () => {
      if (closing || cur === "end") return;
      const next = ORDER[ORDER.indexOf(cur) + 1];
      finish();
      if (cur === "lobby") useSim.getState().patch({ joined: JOIN_ORDER.slice(), startPressed: true });
      goTo(next);
    };

    let lastSkip = useSim.getState().skipReq;
    const unsub = useSim.subscribe((s) => { if (s.skipReq !== lastSkip) { lastSkip = s.skipReq; skip(); } });

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      const st = useSim.getState();
      if (!st.open || document.hidden) return;
      if (st.curtain && st.ready && !closing && !lifting) { lifting = true; later(() => { useSim.getState().patch({ curtain: false }); lifting = false; }, 260); }
      const running = !closing && !st.curtain && (cur === "lobby" || st.ready);
      if (!running) return;
      simClock.t += dt;
      while (idx < evs.length && evs[idx].at <= simClock.t) evs[idx++].run(false);
      if (cur === "lobby") {
        if (st.startPressed && pressedAt < 0) { pressedAt = simClock.t; sfx("fanfare", { volume: 0.7 }); }
        if (pressedAt >= 0 && simClock.t - pressedAt >= POST_START) goTo("court");
      } else if (simClock.t >= DUR[cur]) goTo(ORDER[ORDER.indexOf(cur) + 1]);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); unsub(); timers.forEach(clearTimeout); };
  }, [runId]);

  // Take over the look (day theme) and the music; give both back on exit.
  useEffect(() => {
    const html = document.documentElement, prevTheme = html.dataset.theme, prevMusic = currentMusic();
    html.dataset.theme = "day";
    return () => { if (prevTheme === undefined) delete html.dataset.theme; else html.dataset.theme = prevTheme; playMusic(prevMusic); };
  }, []);

  const key = sceneKey(section);
  return (
    <div className="sim-root" role="region" aria-label="Multiplayer simulation">
      <div className="sim-canvas" aria-hidden="true">
        <Canvas
          key={runId}
          shadows
          dpr={getDevice().form === "phone" ? [1, 1.25] : HIGH ? [1, 1.75] : [1, 1.5]}
          gl={{ antialias: !HIGH, stencil: false, powerPreference: "high-performance", toneMapping: RENDERER_TONEMAPPING, toneMappingExposure: 1.05 }}
          camera={{ fov: 30, position: [0, 4.6, 23] }}
        >
          <Suspense fallback={null}>
            {key === "court" && <SimCourtScene key={"c" + runId} />}
            {key === "street" && <SimStreetScene key={"s" + runId} />}
            {key === "market" && <SimMarketScene key={"m" + runId} section={section} />}
          </Suspense>
          <TagProjector />
        </Canvas>
      </div>
      <SimUI />
    </div>
  );
}
