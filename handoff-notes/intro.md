# Intro ("How to play", Sage Ollie doodle tutorial)

Files: `src/ui/Intro.tsx`, `src/ui/intro.css`; `src/App.tsx` (mount + gate); `src/audio/audio.ts` (new SFX at end: `scribble`, `boing`, `tick`; `whoosh` already existed from another agent).

- `export function openIntro(): void` opens it from anywhere (tiny zustand store inside Intro.tsx). Use for admin "Replay tutorial".
- Auto: `useIntroGate(phase, run.day)` in App. When phase is "morning", day <= 1 and localStorage `rc-intro-seen` is not "1", Morning is NOT mounted until the intro closes (so voice/keys do not collide); intro is `position:fixed; z-index:70` (above toast 60, below veil 80). Flag is written on finish OR skip (not on reload mid-intro).
- 8 cards, hand-authored SVG doodles (`P` = self-drawing path via pathLength + stroke-dashoffset, wobble feDisplacementMap filter, pop/drop/wiggle CSS). Cards: crown, yes/no, 3 stats (icons people/happy/coin), bread vs cake, lantern+bubble+dice, list+pen+coins, jar+coins+arrow, castle door. Edit `STEPS` (lines, scene, sfx cues in ms).
- Voice: `speak("advisor", lines.join(" "), {caption:false})`. The card text itself is the caption (always shown, big), so global Captions would de-dup anyway. "Again" button replays.
- Controls: tap card / Space / Enter / ArrowRight / pad A = next; ArrowLeft / Backspace = back; Esc = skip (module-level capture listener, runs before App's pause-menu handler); "Skip intro" button; dots row. y/n are swallowed. Auto-advance only after a real voice ends (>0.9 s of speech), 1.2 s later, only if the user has not touched anything, never on the last card.
- Settings: reduceMotion adds `.rm` (no animation, instant draws, pen hidden, one SFX cue); `--ts` multiplies text/button fonts (text column scrolls if needed); sizes are fixed px per `html[data-size]` (`--iu` 6/9/12.5/17).
- Shots: `.shots/intro/` (`sheet-667.png`, `sheet-1280.png`, `NNN-cardN.png`, `1280-reduce-motion.png`, `667-textscale150.png`).

## Not done / notes
- "How to play" button in Options/pause menu NOT added (needs an edit to Menus.tsx/Options.tsx). Wire it as `import { openIntro } from "./Intro.tsx"` and close the menu first.
- `tsc` error in `src/fx/vfx.ts` belongs to another agent.
- Pad B is not mapped to Back (bridge sends it as "n"; I swallow it). Gamepad untested on hardware.
- Opening the intro mid-game does not unmount the screen below; I only swallow its keys.
