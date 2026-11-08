// Multiplayer simulation: DOM layer (host lobby, vote tally with stickers, HUD, captions, end card, name tags).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { GummyPortrait } from "../characters/gummy/GummyPortrait.tsx";
import { CHARACTERS } from "../game/content/characters.ts";
import { CoinIcon, HappyIcon, Ico, PeopleIcon } from "../ui/icons.tsx";
import { ROOM_CODE, JOIN_URL, N, PLAYERS, VISITS, SIM_SEED, mulberry } from "./simData.ts";
import { tagEls } from "./simActors.tsx";
import { useSim, type Section } from "./simStore.ts";

// ------------------------------------------------------------------------------------------------ bits
export const Sticker = memo(function Sticker({ i, pop = true, name = false }: { i: number; pop?: boolean; name?: boolean }) {
  const p = PLAYERS[i];
  return (
    <div className={"sim-sticker" + (pop ? " pop" : "")} data-sticker={i} style={{ ["--pc" as string]: p.color }} role="img" aria-label={p.name}>
      <div className="face"><GummyPortrait id={p.id} color={p.color} crown={false} /></div>
      {name && <span className="nm">{p.name}</span>}
    </div>
  );
});

/** Counts toward `value` (eases over ~0.8 s). */
function useCount(value: number, ms = 800) {
  const [shown, setShown] = useState(value);
  const from = useRef(value), cur = useRef(value);
  useEffect(() => {
    from.current = cur.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      cur.current = from.current + (value - from.current) * e;
      setShown(Math.round(cur.current));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

function SimStat({ value, icon, kind }: { value: number; icon: React.ReactNode; kind: string }) {
  const shown = useCount(value);
  const prev = useRef(value);
  const [floats, setFloats] = useState<{ id: number; d: number }[]>([]);
  useEffect(() => {
    const d = value - prev.current; prev.current = value;
    if (!d) return;
    const id = Math.random();
    setFloats((f) => [...f, { id, d }]);
    const to = setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), 1700);
    return () => clearTimeout(to);
  }, [value]);
  return (
    <div className="sim-stat" data-sim-stat={kind} aria-label={`${kind} ${value}`}>
      <span className="ico">{icon}</span><span className="val">{shown}</span>
      {floats.map((f) => <span key={f.id} className={"float " + (f.d > 0 ? "up" : "down")}>{f.d > 0 ? "+" : ""}{f.d}</span>)}
    </div>
  );
}

const STEPS: { s: Section[]; icon: string; fb: string }[] = [
  { s: ["lobby", "court"], icon: "sun", fb: "☀️" },
  { s: ["street"], icon: "lantern", fb: "🏮" },
  { s: ["market", "end"], icon: "moon", fb: "🌙" },
];

function Hud() {
  const gold = useSim((s) => s.gold), happiness = useSim((s) => s.happiness), people = useSim((s) => s.people), section = useSim((s) => s.section);
  return (
    <div className="sim-hud panel" aria-label="Class kingdom">
      <div className="top">
        <span className="who">Class</span>
        <span className="day display">Day 1</span>
        <span className="steps">{STEPS.map((st) => <span key={st.icon} className={st.s.includes(section) ? "on" : ""}><Ico name={st.icon} fallback={st.fb} /></span>)}</span>
      </div>
      <div className="stats-row">
        <SimStat value={people} icon={<PeopleIcon />} kind="people" />
        <SimStat value={happiness} icon={<HappyIcon sad={happiness < 30} />} kind="happiness" />
        <SimStat value={gold} icon={<CoinIcon />} kind="gold" />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ lobby
/** Pseudo QR: 3 finder squares + seeded modules (a tile, not a scannable code). */
function QrTile() {
  const d = useMemo(() => {
    const n = 21, r = mulberry(SIM_SEED + 5), cells: boolean[][] = Array.from({ length: n }, () => Array(n).fill(false));
    const finder = (x0: number, y0: number) => {
      for (let y = 0; y < 7; y++) for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        cells[y0 + y][x0 + x] = edge || core;
      }
    };
    const inFinder = (x: number, y: number) => (x < 8 && y < 8) || (x > n - 9 && y < 8) || (x < 8 && y > n - 9);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inFinder(x, y)) cells[y][x] = r() > 0.52;
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    let s = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (cells[y][x]) s += `M${x} ${y}h1v1h-1z`;
    return s;
  }, []);
  return <svg viewBox="-1 -1 23 23" className="sim-qr" role="img" aria-label="QR code tile"><rect x="-1" y="-1" width="23" height="23" rx="1.4" fill="#fffaf0" /><path d={d} fill="#2b2118" /></svg>;
}

function Lobby() {
  const joined = useSim((s) => s.joined), pressed = useSim((s) => s.startPressed);
  const count = joined.length, full = count === N;
  const shown = useCount(count, 220);
  const fresh = joined[joined.length - 1];
  return (
    <div className="sim-lobby">
      <div className="sim-lobby-bg" aria-hidden="true" />
      <div className="join panel">
        <span className="kicker">Join at</span>
        <span className="url display">{JOIN_URL}</span>
      </div>
      <div className="code panel" aria-label={`Room code ${ROOM_CODE}`}>
        <span className="kicker">Room code</span>
        <span className="digits display">{ROOM_CODE.split("").map((c, i) => <b key={i} style={{ animationDelay: `${i * 90}ms` }}>{c}</b>)}</span>
      </div>
      <div className="qr panel"><QrTile /><span className="kicker">Scan to join</span></div>
      <div className="roster panel">
        <div className="rh"><span className="display">Players</span><span className="count display" aria-live="polite"><b>{shown}</b> / {N}</span></div>
        <div className="grid">
          {PLAYERS.map((p, slot) => {
            const idx = joined.indexOf(slot);
            return (
              <div key={p.id} className={"slot" + (idx >= 0 ? " in" : "")}>
                {idx >= 0 ? <div className={"pcard" + (fresh === slot ? " new" : "")} style={{ ["--pc" as string]: p.color }}>
                  <div className="face"><GummyPortrait id={p.id} color={p.color} crown={false} /></div>
                  <span className="nm display">{p.name}</span>
                </div> : <div className="empty" aria-hidden="true" />}
              </div>
            );
          })}
        </div>
      </div>
      <button className={"btn hero gold sim-start" + (pressed ? " pressed" : "")} disabled={!full} tabIndex={full ? 0 : -1} onClick={() => useSim.getState().patch({ startPressed: true })}>
        <span>Start Day 1</span><span className="go">▶</span>
      </button>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ court
function CourtAsk() {
  const visit = useSim((s) => s.visit), verdict = useSim((s) => s.verdict);
  const v = visit >= 0 ? VISITS[visit] : null;
  const ch = v ? CHARACTERS[v.who] : null;
  if (!v || !ch) return <div className="sim-ask-slot" />;
  return (
    <div className="sim-ask panel" key={visit} data-sim-ask>
      <div className="head">
        <span className="name display">{ch.name}</span>
        <span className="count display">{visit + 1} of {VISITS.length}</span>
      </div>
      <p className="text display">{verdict ? (verdict.choice === "yes" ? v.yesLine : v.noLine) : v.ask}</p>
      {verdict && (
        <div className={"verdict display " + verdict.choice}>
          <span className="mk">{verdict.choice === "yes" ? "✓" : "✗"}</span>
          <span>{verdict.choice === "yes" ? v.yesLabel : v.noLabel} wins {verdict.choice === "yes" ? verdict.yes : verdict.no}–{verdict.choice === "yes" ? verdict.no : verdict.yes}</span>
        </div>
      )}
    </div>
  );
}

function CourtTally() {
  const visit = useSim((s) => s.visit), votes = useSim((s) => s.votes), verdict = useSim((s) => s.verdict);
  const v = visit >= 0 ? VISITS[visit] : null;
  if (!v) return null;
  const won = verdict?.choice;
  return (
    <div className="sim-tally" aria-label="Class votes" key={"t" + visit}>
      {(["yes", "no"] as const).map((c) => (
        <div key={c} className={"col panel " + c + (won === c ? " won" : won ? " lost" : "")}>
          <div className="ch">
            <span className={"mk " + c}>{c === "yes" ? "✓" : "✗"}</span>
            <span className="lb display">{c === "yes" ? v.yesLabel : v.noLabel}</span>
            <span className="ct display">{votes[c].length}</span>
          </div>
          <div className="stk">{votes[c].map((i) => <Sticker key={i} i={i} name />)}</div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ street / market / end
function Caption() {
  const text = useSim((s) => s.caption), section = useSim((s) => s.section);
  if (!text || section === "end") return null;
  return <div className="sim-caption panel display" key={text} role="status"><span>{text}</span></div>;
}

function End() {
  const gold = useSim((s) => s.gold), happiness = useSim((s) => s.happiness), people = useSim((s) => s.people);
  const n = useCount(gold, 1500);
  return (
    <div className="sim-end panel" role="dialog" aria-label="Day 1 complete">
      <div className="ribbon">Day 1 complete!</div>
      <p className="msg display">Your class saved <span className="n">{n}</span> gold together</p>
      <div className="chips">
        <span><PeopleIcon /> {people}</span><span><HappyIcon /> {happiness}</span><span><CoinIcon /> {gold}</span>
      </div>
      <div className="crowd" aria-label="Ten players">{PLAYERS.map((_, i) => <Sticker key={i} i={i} pop={false} />)}</div>
      <div className="btns">
        <button className="btn hero gold" onClick={() => useSim.getState().exit()} autoFocus><span>Exit simulation</span><span className="go">▶</span></button>
        <button className="btn sm ghost" onClick={() => useSim.getState().replay()}>↺ Replay</button>
      </div>
    </div>
  );
}

const NPC_TAGS = [CHARACTERS.hazel, CHARACTERS.marlo];
function NameTags({ show }: { show: boolean }) {
  const bubbles = useSim((s) => s.bubbles);
  useEffect(() => () => { tagEls.fill(null); }, []);
  return (
    <div className="sim-tags" aria-hidden="true" style={{ display: show ? undefined : "none" }}>
      {PLAYERS.map((p, i) => (
        <div key={p.id} className="sim-tag" ref={(el) => { tagEls[i] = el; }} style={{ ["--pc" as string]: p.color }}><i />{p.name}</div>
      ))}
      {NPC_TAGS.map((c, k) => (
        <div key={c.id} className="sim-tag npc" ref={(el) => { tagEls[N + k] = el; }}>
          {bubbles[N + k] && <span className="say" key={bubbles[N + k]}>{bubbles[N + k]}</span>}
          <span className="nn">{c.name}</span>
        </div>
      ))}
    </div>
  );
}

export function SimUI() {
  const section = useSim((s) => s.section), curtain = useSim((s) => s.curtain), title = useSim((s) => s.title);
  return (
    <div className="overlay sim-ui" data-section={section}>
      <NameTags show={section !== "lobby"} />
      {section === "lobby" && <Lobby />}
      <div className="sim-top">
        {section !== "lobby" && section !== "end" ? <Hud /> : <span />}
        {section === "court" ? <CourtAsk /> : <span />}
        <div className="sim-ctrl">
          {section !== "end" && <button className="btn sm ghost" onClick={() => useSim.getState().patch({ skipReq: Date.now() })}>Skip ▶</button>}
          <button className="btn sm ghost" onClick={() => useSim.getState().exit()} aria-label="Exit simulation (Esc)">✕ Exit</button>
        </div>
      </div>
      {section === "court" && <CourtTally />}
      {(section === "street" || section === "market") && <Caption />}
      {section === "end" && <End />}
      <div className={"sim-curtain" + (curtain ? " on" : "")} aria-hidden="true">{title && <div className="ribbon">{title}</div>}</div>
    </div>
  );
}
