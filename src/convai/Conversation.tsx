// First-person conversation screen. Exactly three main buttons: 🎤 Mic · ⌨️ No mic · ✓ End & continue.
// Uses ElevenLabs agents when available; otherwise a scripted chat with the same buttons + reply chips.
import { useEffect, useMemo, useRef, useState } from "react";
import { useDialog } from "../platform/a11y.tsx";
import { useGame } from "../game/store.ts";
import { CHARACTERS } from "../game/content/characters.ts";
import { SCRIPTED, type ScriptedTalk } from "../game/content/talks.ts";
import { courtSummary, reportToText } from "../game/sim/sim.ts";
import { summarySentence } from "../game/content/advisor.ts";
import { UI } from "../game/content/uiLines.ts";
import type { Gem, RunState } from "../game/types.ts";
import { AgentChat, agentsAvailable, type ChatMode } from "./session.ts";
import { speak, sfx, stopVoice } from "../audio/audio.ts";
import { haptic } from "../platform/device.ts";
import { GEM_LABEL } from "../ui/icons.tsx";

const QUICK = ["Hello! How are you?", "That sounds hard. Can I help?", "Thank you for telling me.", "Tell me more!"];

function todaySummary(run: RunState): string {
  const { dp, dh, dg } = courtSummary(run);
  const today = run.log.filter((l) => l.day === run.day);
  const wise = today.filter((l) => l.wise === true).length;
  const unwise = today.filter((l) => l.wise === false).map((l) => l.concept).filter(Boolean);
  return `${summarySentence(dp, dh, dg)} People ${dp >= 0 ? "+" : ""}${dp}, happiness ${dh >= 0 ? "+" : ""}${dh}, gold ${dg >= 0 ? "+" : ""}${dg}. Wise choices today: ${wise}.${unwise.length ? " Tricky topics today: " + unwise.join(", ") + "." : ""} Gold now: ${run.gold}.`;
}
function tomorrowHint(run: RunState): string {
  const d = (run.day + 1) % 7;
  if (d === 0) return "Castle upkeep (120 gold) is due tomorrow.";
  if (run.gold < 80) return "Gold is low. Try saving a little tomorrow.";
  return "At the night market, stick to the shopping list.";
}

/** Build a scripted talk for the advisor (evening recap or reign review) when AI chat is off/unavailable. */
function advisorScript(run: RunState, review: boolean, reportText: string, tips: string[], good: string[], bad: string[]): ScriptedTalk {
  if (review) {
    return {
      opener: "The kingdom needs a rest now, and that's okay. Let's talk about your reign.",
      rounds: [
        { chips: [{ text: "Okay. How did I do?", gem: "respect", reply: good.length ? `You were great at ${good.slice(0, 2).join(" and ")}!` : "You tried your best, and you learned a lot." }] },
        { chips: [{ text: "What can I do better?", gem: "responsibility", reply: bad.length ? `Let's practise ${bad.slice(0, 2).join(" and ")}. ${tips[0] ?? ""}` : tips[0] ?? "Keep saving a little each day." }] },
        { chips: [{ text: "Thank you, Ollie!", gem: "caring", reply: "You're welcome. I'm proud of you. Ready for a new reign?" }] },
      ],
      goodbye: "Let's start a new reign together!",
    };
  }
  const { dp, dh, dg } = courtSummary(run);
  return {
    opener: `What a day! ${summarySentence(dp, dh, dg)}`,
    rounds: [
      { chips: [
        { text: "It went well!", gem: "respect", reply: "I think so too. You made some wise choices." },
        { text: "Some choices were hard.", gem: "trustworthy", reply: "Hard choices help us learn. That's okay." },
        { text: "I'm tired.", gem: null, reply: "Ruling is hard work! Let's take a slow walk." },
      ] },
      { chips: [
        { text: "What should I remember?", gem: "responsibility", reply: tomorrowHint(run) },
        { text: "I'll be kind to everyone.", gem: "caring", reply: "Wonderful. Kindness makes the kingdom grow." },
      ] },
    ],
    goodbye: "Be kind to the people you meet on the street. Off you go!",
  };
}

