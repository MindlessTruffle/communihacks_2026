// Platform glue so the web build feels native on desktop, tablet and phone.
// ---------------------------------------------------------------- device profile
export type Form = "phone" | "tablet" | "desktop";
export type InputKind = "touch" | "mouse" | "gamepad";
export type SizeClass = "s" | "m" | "l" | "xl";
export type OS = "ios" | "ipados" | "android" | "windows" | "mac" | "linux" | "chromeos" | "other";
export interface Device {
  form: Form; input: InputKind; size: SizeClass; os: OS; standalone: boolean;
  dpr: 1 | 2 | 3; orientation: "landscape" | "portrait"; recommendedQuality: "high" | "low";
  /** viewport CSS px (changes on every resize / zoom / rotate, so rc-device fires continuously while resizing) */
  w: number; h: number;
}

const mq = (q: string) => (typeof window !== "undefined" ? window.matchMedia?.(q).matches ?? false : false);
type UAData = { mobile?: boolean; platform?: string };
const uaData = () => (navigator as unknown as { userAgentData?: UAData }).userAgentData;

function detectOS(): OS {
  const ua = navigator.userAgent;
  const plat = (uaData()?.platform ?? "").toLowerCase();
  if (/iPhone|iPod/.test(ua)) return "ios";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1 && plat !== "macos")) return "ipados";
  if (plat === "android" || /Android/.test(ua)) return "android";
  if (plat === "chrome os" || /CrOS/.test(ua)) return "chromeos";
  if (plat === "windows" || /Windows/.test(ua)) return "windows";
  if (plat === "macos" || /Macintosh|Mac OS/.test(ua)) return "mac";
  if (plat === "linux" || /Linux|X11/.test(ua)) return "linux";
  return "other";
}

/** Real input events override the guess (hybrid devices). null = no real event yet. */
let lastInput: InputKind | null = null;
const urlOverride = (k: string) => { try { return new URLSearchParams(location.search).get(k); } catch { return null; } };

function compute(): Device {
  const os = detectOS();
  const short = Math.min(screen.width || innerWidth, screen.height || innerHeight);
  const coarse = mq("(pointer: coarse)"), fine = mq("(pointer: fine)"), hover = mq("(hover: hover)");
  const mobileUA = uaData()?.mobile ?? /Mobi|iPhone|iPod|Android.*Mobile/.test(navigator.userAgent);
  let form: Form;
  if (os === "ios" || (mobileUA && short < 600)) form = "phone";
  else if (os === "ipados" || (os === "android" && !mobileUA) || (coarse && !fine && !hover && short >= 600 && short <= 1100)) form = "tablet";
  else if (coarse && !fine && short < 600) form = "phone";
  else form = "desktop";
  const f = urlOverride("form");
  if (f === "phone" || f === "tablet" || f === "desktop") form = f;
  // hardware guess: only a coarse-only device is touch-first; touch-screen laptops start as mouse
  const guess: InputKind = form !== "desktop" && navigator.maxTouchPoints > 0 && !(fine && hover) ? "touch" : coarse && !fine ? "touch" : "mouse";
  const input = lastInput ?? guess;
  const h = innerHeight;
  const w = Math.round(innerWidth), hh = Math.round(innerHeight);
  const size: SizeClass = h <= 480 ? "s" : h <= 800 ? "m" : h <= 1200 ? "l" : "xl";
  const dpr = Math.max(1, Math.min(3, Math.round(devicePixelRatio || 1))) as 1 | 2 | 3;
  const cores = navigator.hardwareConcurrency ?? 4;
  const recommendedQuality = form === "phone" || (form === "tablet" && cores <= 6) ? "low" : "high";
  return {
    form, input, size, os, standalone: isStandalone(), dpr,
    orientation: innerWidth >= innerHeight ? "landscape" : "portrait", recommendedQuality, w, h: hh,
  };
}

let cur: Device | null = null;

/** Fluid UI unit (px per 1u): piecewise-linear in viewport height through hand-tuned anchors, extrapolated proportionally beyond both ends,
 * then capped by width so narrow/odd windows (1000x1000, 4:3) keep cards on screen. Anchors = the old fixed per-bracket values. */
