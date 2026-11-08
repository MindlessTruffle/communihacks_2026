import { useEffect, useState } from "react";
import { useGame } from "../game/store.ts";

// ---------- UI theme by phase ----------
// Day phases use the hand-drawn Codex art (public/ui/frames + public/ui/icons);
// evening/night phases use the Kenney RPG UI pack (public/ui/kenney). CSS keys off :root[data-theme].
const NIGHT_PHASES = new Set(["street", "budget", "market", "checkout"]);
export const themeFor = (phase: string) => (NIGHT_PHASES.has(phase) ? "night" : "day");
if (typeof document !== "undefined") {
  const apply = (phase: string) => { document.documentElement.dataset.theme = themeFor(phase); };
  apply(useGame.getState().phase);
  useGame.subscribe((s, prev) => { if (s.phase !== prev.phase) apply(s.phase); });
}

// hand-drawn wobble: tiny low-frequency displacement so raster icons never look perfectly vector-clean
if (typeof document !== "undefined" && !document.getElementById("rc-hand-svg")) {
  const d = document.createElement("div"); d.id = "rc-hand-svg"; d.setAttribute("aria-hidden", "true"); d.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  d.innerHTML = '<svg width="0" height="0"><filter id="rc-hand" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="3.2" xChannelSelector="R" yChannelSelector="G"/></filter></svg>';
  document.body.appendChild(d);
}

/** PNG icon from public/ui/icons/<name>.png; falls back to an emoji (or children) if the file is missing. */
export function Ico({ name, fallback, size, alt = "" }: { name: string; fallback?: React.ReactNode; size?: string; alt?: string }) {
  const [bad, setBad] = useState(false);
  if (bad) return <span className="ico-fallback" aria-hidden={alt ? undefined : true} style={size ? { fontSize: size } : undefined}>{fallback}</span>;
  return <img className="ico-img" src={`/ui/icons/${name}.png`} alt={alt} draggable={false} onError={() => setBad(true)}
    style={size ? { width: size, height: size } : undefined} />;
}

// Inline SVG icons below are only the fallback when a PNG is missing.
const S = { stroke: "#2b2118", strokeWidth: 7, strokeLinejoin: "round" as const };

const PeopleIconSvg = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <circle cx="50" cy="30" r="17" fill="#2f6fd6" {...S} />
    <path d="M20 88 C20 58 80 58 80 88 Z" fill="#2f6fd6" {...S} />
  </svg>
);
const HappyIconSvg = ({ sad = false }: { sad?: boolean }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <path d="M14 62 C10 30 34 14 52 14 C76 14 92 34 88 60 C84 84 64 88 50 88 C30 88 16 80 14 62 Z" fill="#3fae49" {...S} />
    <circle cx="38" cy="44" r="7" fill="#2b2118" /><circle cx="64" cy="44" r="7" fill="#2b2118" />
    {sad ? <path d="M36 72 Q51 60 66 72" fill="none" {...S} strokeWidth={6} strokeLinecap="round" />
      : <path d="M34 62 Q51 78 68 62" fill="none" {...S} strokeWidth={6} strokeLinecap="round" />}
  </svg>
);
const CoinIconSvg = () => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <ellipse cx="50" cy="54" rx="40" ry="32" fill="#c47f12" {...S} />
    <ellipse cx="50" cy="46" rx="40" ry="32" fill="#f2b627" {...S} />
    <ellipse cx="50" cy="46" rx="24" ry="17" fill="none" stroke="#c47f12" strokeWidth="6" />
  </svg>
);

