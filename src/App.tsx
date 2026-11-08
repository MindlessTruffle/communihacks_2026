import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, useGLTF, useProgress } from "@react-three/drei";
import { useGame, loadSave } from "./game/store.ts";
import { CourtScene } from "./scenes/CourtScene.tsx";
import { preloadCore } from "./scenes/common.tsx";
import { HIGH, RENDERER_TONEMAPPING } from "./scenes/look.tsx";
import { CourtUI } from "./ui/CourtUI.tsx";
import { Morning } from "./ui/Morning.tsx";
import { Summary } from "./ui/Summary.tsx";
import { Title, Setup, ReignEnd } from "./ui/Title.tsx";
import { MenuButton, PhaseDots, Stats } from "./ui/Hud.tsx";
import { AdminPanel, ConfirmDialog, PauseMenu, RotatePrompt, useAdminShortcut } from "./ui/Menus.tsx";
import { playMusic, preloadSfx, suspendAudio } from "./audio/audio.ts";
import { Captions, LiveRegion, useApplySettings, useInputMode } from "./platform/a11y.tsx";
import { haptic, setWalkMode, getDevice } from "./platform/device.ts";
import { Ico } from "./ui/icons.tsx";

// Heavy / rarely-needed pieces are split out: the ElevenLabs SDK only loads when a conversation opens.
const Conversation = lazy(() => import("./convai/Conversation.tsx").then((m) => ({ default: m.Conversation })));
const importStreet = () => import("./scenes/StreetScene.tsx");
const importMarket = () => import("./scenes/MarketScene.tsx");
const importStreetUI = () => import("./ui/StreetUI.tsx");
const importMarketUI = () => import("./ui/MarketUI.tsx");
const StreetScene = lazy(importStreet);
const MarketScene = lazy(importMarket);
const StreetUI = lazy(importStreetUI);
const MarketUI = lazy(importMarketUI);

preloadCore();
preloadSfx();

const MUSIC: Record<string, string> = {
  title: "title", setup: "title", morning: "court", court: "court", summary: "court",
  street: "street", budget: "street", market: "market", checkout: "market", "reign-review": "review", "reign-end": "review",
};

const TIPS = [
  "There are no timers. Take all the time you like.",
  "Every choice teaches something about money.",
  "Be kind to the people you meet.",
  "Stuck? Ask Ollie the owl for a tip.",
];

function Loader() {
  const { progress, active } = useProgress();
  const [gone, setGone] = useState(false);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const done = !active && progress >= 100;
  useEffect(() => {
    if (done) { const t = setTimeout(() => setGone(true), 500); return () => clearTimeout(t); }
    setGone(false);
  }, [done]);
  if (gone) return null;
  return (
    <div className="loading" style={{ opacity: done ? 0 : 1, pointerEvents: done ? "none" : "auto" }} role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
      <div style={{ textAlign: "center" }}>
        <div className="logo" style={{ fontSize: "calc(var(--u)*7)" }}>Royal Concerns</div>
        <div className="bar"><i style={{ width: `${Math.max(6, progress)}%` }} /></div>
        <div className="loading-tip">{tip}</div>
      </div>
    </div>
  );
}

const sceneKey = (phase: string) => (phase === "street" || phase === "budget" ? "street" : phase === "market" || phase === "checkout" ? "market" : "court");

function SceneFor({ phase }: { phase: string }) {
  const k = sceneKey(phase);
  if (k === "street") return <StreetScene />;
  if (k === "market") return <MarketScene />;
  return <CourtScene />;
}