type Anchors = [number, number][];
const DAY_U: Anchors = [[300, 4.5], [375, 5.4], [390, 5.8], [480, 6.8], [720, 8.8], [1080, 12.5], [1440, 16]];
const NIGHT_U: Anchors = [[300, 5.4], [375, 6.4], [400, 7], [480, 8.6], [720, 12], [1080, 17], [1440, 22]];
function lerpAnchors(a: Anchors, h: number): number {
  if (h <= a[0][0]) return a[0][1] * (h / a[0][0]);
  for (let i = 1; i < a.length; i++) if (h <= a[i][0]) { const [h0, u0] = a[i - 1], [h1, u1] = a[i]; return u0 + ((u1 - u0) * (h - h0)) / (h1 - h0); }
  const [hl, ul] = a[a.length - 1]; return ul * (h / hl); // beyond xl (4K, ultrawide): keep growing proportionally
}
export const unitFor = (h: number, w: number, night = false) => {
  const raw = lerpAnchors(night ? NIGHT_U : DAY_U, h);
  return Math.max(3.2, Math.min(raw, w / (night ? 100 : 128)));
};
function applyScale(n: { w: number; h: number }) {
  const st = document.documentElement.style;
  st.setProperty("--ud", unitFor(n.h, n.w).toFixed(2) + "px");
  st.setProperty("--un", unitFor(n.h, n.w, true).toFixed(2) + "px");
  st.setProperty("--vw", n.w + "px"); st.setProperty("--vh", n.h + "px");
}
function apply(n: Device) {
  const r = document.documentElement;
  applyScale(n);
  r.dataset.form = n.form; r.dataset.input = n.input; r.dataset.size = n.size; r.dataset.dpr = String(n.dpr);
  r.dataset.os = n.os; r.dataset.orientation = n.orientation; r.dataset.standalone = String(n.standalone);
}
const same = (a: Device, b: Device) => (Object.keys(a) as (keyof Device)[]).every((k) => a[k] === b[k]);
export function refreshDevice(): Device {
  const n = compute();
  if (cur && same(cur, n)) return cur;
  cur = n; apply(n);
  window.dispatchEvent(new CustomEvent("rc-device", { detail: n }));
  return n;
}
export function getDevice(): Device { return cur ?? refreshDevice(); }
/** Called by real input events; switches prompts live on hybrid devices. */
export function noteInput(k: InputKind) { if (lastInput !== k) { lastInput = k; refreshDevice(); } }

export function startDeviceWatch() {
  refreshDevice();
  // coalesce resize storms into one update per frame; also covers zoom (inner size changes), rotate, visualViewport and DPR changes
  let raf = 0;
  const upd = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; refreshDevice(); }); };
  window.addEventListener("resize", upd);
  window.addEventListener("orientationchange", upd);
  window.visualViewport?.addEventListener("resize", upd);
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(upd).observe(document.documentElement);
  // DPR / browser-zoom change: a resolution media query only matches the current value, so re-arm it after every change
  const armDpr = () => {
    const m = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    m?.addEventListener?.("change", () => { upd(); armDpr(); }, { once: true });
  };
  armDpr();
  for (const q of ["(pointer: coarse)", "(pointer: fine)", "(hover: hover)", "(display-mode: standalone)"]) window.matchMedia?.(q).addEventListener?.("change", upd);
  window.addEventListener("pointerdown", (e) => noteInput(e.pointerType === "touch" ? "touch" : "mouse"), true);
  window.addEventListener("pointermove", (e) => { if (e.pointerType === "mouse") noteInput("mouse"); }, true);
  window.addEventListener("gamepadconnected", upd);
  window.addEventListener("gamepaddisconnected", () => { if (lastInput === "gamepad") { lastInput = null; refreshDevice(); } });
}

/** Primary input is a finger. Touch-screen laptops with a trackpad stay "mouse" until the screen is touched. */
export const isTouch = () => getDevice().input === "touch";
export const isStandalone = () =>
  !!(window.matchMedia?.("(display-mode: standalone)").matches || window.matchMedia?.("(display-mode: fullscreen)").matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true || (window as unknown as { Capacitor?: unknown }).Capacitor);
export const isPhone = () => getDevice().form === "phone";

