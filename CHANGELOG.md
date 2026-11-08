# Development log

This records work completed in this collaboration. Earlier prototype work is in
the sibling `royal-concerns` folder. The gummy edition began on local branch
`royal-concerns-gummy`; the combined work is on `feat/gummy-customization-market-flow`.

## Original walkaround prototype

- Built PC movement with WASD / arrow keys and a camera at 45 degrees.
- Added a day-end movement hook, Shift sprint, and rendering optimizations.
- Slowed regular movement and added gentle gummy bounce and subtle footstep puffs.

## Full game inspection and gummy edition

- Checked out the separate `royal-concerns-game` branch into this folder.
- Replaced six rulers, eighteen citizens, and the advisor with a shared gummy
  model library, distinct colours, shapes, and accessories.
- Preserved character IDs, game logic, wheelchair and cane props.
- Added blinking, gentle squash/bounce, and simple reaction animations.
- Matched ruler selection portraits to the gummy characters.
- Added `start-gummy.cmd` for launching locally on port 5202.
- Verified TypeScript, production build, court, street, market, checkout, day two,
  character gallery, mobility aids, and absence of old character model requests.

## Citizen interaction and smaller movement hint

- Approaching citizens now shows an **E · Talk** prompt above them. Conversations
  start only when E is pressed or the prompt is clicked.
- E ignores held-key repeats, text-entry fields, active conversations, minigames,
  completed citizens, and citizens outside the 2.8-unit interaction range.
- Citizens move aside and fade over two seconds after their conversation ends.
  Reduced motion uses a short fade without the walking displacement.
- Kept the existing guided street progression: talk to the advisor and two
  citizens before continuing down the street.
- Replaced the large walking panel with **WASD / arrows · Move** in the bottom-right.
  Removed the redundant entry narration/caption and hide the hint near a citizen.
- Added `tools/check-street-interaction.mjs` to check proximity, explicit E,
  departure for all three citizens, and hint size. Tests use scripted dialogue
  and stub voice APIs to avoid paid requests.
- Validation passed: TypeScript, production build, all three citizen proximity
  and departure checks, E outside range, no reopening completed conversations,
  a 216 × 36 pixel hint at 1280 × 800, and no browser errors.

## Movement hint overlap fix

- Removed the movement hint's shared `hint-pill` class so global HUD rules cannot
  reposition or enlarge it. It uses its own compact styling.
- At widths up to 900 pixels, place it at the upper-right below the day panel,
  away from the bottom resource panel. Wider windows keep it at bottom-right.
  A resize observer measures the day panel so text wrapping is accounted for.
- Added `tools/check-hud-layout.mjs` to check resource/day panel overlap and
  viewport containment at 1280×800, 847×1347, 390×844, and 844×390.
- All four browser layouts passed; TypeScript and production build passed.

## Gummy walking effects in the street

- Ported the original walkaround's pooled footstep puffs, scaled to the street
  ruler: two small, low-opacity dust billboards per step, twelve particles maximum,
  one instanced draw call, no textures, and no per-frame React updates for particles.
- Added a stronger soft hop, squash/stretch, and gentle wobble for the walking
  player, with smooth settling when stopped. Court characters keep their motions.
- Sideways movement now triggers animation, footsteps, and dust as well as forward
  and backward movement. Turning uses the actual travel direction.
- Reduced motion disables the walking hop, squash, wobble, and dust. Conversation
  and minigame transitions clear particles. Old puffs expire after stopping.
- Added `tools/check-walking-effects.mjs` for motion, particles, settling, and
  reduced-motion checks; TypeScript and production build passed.
- Browser checks passed for sideways walking bounce, wobble, squash, capped
  particles, settling after stopping, reduced motion, and no browser errors.

## Character customisation and market flow

- Added six named colour presets, a colour wheel with keyboard controls,
  brightness, and a custom colour picker. Character previews update immediately;
  the chosen colour is saved with the reign and survives the next-day transition.
  The ruler uses a private material so citizens keep their own colours.
- Street travel blends sunset sky, sun, hemisphere lighting, and fog into the
  night-market palette. Time advances with the furthest point reached and does
  not rewind on backtracking. The gate is fully night.
- Made street and market movement guidance smaller with a translucent background.
  The market tooltip disappears after the first movement.
- Desktop market entry requests pointer lock; mouse movement looks around without
  holding a button. Esc releases it, and clicking resumes it. Item inspection and
  modal screens release the pointer. Locked clicks aim through the crosshair.
- Brought the gummy shopkeeper in front of the counter at the market's end.
- Moved court Yes/No controls into the dialogue panel, with the price below Yes.
- Added the next three feature-unlock progress bars and already-open features to
  checkout, before starting the next day (including the Royal Vault/bank).
- Added `tools/check-gummy-flow.mjs` for colour, court, street/night, market controls,
  and unlock/next-day coverage. TypeScript and production build pass.
- The browser flow verifies palette/wheel/custom colour saving and rendered body
  colour; court choices inside chat; final night sky/fog at the gate; real browser
  pointer lock and no-drag look; hidden movement guidance; shopkeeper presence;
  pointer release for item inspection; bank milestone progress; next-day transition;
  preserved colour; and no page errors. Street timing is advanced through the
  normal frame callbacks to avoid software-GPU timeouts.