export default function App() {
  const phase = useGame((s) => s.phase);
  const settings = useGame((s) => s.settings);
  const convo = useGame((s) => !!s.convo);
  const minigame = useGame((s) => s.minigame);
  const [menu, setMenu] = useState(false);
  const [confirmNew, setConfirmNew] = useState<number | null>(null);
  const prevPhase = useRef(phase);
  useAdminShortcut();
  useApplySettings(settings);
  useInputMode();

  useEffect(() => { playMusic(MUSIC[phase] ?? "court"); }, [phase]);

  // "Are you sure?" when starting a new reign while a saved one exists (Title.tsx just goes to "setup").
  useEffect(() => {
    if (phase === "setup" && prevPhase.current === "title") {
      const s = loadSave();
      if (s) setConfirmNew(s.run.day);
    }
    prevPhase.current = phase;
  }, [phase]);

  // Prefetch the next scene's code while the player is busy with the current one.
  const sk = sceneKey(phase);
  useEffect(() => {
    const idle = (cb: () => void) => ((window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500)))(cb);
    if (sk === "court") idle(() => { importStreet(); importStreetUI(); });
    if (sk === "street") idle(() => { importMarket(); importMarketUI(); useGLTF.preload("/models/basket.glb"); });
  }, [sk]);

  // Walking style (hold vs tap) for the street.
  const walkReset = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (phase !== "street") return;
    let dead = false;
    importStreet().then((m) => { if (!dead) walkReset.current = setWalkMode(m.walkInput, settings.walkMode); });
    return () => { dead = true; walkReset.current?.(); walkReset.current = null; };
  }, [phase, settings.walkMode]);
  useEffect(() => { walkReset.current?.(); }, [convo, minigame, menu]);

  // Esc / gamepad Start: open the pause menu, or go "back" in whatever is open.
  const closeMenu = useCallback(() => setMenu(false), []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat) return;
      if (menu || confirmNew !== null) { window.dispatchEvent(new CustomEvent("rc-back")); return; }
      if (useGame.getState().adminOpen) { useGame.getState().admin(false); return; }
      if (document.querySelector(".item-pop")) return; // market item card closes itself on Esc
      setMenu(true);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [menu, confirmNew]);

  // Tab hidden: silence everything, resume on return.
  useEffect(() => {
    const v = () => suspendAudio(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, []);

  // Tiny haptic tick on every button press (phones that support it).
  useEffect(() => {
    const d = (e: PointerEvent) => { if (e.pointerType === "touch" && (e.target as HTMLElement)?.closest?.("button,[role=button],[role=radio],[role=switch],[role=tab]")) haptic("light"); };
    window.addEventListener("pointerdown", d, true);
    return () => window.removeEventListener("pointerdown", d, true);
  }, []);

  const inGame = !["title", "setup", "reign-end"].includes(phase);
  const showGear = inGame && !convo && phase !== "reign-review";
  const showHud = showGear && !minigame;
  return (
    <div className="app">
      <div className="canvas-wrap" aria-hidden="true">
        <Canvas
          shadows
          dpr={getDevice().form === "phone" ? [1, 1.25] : HIGH ? [1, 1.75] : [1, 1.5]}
          gl={{ antialias: !HIGH, stencil: false, powerPreference: "high-performance", toneMapping: RENDERER_TONEMAPPING, toneMappingExposure: 1.05 }}
          camera={{ fov: 30, position: [0, 3.5, 16] }}
        >
          <AdaptiveDpr pixelated={false} />
          <Suspense fallback={null}>
            <SceneFor phase={phase} />
          </Suspense>
        </Canvas>
      </div>

      <main className="overlay" aria-label="Royal Concerns">
        <Suspense fallback={null}>
          {phase === "title" && <Title />}
          {phase === "setup" && <Setup />}
          {phase === "morning" && <Morning />}
          {phase === "court" && <CourtUI />}
          {phase === "summary" && <Summary />}
          {(phase === "street" || phase === "budget") && <StreetUI />}
          {(phase === "market" || phase === "checkout") && <MarketUI />}
          {phase === "reign-end" && <ReignEnd />}
          {convo && <Conversation />}
          {showHud && <><Stats /><PhaseDots /></>}
          {showGear && <MenuButton onClick={() => setMenu(true)} />}
          {!inGame && !menu && <button className="corner-btn title-gear" onClick={() => setMenu(true)} aria-label="Options"><Ico name="gear" fallback="⚙️" /></button>}
          <Captions />
          {menu && <PauseMenu onClose={closeMenu} />}
          {confirmNew !== null && (
            <ConfirmDialog
              title="New reign?" danger
              body={`You have a saved reign on day ${confirmNew}. A new reign will replace it.`}
              no="Keep my reign" yes="Start new reign"
              onNo={() => { setConfirmNew(null); useGame.getState().continueGame(); }}
              onYes={() => setConfirmNew(null)}
            />
          )}
          <AdminPanel />
        </Suspense>
      </main>
      <div className="veil" key={phase} aria-hidden="true" />
      <div className="curtain" key={"c" + sk} aria-hidden="true" />
      <LiveRegion />
      <Loader />
      <RotatePrompt />
    </div>
  );
}