export const PeopleIcon = () => <Ico name="people" fallback={<PeopleIconSvg />} />;
export const HappyIcon = ({ sad = false }: { sad?: boolean }) => <Ico name={sad ? "sad" : "happy"} fallback={<HappyIconSvg sad={sad} />} />;
export const CoinIcon = () => <Ico name="coin" fallback={<CoinIconSvg />} />;
export const GemIcon = ({ color = "#7b4fc9" }: { color?: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%">
    <path d="M30 18 H70 L90 42 L50 90 L10 42 Z" fill={color} {...S} />
    <path d="M10 42 H90 M30 18 L42 42 L50 90 L58 42 L70 18" fill="none" stroke="#2b2118" strokeWidth="4" />
  </svg>
);
export const GEM_COLORS: Record<string, string> = {
  trustworthy: "#3aa0ff", respect: "#ff8a3d", responsibility: "#7b4fc9", fairness: "#2fb176", caring: "#ff5c8a", citizenship: "#f2b627",
};
export const GEM_LABEL: Record<string, string> = {
  trustworthy: "Trust", respect: "Respect", responsibility: "Responsible", fairness: "Fair", caring: "Caring", citizenship: "Helper",
};

/** Treasury / unlock icons by unlock id (falls back to the emoji from the content file). */
export const UNLOCK_ICON: Record<string, string> = {
  treasury: "vault", goals: "jar", gic: "crystal", job: "hammer", shares: "chart", chest: "chest",
  credit: "card", insurance: "shield", rdsp: "tree", resp: "book", pension: "cottage",
};
export const UnlockIco = ({ id, fallback }: { id?: string; fallback?: string }) =>
  id && UNLOCK_ICON[id] ? <Ico name={UNLOCK_ICON[id]} fallback={fallback} /> : <span>{fallback}</span>;

// ---------- emoji -> generated icon mapping ----------
const EMO_ICON: Record<string, string> = {
  "🪙": "coin", "💰": "coin", "🔁": "repeat", "➕": "plus", "🏦": "vault", "🧰": "chest", "💳": "card", "💎": "crystal",
  "🥖": "bread", "🍞": "bread", "⚒️": "hammer", "🛠️": "hammer", "📜": "scroll", "🧪": "medicine", "🕯️": "candles", "🥛": "milk",
  "🥕": "carrots", "🥬": "cabbage", "🍎": "apples", "🥚": "eggs", "🧀": "cheese", "🐟": "fish", "🍪": "cookie", "🍵": "tea",
  "🎂": "cake", "🍨": "sundae", "🍩": "donuts", "🍫": "candy", "🧃": "juice", "✅": "boxchecked", "⬜": "box", "⚠️": "warning",
  "🤔": "bulb", "📝": "note", "🛡️": "shield", "🏠": "house", "🦉": "owl", "⭐": "star", "🌟": "star", "💡": "bulb", "📈": "chart",
  "🌳": "tree", "📚": "book", "🏡": "cottage", "🫙": "jar", "👆": "tap", "🏰": "crown",
};
/** Any emoji from the content files -> generated PNG when we have one, else the emoji itself. */
export const EmoIco = ({ e }: { e?: string }) => (e && EMO_ICON[e] ? <Ico name={EMO_ICON[e]} fallback={e} /> : <span>{e}</span>);
/** Food / market item by id (art in public/ui/icons). */
export const FOOD_ICON: Record<string, string> = { wine: "juice" };
export const FoodIco = ({ id, emoji }: { id: string; emoji?: string }) => <Ico name={FOOD_ICON[id] ?? id} fallback={emoji ?? "📦"} />;

// ---------- input glyphs / prompts (html[data-input]) ----------
export type InputKind = "touch" | "mouse" | "gamepad" | "";
export function useInput(): InputKind {
  const read = () => (typeof document === "undefined" ? "" : ((document.documentElement.dataset.input as InputKind) ?? ""));
  const [k, setK] = useState<InputKind>(read);
  useEffect(() => { const f = () => setK(read()); f(); window.addEventListener("rc-device", f); return () => window.removeEventListener("rc-device", f); }, []);
  return k;
}
export type HintKey = "yes" | "no" | "next" | "move" | "menu" | "enter" | "back";
const KEY_TEXT: Record<HintKey, string> = { yes: "Y", no: "N", next: "Space", move: "WASD", menu: "Esc", enter: "Enter", back: "Esc" };
const PAD: Record<HintKey, { img: string; t?: string }> = {
  yes: { img: "pad_x", t: "X" }, no: { img: "pad_b", t: "B" }, next: { img: "pad_a", t: "A" }, enter: { img: "pad_a", t: "A" },
  move: { img: "pad_stick" }, menu: { img: "pad_start" }, back: { img: "pad_b", t: "B" },
};
/** A key / pad glyph for the current input device. Touch shows nothing. Missing attribute -> plain text fallback. */
export function Hint({ k, force }: { k: HintKey; force?: InputKind }) {
  const dev = force ?? useInput();
  if (dev === "touch") return null;
  if (dev === "gamepad") { const p = PAD[k]; return <span className={"glyph pad"} aria-hidden><Ico name={p.img} fallback={p.t ?? k} />{p.t && <b>{p.t}</b>}</span>; }
  if (dev === "mouse" && k === "move")
    return <span className="glyph-group" aria-hidden>{["W", "A", "S", "D"].map((c) => <span key={c} className="glyph key"><Ico name="key" fallback="" /><b>{c}</b></span>)}</span>;
  if (dev === "mouse") {
    const wide = k === "next" || k === "enter";
    return <span className={"glyph key" + (wide ? " wide" : "") + (k === "move" ? " cluster" : "")} aria-hidden>
      <Ico name={k === "move" ? "keycluster" : wide ? "keywide" : "key"} fallback="" /><b>{KEY_TEXT[k]}</b></span>;
  }
  return <span className="glyph text" aria-hidden>[{KEY_TEXT[k]}]</span>;
}
/** "Tap to continue" per device. */
export function Continue({ label = "Continue" }: { label?: string }) {
  const dev = useInput();
  if (dev === "touch" || dev === "") return <span>Tap to {label.toLowerCase()} ▶</span>;
  return <span className="cont">{<Hint k="next" />} {label} ▶</span>;
}