export function Conversation() {
  const convo = useGame((s) => s.convo)!;
  const run = useGame((s) => s.run)!;
  const report = useGame((s) => s.report);
  const settings = useGame((s) => s.settings);
  const close = useGame((s) => s.closeConvo);
  const kindness = useGame((s) => s.kindness);
  const ch = CHARACTERS[convo.npc];
  const review = convo.mode === "review";

  const [lines, setLines] = useState<{ who: "npc" | "me"; text: string; id: number }[]>([]);
  const [mode, setMode] = useState<ChatMode>(() => (localStorage.getItem("rc-mic") === "1" ? "mic" : "text"));
  const [status, setStatus] = useState<"connecting" | "live" | "ended" | "error" | "scripted">("connecting");
  const [speaking, setSpeaking] = useState(false);
  const [wantsEnd, setWantsEnd] = useState(false);
  const [pops, setPops] = useState<{ id: number; text: string }[]>([]);
  const [draft, setDraft] = useState("");
  const [round, setRound] = useState(0);
  const chat = useRef<AgentChat | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  useDialog(root, { initial: ".chip, [data-autofocus]" });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const awarded = useRef(0);
  const lid = useRef(0);

  const script = useMemo<ScriptedTalk>(() => {
    if (convo.npc === "advisor") return advisorScript(run, review, report ? reportToText(report) : "", report?.tips ?? [], report?.good ?? [], report?.bad ?? []);
    return SCRIPTED[convo.npc] ?? SCRIPTED.rosa;
  }, [convo.npc]); // eslint-disable-line react-hooks/exhaustive-deps

  const push = (who: "npc" | "me", text: string) => setLines((l) => [...l.slice(-8), { who, text, id: ++lid.current }]);
  const award = (gem: Gem, reason: string) => {
    if (awarded.current >= 6) return;
    awarded.current++;
    kindness(gem);
    sfx("sparkle"); haptic("success");
    const id = Date.now();
    setPops((p) => [...p, { id, text: `💛 ${GEM_LABEL[gem] ?? gem}!${reason ? "\n" + reason : ""}` }]);
    setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1700);
  };

  // start
  useEffect(() => {
    let alive = true;
    (async () => {
      const ok = settings.aiChat && (await agentsAvailable());
      if (!alive) return;
      if (!ok) {
        setStatus("scripted");
        push("npc", script.opener);
        speak(convo.npc, script.opener);
        return;
      }
      const vars: Record<string, string> = {
        ruler_title: run.rulerTitle === "Ruler" ? "Your Majesty" : `${run.rulerTitle}`,
        day: String(run.day),
        today_summary: todaySummary(run),
        tomorrow_hint: tomorrowHint(run),
        run_report: report ? reportToText(report) : "(none)",
      };
      const c = new AgentChat(convo.agent, ch.voiceId, vars, {
        onLine: (who, text) => push(who, text),
        onKindness: award,
        onEmotion: () => {},
        onWantsEnd: () => setWantsEnd(true),
        onStatus: (s) => { if (alive) setStatus(s); },
        onSpeaking: setSpeaking,
      });
      chat.current = c;
      const started = await c.start(mode);
      if (!started && mode === "mic") { setMode("text"); await c.start("text"); }
      else if (!started) { setStatus("scripted"); push("npc", script.opener); speak(convo.npc, script.opener); }
    })();
    return () => { alive = false; chat.current?.stop(); stopVoice(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchMode = async (m: ChatMode) => {
    sfx("click");
    setMode(m);
    try { localStorage.setItem("rc-mic", m === "mic" ? "1" : "0"); } catch { /* ignore */ }
    if (chat.current && status !== "scripted") {
      await chat.current.switchTo(m);
      if (chat.current.mode !== m) setMode(chat.current.mode);
    }
  };
  const end = () => {
    sfx("good"); haptic("medium");
    chat.current?.stop();
    stopVoice();
    if (!review) speak(null, "");
    close();
  };
  const sendText = (t: string) => {
    if (!t.trim()) return;
    if (status === "scripted") return;
    chat.current?.send(t);
    setDraft("");
  };
  const pickScripted = (c: ScriptedTalk["rounds"][0]["chips"][0]) => {
    push("me", c.text);
    if (c.gem) award(c.gem, "");
    push("npc", c.reply);
    const last = round + 1 >= script.rounds.length;
    setRound(round + 1);
    speak(convo.npc, c.reply).then(() => {
      if (last && mounted.current) { push("npc", script.goodbye); speak(convo.npc, script.goodbye); setWantsEnd(true); }
    });
  };

  // If the live chat drops (no network, token error...), carry on with the scripted chat so the player is never stuck.
  useEffect(() => {
    if (status !== "error") return;
    chat.current?.stop();
    setStatus("scripted");
    setLines((l) => (l.length ? l : [{ who: "npc", text: script.opener, id: ++lid.current }]));
    if (!lines.length) speak(convo.npc, script.opener);
  }, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const scripted = status === "scripted";
  // keep keyboard / gamepad focus somewhere useful when the buttons change
  useEffect(() => {
    const r = root.current;
    if (!r) return;
    if (r.contains(document.activeElement) && document.activeElement !== r) return;
    (r.querySelector<HTMLElement>(wantsEnd ? "[data-end]" : ".chip") ?? r.querySelector<HTMLElement>("[data-end]"))?.focus({ preventScroll: true });
  }, [round, wantsEnd, status]);
  const chips = scripted ? script.rounds[round]?.chips ?? [] : QUICK.map((q) => ({ text: q, gem: null, reply: "" }));

  return (
    <div className="convo" role="dialog" aria-label={`Talking with ${ch.name}`} ref={root}>
      <div className="cv-log" aria-live="polite">
        {lines.slice(-2).map((l) => (
          <div key={l.id} className={"bubble " + l.who}>
            {l.who === "npc" && <b style={{ color: ch.color }}>{ch.name}: </b>}{l.text}
          </div>
        ))}
      </div>
      {pops.map((p) => <div key={p.id} className="kind-pop" style={{ whiteSpace: "pre-line" }}>{p.text}</div>)}
      <div className="cv-replies">
        {(mode === "text" || scripted || status === "error") && !wantsEnd && (
          <div className="chips">
            {chips.map((c, i) => (
              <button key={i} className="chip" onClick={() => { sfx("tap"); scripted ? pickScripted(c as never) : sendText(c.text); }}>{c.text}</button>
            ))}
          </div>
        )}
        {mode === "text" && !scripted && status === "live" && (
          <form className="typer" onSubmit={(e) => { e.preventDefault(); sendText(draft); }}>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Type here…" aria-label="Type your message" enterKeyHint="send" />
            <button className="btn gold" type="submit" disabled={!draft.trim()}>Send</button>
          </form>
        )}
      </div>
      <div className="cv-bar">
        <div className="status-pill" role="status">
          {status === "connecting" && "Connecting…"}
          {status === "live" && (mode === "mic" ? (speaking ? `${ch.name} is talking…` : "🎤 Listening — just talk!") : speaking ? `${ch.name} is talking…` : UI.talkPrompt)}
          {status === "ended" && "Chat ended."}
          {scripted && (wantsEnd ? "Tap ✓ to continue" : "Tap an answer")}
        </div>
        <div className="three">
          <button className={"btn " + (mode === "mic" && !scripted ? "mic-on" : "purple")} disabled={scripted} onClick={() => switchMode("mic")} aria-pressed={mode === "mic"}>🎤 {mode === "mic" ? "Mic on" : "Mic"}</button>
          <button className={"btn " + (mode === "text" ? "gold" : "ghost")} onClick={() => switchMode("text")} aria-pressed={mode === "text"}>⌨️ No mic</button>
          <button data-end aria-label={review ? "Finish" : "End and continue"} className={"btn " + (wantsEnd ? "gold" : "")} style={wantsEnd ? { animation: "pulse 1.2s infinite" } : undefined} onClick={end}>✓ {review ? "Finish" : "Done"}</button>
        </div>
      </div>
    </div>
  );
}