- Requested feature branch: `feat/gummy-customization-market-flow`. Git authorship
  uses the existing Eric Y identity, with no assistant coauthor trailer.

## Where to continue

### Market keycap fix and character-source handoff

- Replaced the stretched wide-key image with a text-centred Space/Enter keycap,
  so general button image rules cannot squeeze the market checkout hint.
- Added the standalone `visitor-kit/` character source: editable
  `gummy_visitor_library.blend`, matching GLB, textures, manifest, demo, and docs.
  No scenery Blender file is added; scenery remains for the teammate's merge.
- Confirmed the character GLB matches the game's asset byte for byte. Appearance
  checks passed for 100 seeded characters. Game tests, TypeScript, and build passed.


### Street movement introduction

- Added a large WASD/arrow-key prompt at the beginning of each day's street.
  The first movement-key press fades it out over 400 ms; unrelated keys do not.
- The prompt stays dismissed for that street visit, including after stopping or
  conversations. It returns on the next day. Notebook/menu input does not dismiss it.
- Suppress the small hint while the large introduction is showing. Touch and
  controller input retain their existing small guidance.
- TypeScript and build passed. Added a browser check for initial visibility,
  movement-key dismissal, fade timing, no reappearance, and next-day/arrow-key use.


### Notebook book graphic and menu integration

- Replaced the floating Misc. tab with a reference-inspired open-book SVG in the
  game's framed corner controls. In play, the book sits below the gear control.
- Added Notebook to the title's Continue/Options row, with matching typography
  and the book graphic. Notebook and Options remain visible without a saved run.
- Added the graphic to the pause menu's Notebook button; removed Misc. wording.
- Added `CHANGES_SINCE_BRANCH_PULL.md`, a consolidated summary of all changes
  relative to the original `royal-concerns-game` baseline `161f94b`.


### Opening transition and choice alignment fixes

- Corrected the opening cloud layers to move down. The middle cloud veil now fades
  back out, revealing the court before setup instead of ending on a white flash.
- Capped animation time advances after slow frames so the descent cannot skip
  straight to its end. Clean up the reduced-motion timer on unmount.
- Centred check/cross marks independently inside the court buttons. Keyboard and
  gamepad hints now have their own small corner badge instead of shifting the mark.
- Verified the normal opening, reduced motion and Escape skip; measured icon and
  button alignment at 1280×800 and 2048×1085 with keyboard and gamepad hints.
  TypeScript and production build passed; browser checks reported no page errors.


### Learning notebook and Gemini memory

- Added an always-accessible Misc. button and a notebook link in the pause menu.
  The notebook has a progress home page and separate pages for every run:
  Did well, Try next, Practice, and Day log. Learning text is large, plain English,
  with read-aloud buttons and short, repeatable questions without timers.
- Persist court decisions, shopping results, kindness, treasury use, minigames,
  conversation snippets, and practice attempts in browser local storage. Each
  new run has a unique ID; older saves use a stable legacy ID. Existing choices
  are imported without duplicates. Past runs survive losing or starting again.
- Improvement claims require at least four scored choices and a higher later
  success rate. Unscored events do not count as mistakes. Retried questions are
  recorded separately; no ability or diagnosis is inferred.
- Added a server-only OpenRouter integration for `google/gemini-3.6-flash`.
  It receives the latest 100 structured events and up to four bounded chat snippets,
  returns short evidence-linked notes and practice explanations, and caches results.
  Generated notes must cite events of the correct kind. Question choices and
  correct answers remain authored. Invalid output, timeouts, missing keys, and
  API failures fall back to the saved game notes.
- Gemini-backed learning memory is reused in ElevenLabs advisor context. Scripted
  and live conversations both contribute bounded snippets when they end.
- Opening the notebook pauses street movement and court progression, releases
  market pointer lock, and keeps game shortcuts from answering behind the dialog.
- Store credentials only in the ignored `.env.local`, never a VITE_ variable.
  `.env.example` contains empty configuration fields only. Build/source scans
  confirmed no OpenRouter credential in shipped assets or source files.
- Validation: TypeScript, production build, six unit tests; browser checks for
  persistence, separate run archives, real decision logs, improvements, large text,
  practice retries, Gemini-response handling, offline fallback, advisor memory,
  conversation capture, access during conversations, narrow layout and Escape.
  One synthetic live request returned HTTP 200 with validated Gemini notes.


Launcher fix: removed strict port binding from `start-gummy.cmd`. If 5202 is
occupied, Vite selects the next free port. The launcher now directs players to
the actual Local URL printed by Vite instead of promising a fixed port.

- Character appearance: `src/characters/gummy/profiles.ts`.
- Street proximity, prompts, departure: `src/scenes/StreetScene.tsx`.
- Keyboard interaction and movement hint: `src/ui/StreetUI.tsx`.
- Detailed gummy setup: `handoff-notes/gummy.md`.
- Browser screenshots/results: ignored `test-results/` folder.
