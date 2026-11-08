# Intro ("How to play", Sage Ollie, 3-step parchment scroll)

Files: `src/ui/Intro.tsx`, `src/ui/intro.css`; `src/App.tsx` (mount + gate, untouched); `src/audio/audio.ts` (new SFX at end of the map: `scrollOpen`, `scrollWind`, `scrollClose`, `woodThunk`; older intro ones `scribble`, `boing`, `tick` stay).

## Contract (unchanged)
- `export function openIntro(): void`; localStorage `rc-intro-seen` ("1" written on finish OR skip); `useIntroGate(phase, day)` (shows before day-1 morning, Morning is not mounted until it closes); `position:fixed; z-index:70`.
- Esc = skip via a module-level capture listener (runs before App's pause-menu handler).

## What it is now
- 3 steps, one self-drawing hand-inked doodle each (`P` = pathLength/dashoffset draw, wobble filter): 1 ruler + crown + "?" bubble + tick/cross; 2 stat icons (people/happy/gold) then bread (need, ticked) vs cake (want, dimmed); 3 shopping list with pen ticking + coin jar filling + green growth arrow. Edit `STEPS` (lines, SFX cues in ms after the doodle starts) and the `Ruler/Watch/Plan` scene components.
- Parchment scroll: two wooden rollers (paper coil + wooden pegs), paper height animates 0 -> H (unroll, `sc-open`, ~0.95 s, "scrollOpen" + "woodThunk"). Next = the 3-page reel translates up 0.7 s (like winding), top coil thickens / bottom coil thins per step, "scrollWind". Finish/skip rolls the paper up (`.closing`, `sc-close`) then calls `close()` after 750 ms.
- Controls: ONE big gold "Next ▶" (last: "Let's go! ▶"), uses `--fr-gold` 9-slice like the day buttons, gentle nudge animation. Tiny "Skip" underlined text link bottom-right, Ollie (talks while voice plays) bottom-left, 3 pips on the bottom roller. Back / Again / dot row are gone. Tap anywhere on the paper, Space / Enter / ArrowRight / pad A = Next (taps within 420 ms of the last one are ignored while the paper rolls). y, n (pad B), ArrowLeft, Backspace are swallowed and do nothing; `rc-back` is swallowed too. No auto-advance any more (user always in control).
- Voice: `speak("advisor", lines.join(" "), {caption:false})` starts when the doodle starts (after the roll); the page text is the caption.
- Sizing: fully fluid. `--iu: clamp(5px, 1.5vmin, 18px)`; scroll width `min(96vw,160vh,1500px)`, paper height `min(100dvh - rollers - 7vh, width*.85)`. Page layout uses a container query on the paper window: wide (aspect >= 5:4) = doodle left, words right; taller = stacked. Text `calc(iu*4.3*var(--ts))`, Next `iu*4.6*--ts`, min target 56px. No per-bracket px any more. Recomputes live on resize (all CSS).
- Settings: reduce motion = no unroll / winding / drawing / pen / SFX cues beyond one; scroll just fades in and out (220 ms) and the doodle appears finished. `--ts` text-size respected (text column scrolls if it ever overflows).
- Shots: `.shots/intro2/` (`NNNN-stepN.png`, `mid-*.png` frozen mid-unroll / mid-roll / mid-close frames, `sheet.png`).

## Testing
- The intro gate did not fire in my headless run (game went straight to court after Begin), so I opened it with `import(<url of /src/ui/Intro.tsx with ?t=… taken from performance entries>).openIntro()` in the page. Scripts: scratchpad `intro.mjs` / `mid.mjs` (playwright 1.65 with the ms-playwright chromium-1223 exe; the Playwright MCP was down).

## Not done / notes
- "How to play" button in Options/pause menu still NOT added (needs Menus.tsx/Options.tsx): `import { openIntro } from "./Intro.tsx"`, close the menu first.
- Opening the intro mid-game does not unmount the screen below; I only swallow its keys.
- Gamepad untested on hardware.
