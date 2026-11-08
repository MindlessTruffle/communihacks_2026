// Accessibility + settings plumbing: dialog focus trap, screen-reader live region, captions, settings -> DOM/CSS/audio.
import { useEffect, useRef, useState, type RefObject } from "react";
import { useGame, type Settings } from "../game/store.ts";
import { onCaption, setVolumes, type Caption } from "../audio/audio.ts";
import { CHARACTERS } from "../game/content/characters.ts";

export const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="tab"], [tabindex]:not([tabindex="-1"])';

export function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Modal-ish dialog behaviour: focus moves in, Tab is trapped, focus returns on close.
 * Key presses inside are kept from reaching the game's window-level shortcuts (Enter/Space/Y/N...).
 * Escape: if `onEscape` is given it is handled (and swallowed); otherwise it bubbles to the global pause handler.
 */
export function useDialog<T extends HTMLElement>(ref: RefObject<T | null>, opts: { onEscape?: () => void; initial?: string } = {}) {
  const esc = useRef(opts.onEscape);
  esc.current = opts.onEscape;
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const prev = document.activeElement as HTMLElement | null;
    root.setAttribute("data-modal", "");
    const first = (opts.initial && root.querySelector<HTMLElement>(opts.initial)) || root.querySelector<HTMLElement>("[data-autofocus]") || focusables(root)[0];
    if (!root.contains(document.activeElement)) first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "Escape" && esc.current) { e.preventDefault(); e.stopPropagation(); esc.current(); return; }
      if (e.key === "Tab") {
        const f = focusables(root);
        if (!f.length) return;
        const i = f.indexOf(document.activeElement as HTMLElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && (i === f.length - 1 || i === -1)) { e.preventDefault(); f[0].focus(); }
      }
      if (e.key === "Escape") return; // bubbles to the global pause handler
      // typing in a text box is fine; everything else stays inside the dialog
      if (t?.matches?.("input[type=text],input:not([type]),textarea") && e.key !== "Enter") { e.stopPropagation(); return; }
      e.stopPropagation();
    };
    root.addEventListener("keydown", onKey);
    return () => {
      root.removeEventListener("keydown", onKey);
      root.removeAttribute("data-modal");
      if (prev && document.contains(prev) && prev !== document.body) prev.focus({ preventScroll: true });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Visually hidden live region: announces stat changes and screen changes to screen readers. */
export function LiveRegion() {
  const people = useGame((s) => s.run?.people);
  const happy = useGame((s) => s.run?.happiness);
  const gold = useGame((s) => s.run?.gold);
  const day = useGame((s) => s.run?.day);
  const phase = useGame((s) => s.phase);
  const [msg, setMsg] = useState("");
  const prev = useRef<{ p?: number; h?: number; g?: number; d?: number; ph?: string }>({});
  const pending = useRef<string[]>([]);
  const timer = useRef<number | undefined>(undefined);
  const say = (t: string) => {
    pending.current.push(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { setMsg(pending.current.join(". ")); pending.current = []; }, 500);
  };
  useEffect(() => {
    const p = prev.current;
    if (p.d === day) {
      const diff = (name: string, a: number | undefined, b: number | undefined) => {
        if (a === undefined || b === undefined || a === b) return;
        say(`${name} ${b > a ? "up" : "down"} by ${Math.abs(b - a)}, now ${b}`);
      };
      diff("People", p.p, people);
      diff("Happiness", p.h, happy);
      diff("Gold", p.g, gold);
    }
    prev.current = { ...p, p: people, h: happy, g: gold, d: day };
  }, [people, happy, gold, day]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (prev.current.ph === phase) return;
    prev.current.ph = phase;
    const names: Record<string, string> = {
      title: "Title screen", setup: "Choose your ruler", morning: "Morning", court: "Royal court", summary: "Day summary",
      street: "Evening street", budget: "Shopping list", market: "Night market", checkout: "Checkout",
      "reign-review": "Talking with your advisor", "reign-end": "Your reign is over",
    };
    say(`${names[phase] ?? phase}${day ? `. Day ${day}` : ""}`);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{msg}</div>;
}

/** Subtitles for voiced lines. Skipped when the same words are already on screen. */
export function Captions() {
  const on = useGame((s) => s.settings.subtitles);
  const [cap, setCap] = useState<Caption | null>(null);
  useEffect(() => {
    let t: number | undefined;
    const off = onCaption((c) => {
      window.clearTimeout(t);
      window.clearTimeout(chk);
      if (!c || !useGame.getState().settings.subtitles) { setCap(null); return; }
      // wait a moment so a line that is also rendered as on-screen text can be detected
      chk = window.setTimeout(() => show(c), 140);
    });
    let chk: number | undefined;
    const show = (c: Caption) => {
      const needle = c.text.replace(/\s+/g, " ").trim().slice(0, 28).toLowerCase();
      const shown = [...(document.querySelector(".overlay")?.children ?? [])].filter((el) => !el.classList.contains("captions")).map((el) => el.textContent ?? "").join(" ").replace(/\s+/g, " ").toLowerCase();
      const visible = shown.includes(needle);
      if (visible) { setCap(null); return; }
      setCap(c);
      t = window.setTimeout(() => setCap(null), c.ms);
    };
    return () => { off(); window.clearTimeout(t); window.clearTimeout(chk); };
  }, []);
  if (!on || !cap) return null;
  const who = cap.who ? CHARACTERS[cap.who]?.name : null;
  return (
    <div className="captions" aria-hidden="true" key={cap.id}>
      {who && <b>{who}: </b>}{cap.text}
    </div>
  );
}

const loadedFonts = new Set<string>();

/** Push settings into CSS variables, data attributes and the audio engine. */
export function useApplySettings(s: Settings) {
  useEffect(() => {
    setVolumes({ music: s.music, sfx: s.sfx, voice: s.voice, master: s.master, readAloud: s.readAloud });
    const r = document.documentElement;
    r.style.setProperty("--ts", String(s.textScale));
    r.style.setProperty("--spd", String(1 / s.gameSpeed));
    r.dataset.contrast = s.highContrast ? "high" : "normal";
    r.dataset.motion = s.reduceMotion ? "reduce" : "full";
    r.dataset.cb = s.colorBlind ? "on" : "off";
    r.dataset.font = s.dyslexiaFont ? "dyslexia" : "default";
    r.dataset.walk = s.walkMode;
    if (s.dyslexiaFont && !loadedFonts.has("od")) {
      loadedFonts.add("od");
      import("@fontsource/opendyslexic/400.css");
      import("@fontsource/opendyslexic/700.css");
    }
  }, [s]);
}

/** Track last-used input device so focus rings are always visible for keyboard / gamepad users. */
export function useInputMode() {
  useEffect(() => {
    const set = (m: string) => { if (document.documentElement.dataset.focusMode !== m) document.documentElement.dataset.focusMode = m; };
    const k = (e: KeyboardEvent) => { if (!(e as KeyboardEvent & { synthetic?: boolean }).synthetic) set(e.key === "Tab" || e.key.startsWith("Arrow") || e.key === " " || e.key === "Enter" ? "key" : document.documentElement.dataset.focusMode ?? "mouse"); };
    const p = () => set("mouse");
    const g = () => set("pad");
    window.addEventListener("keydown", k, true);
    window.addEventListener("pointerdown", p, true);
    window.addEventListener("rc-pad", g);
    set("mouse");
    return () => { window.removeEventListener("keydown", k, true); window.removeEventListener("pointerdown", p, true); window.removeEventListener("rc-pad", g); };
  }, []);
}