/** Called on the first user gesture: fullscreen + landscape lock (Android/desktop; iOS ignores) + wake lock. */
export async function goNative() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
  try {
    if (isTouch() && !document.fullscreenElement && !isStandalone()) {
      await (el.requestFullscreen?.({ navigationUI: "hide" }) ?? el.webkitRequestFullscreen?.());
    }
  } catch { /* not allowed: fine */ }
  try {
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    if (isTouch()) await so.lock?.("landscape");
  } catch { /* iOS / desktop: rotate prompt covers it */ }
  requestWakeLock();
}

let wakeLock: { release(): Promise<void> } | null = null;
async function requestWakeLock() {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request(t: string): Promise<{ release(): Promise<void> }> } };
    if (nav.wakeLock && !wakeLock) wakeLock = await nav.wakeLock.request("screen");
  } catch { /* ignore */ }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") { wakeLock = null; requestWakeLock(); }
});

export function haptic(kind: "light" | "medium" | "success" | "soft" = "light") {
  try {
    const pattern = { light: 8, medium: 18, success: [12, 40, 18], soft: [6, 30, 6] }[kind];
    navigator.vibrate?.(pattern as number | number[]);
  } catch { /* ignore */ }
}

/** Block browser-y behaviours: pinch zoom, double-tap zoom, long-press menus, text selection, overscroll. */
export function lockBrowserChrome() {
  const prevent = (e: Event) => e.preventDefault();
  document.addEventListener("gesturestart", prevent, { passive: false });
  document.addEventListener("contextmenu", (e) => {
    if (!(e.target as HTMLElement)?.closest("input,textarea")) e.preventDefault();
  });
  let lastTouch = 0;
  document.addEventListener("touchend", (e) => {
    const now = Date.now();
    if (now - lastTouch < 300 && !(e.target as HTMLElement)?.closest("input,textarea")) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
  document.addEventListener("touchmove", (e) => {
    if ((e as TouchEvent).touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener("dragstart", prevent);
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
    // When a new version takes over, reload once at the next quiet moment (title screen) - never mid-game.
    navigator.serviceWorker.addEventListener("controllerchange", () => { (window as unknown as { __rcSwUpdated?: boolean }).__rcSwUpdated = true; });
  }
}

/**
 * Gamepad polling -> synthetic key events (A=Enter, X=Y, B=N, dpad=arrows, Start=Escape).
 * While a dialog/menu is open (an element with [data-modal]) the d-pad moves focus and A clicks the focused control instead,
 * so every menu is fully playable with a pad.
 */
export function startGamepadBridge() {
  const map: Record<number, string> = { 0: "Enter", 1: "n", 2: "y", 12: "ArrowUp", 13: "ArrowDown", 14: "ArrowLeft", 15: "ArrowRight", 9: "Escape" };
  const prev: Record<string, boolean> = {};
  const modal = () => { const all = document.querySelectorAll<HTMLElement>("[data-modal]"); return all[all.length - 1] ?? null; };
  const FOCUS = 'button:not([disabled]), input:not([disabled]), [role="tab"], [role="radio"], [role="switch"]';
  const moveFocus = (root: HTMLElement, dir: 1 | -1, axis: "v" | "h", key: string) => {
    const f = [...root.querySelectorAll<HTMLElement>(FOCUS)].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const cur = document.activeElement as HTMLElement | null;
    // sliders: left/right changes the value
    if (cur instanceof HTMLInputElement && cur.type === "range" && axis === "h") {
      const step = Number(cur.step) || 0.1;
      cur.value = String(Math.min(Number(cur.max), Math.max(Number(cur.min), Number(cur.value) + dir * step)));
      cur.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }
    if (cur?.getAttribute("role") === "tab" && axis === "h") { cur.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })); return; }
    // spatial: pick the nearest control in that direction, else wrap in DOM order
    const rc = cur?.getBoundingClientRect();
    if (cur && rc && root.contains(cur)) {
      const cx = rc.left + rc.width / 2, cy = rc.top + rc.height / 2;
      let best: HTMLElement | null = null, bestD = Infinity;
      for (const el of f) {
        if (el === cur) continue;
        const r = el.getBoundingClientRect();
        const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
        const forward = axis === "v" ? dy * dir > 4 : dx * dir > 4;
        if (!forward) continue;
        const d = axis === "v" ? Math.abs(dy) + Math.abs(dx) * 3 : Math.abs(dx) + Math.abs(dy) * 3;
        if (d < bestD) { bestD = d; best = el; }
      }
      if (best) { best.focus(); best.scrollIntoView({ block: "nearest" }); return; }
    }
    const i = cur ? f.indexOf(cur) : -1;
    const n = f[(i + dir + f.length) % f.length] ?? f[0];
    n.focus(); n.scrollIntoView({ block: "nearest" });
  };
  const tick = () => {
    for (const gp of navigator.getGamepads?.() ?? []) {
      if (!gp) continue;
      gp.buttons.forEach((b, i) => {
        const k = map[i];
        if (!k) return;
        const id = gp.index + ":" + i;
        const down = b.pressed && !prev[id];
        const up = !b.pressed && prev[id];
        prev[id] = b.pressed;
        if (!down && !up) return;
        if (down) { window.dispatchEvent(new CustomEvent("rc-pad")); noteInput("gamepad"); }
        const m = modal();
        if (m && k !== "Escape") {
          if (!down) return;
          if (!m.contains(document.activeElement)) { (m.querySelector<HTMLElement>("[data-autofocus]") ?? m.querySelector<HTMLElement>(FOCUS))?.focus(); return; }
          if (k === "Enter") { (document.activeElement as HTMLElement).click(); }
          else if (k === "n") window.dispatchEvent(new CustomEvent("rc-back"));
          else if (k === "ArrowUp") moveFocus(m, -1, "v", k);
          else if (k === "ArrowDown") moveFocus(m, 1, "v", k);
          else if (k === "ArrowLeft") moveFocus(m, -1, "h", k);
          else if (k === "ArrowRight") moveFocus(m, 1, "h", k);
          return;
        }
        window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: k }));
      });
    }
    requestAnimationFrame(tick);
  };
  let started = false;
  const start = () => { if (!started) { started = true; requestAnimationFrame(tick); } };
  window.addEventListener("gamepadconnected", start);
  if ([...(navigator.getGamepads?.() ?? [])].some(Boolean)) start();
}

/**
 * Walk mode "tap": StreetUI sets walkInput.hold = true on pointer-down and false on pointer-up.
 * We turn that into a latch: each touch toggles walking on/off. Returns a reset function.
 */
export function setWalkMode(walkInput: { hold: boolean }, mode: "hold" | "tap") {
  let latched = false;
  if (mode === "tap") {
    Object.defineProperty(walkInput, "hold", { configurable: true, enumerable: true, get: () => latched, set: (v: boolean) => { if (v) latched = !latched; } });
  } else {
    Object.defineProperty(walkInput, "hold", { configurable: true, enumerable: true, writable: true, value: false });
  }
  return () => { latched = false; if (mode === "hold") walkInput.hold = false; };
}

/** Shared analog-ish input state for walking (keyboard + touch joystick + gamepad sticks). */
export const move = { x: 0, y: 0, lookX: 0, lookY: 0, hold: false };
const keys = new Set<string>();
window.addEventListener("keydown", (e) => { keys.add(e.key.toLowerCase()); syncKeys(); });
window.addEventListener("keyup", (e) => { keys.delete(e.key.toLowerCase()); syncKeys(); });
window.addEventListener("blur", () => { keys.clear(); syncKeys(); });
function syncKeys() {
  const k = (a: string, b: string) => (keys.has(a) || keys.has(b) ? 1 : 0);
  move.y = k("w", "arrowup") - k("s", "arrowdown");
  move.x = k("d", "arrowright") - k("a", "arrowleft");
}
export function pollGamepadSticks() {
  for (const gp of navigator.getGamepads?.() ?? []) {
    if (!gp) continue;
    const dz = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    const [lx, ly, rx, ry] = gp.axes;
    if (dz(lx) || dz(ly) || dz(rx) || dz(ry)) noteInput("gamepad");
    if (dz(lx) || dz(ly)) { move.x = dz(lx); move.y = -dz(ly); }
    if (dz(rx) || dz(ry)) { move.lookX = dz(rx); move.lookY = dz(ry); }
  }
}
