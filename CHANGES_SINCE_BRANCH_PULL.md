# Changes since pulling `royal-concerns-game`

Baseline: `161f94b` — **Initial commit: Royal Concerns playable build**, pulled from
`MindlessTruffle/communihacks_2026`, branch `royal-concerns-game`.

This covers the changes made in this checkout since that pull. The combined
implementation lives on **`feat/gummy-customization-market-flow`**.
`CHANGELOG.md` records the development history; this file groups the final changes
by feature. The earlier standalone walkaround prototype lives in the sibling
`royal-concerns` folder. Its gummy library and movement effects were reused here.

## 1. Gummy characters

- Replaced the six ruler characters, eighteen citizens, and advisor with gummy
  characters assembled from one shared 234 KB GLB library.
- Gave characters distinct colours, shapes, eyes, and accessories. The advisor
  became a lavender wizard gummy. Wheelchair and cane props remain visible.
- Kept the existing scene-facing Character/Owl interfaces, character IDs, and
  gameplay. The old character models remain available in the repository.
- Added blinking, breathing, reactions, gentle squash/stretch, and walking motion.
- Updated all six ruler-selection portraits to match the gummy characters.
- Updated the character gallery to include the advisor and the complete cast.
- Added the complete `visitor-kit/` source handoff: editable character Blender
  library, matching GLB, textures, manifest, standalone React demo, and documentation.
  The only Blender file added is `visitor-kit/gummy_visitor_library.blend`.

Files: `src/characters/gummy/`, `public/models/gummy-visitors.glb`,
`src/scenes/common.tsx`, `src/dev/chargallery.tsx`.

## 2. Character colour customisation

- Added six named colour presets: Rose, Ocean, Mint, Lavender, Peach, and Sunshine.
- Added an interactive colour wheel, brightness slider, keyboard controls, and
  native colour picker. The wheel follows preset and custom-colour selections.
- Update the selected portrait and the 3D ruler preview immediately.
- Save the chosen colour with the run, preserving it through later days.
- Use a private ruler body material so changing the ruler never recolours citizens.
- Keep older saves compatible through optional `rulerColor` data.
- Make the setup panel scroll within the viewport and wrap ruler choices on
  smaller windows. Give its heading normal layout space to prevent clipping.

Files: `src/ui/GummyColors.tsx`, `src/ui/Title.tsx`,
`src/characters/gummy/GummyPortrait.tsx`, `src/game/types.ts`, `src/game/store.ts`.

## 3. Street movement and citizen interactions

- Replace automatically triggered conversations with an **E · Talk** proximity
  prompt above the nearby citizen. Clicking the prompt also works.
- Require the player to be within 2.8 world units. Ignore repeated key-downs,
  text entry, finished citizens, and interactions during another activity.
- After a conversation, citizens walk aside and fade away over two seconds.
  Reduced motion uses a short fade without the walking displacement.
- Preserve the existing guided progression through the advisor and two citizens.
- Add a soft walking hop, jelly squash/stretch, and wobble to the player, with
  smooth settling when movement stops. Sideways movement also animates correctly.
- Turn the character towards actual travel direction, including sideways/backward
  movement, using the shortest turn.
- Reuse subtle footstep dust from the prototype, scaled to this street: two small
  translucent puffs per step, a fixed pool of twelve, and one instanced draw call.
  Puffs expire after stopping and clear during conversations or minigames.
- Disable the player hop, squash, wobble, and dust in reduced-motion mode.

Files: `src/scenes/StreetScene.tsx`, `src/ui/StreetUI.tsx`,
`src/characters/gummy/GummyCharacter.tsx`, `src/characters/gummy/DustPuffs.ts`.

## 4. Sunset-to-night progression

- Progressively blend the street sky, sun colour/intensity, hemisphere fill, and
  fog from sunset into the night-market palette as the player walks forward.
- Base time on the furthest point reached, so walking backwards does not rewind it.
- Reach the full night palette at the market gate.
- Update lighting and shader uniforms through frame callbacks rather than
  rebuilding React elements every frame.

Files: `src/scenes/StreetScene.tsx`, `src/scenes/common.tsx`, `src/scenes/look.tsx`.

## 5. Market controls, shopkeeper, and next-day progress

- Request desktop mouse pointer lock from the market-entry button's click.
  Looking around then needs mouse movement, without holding a button.
- Esc releases the pointer; a scene click or the look prompt resumes it. Browsers
  that decline the entry request retain a clickable prompt. Touch retains dragging.
- While locked, select food through the centre crosshair. Release the pointer
  for item inspection, dialogs, checkout, and scene cleanup.
- Keep the market's existing movement bounds and fountain collision.
- Put the gummy shopkeeper in front of the end counter, where they can be seen.
- Show the next three feature-unlock milestones before starting the next day,
  with progress bars, unlock days, a tomorrow indicator, and already-open features.
  This includes the Royal Vault/bank, Wishing Jars, and later systems.
- Keep the next-day button visible while results and unlock details can scroll.
  Account for the captions band so the card stays inside the viewport.

Files: `src/scenes/MarketScene.tsx`, `src/ui/MarketUI.tsx`,
`src/ui/BudgetScroll.tsx`, `src/ui/UnlockProgress.tsx`.

## 6. Court, movement hints, and opening animation

- Move Yes/No choices into the citizen's dialogue panel. Show the actual checked
  price below Yes, retaining affordability, credit, and item-payment information.
- Centre check/cross graphics independently of the keyboard/controller badges.
  Align the buttons in a row and keep the badges small in their own corner.
- Replace the squeezed Space/Enter hint image with a properly proportioned keycap,
  including the checkout prompt at the end of the market.
- Replace the large street walking panel with **WASD / arrows · Move**. Use a
  smaller translucent style in both the street and market.
- Place street guidance clear of the resource panel. In narrow windows, measure
  the day panel and position guidance beneath it, allowing for text wrapping.
- Hide the street hint near a citizen and the market hint after first movement.
- Show a large WASD/arrow-key introduction when each day's street begins. The
  first movement-key press fades it out over 400 ms. Keep it dismissed for that
  visit; suppress the smaller hint while the introduction is showing.
- Correct the opening clouds to move downward. Fade the middle cloud veil back
  out before setup, instead of ending on a bright flash.
- Cap animation advances after slow frames so the opening does not skip to its
  end. Preserve reduced-motion fading and Esc-to-skip; clean up pending timers.

Files: `src/ui/CourtUI.tsx`, `src/ui/StreetUI.tsx`, `src/ui/MarketUI.tsx`,
`src/ui/Title.tsx`, `src/ui/title.css`, `src/styles.css`.

## 7. Persistent learning notebook

- Add a progress home page and separate pages for each run: **Did well**, **Try
  next**, **Practice**, and **Day log**.
- Use large, plain-language text, short actionable tips, read-aloud controls, and
  short questions with retries and no timer or penalty.
- Save court choices, shopping outcomes, awarded kindness, successful treasury
  activity, minigame completion, bounded conversation snippets, and practice
  attempts in a separate browser-local notebook archive.
- Assign new runs unique IDs and import existing saves with stable legacy IDs.
  Keep past runs when a reign ends or another begins; deduplicate imported choices.
- Show improvement only when at least four scored observations support a better
  later success rate. Do not count unscored events as mistakes or double-count
  shopping stars as an additional scored outcome.
- Track practice retries separately from game decisions. Show when trying again
  led to a correct answer.
- Pause street movement and court progression while reading; suppress underlying
  game shortcuts and release market pointer lock.
- Replace the original floating Misc. tab with an open-book graphic inspired by
  the supplied reference. During play, it uses the same framed corner-control
  styling as the game menu and sits below the gear control.
- On the title screen, put **Notebook** alongside **Continue** and **Options**,
  with the same book graphic. Notebook and Options also appear before a first run.
- Add the book graphic to the pause menu's **Notebook** option and remove the
  Misc. wording. The title screen has no separate floating notebook tab.

Files: `src/game/learning.ts`, `src/game/notebook.ts`, `src/ui/Notebook.tsx`,
`src/ui/notebook.css`, `public/ui/notebook-book.svg`, `src/App.tsx`,
`src/ui/Title.tsx`, `src/ui/Options.tsx`.

## 8. Gemini interpretation and advisor memory

- Add server-side OpenRouter support for **`google/gemini-3.6-flash`** through
  `POST /api/notebook`. Add empty configuration fields to `.env.example`.
- Send only the latest 100 structured events and up to four bounded conversation
  snippets for interpretation. Treat conversation content as data, not instructions.
- Ask for brief, respectful, simple descriptions and one small next action.
  Validate JSON shape, word limits, evidence IDs, and success/practice categories.
- Keep authored practice questions, choices, and correct answers as the source of
  truth; use validated AI explanations without silently changing answers.
- Derive advisor memory from validated notes and the latest unscored event. Reuse
  it in ElevenLabs `today_summary` and `run_report` conversation context.
- Capture both scripted and live conversation text when a conversation ends.
  Retain the last ten lines per conversation; redact key patterns and emails.
- Add request-size and per-IP limits, provider timeouts, request deduplication,
  and a bounded response cache. Preserve saved-note fallback on errors, missing
  credentials, invalid output, or lost network access.
- Keep credentials in ignored server-only `.env.local`, without a `VITE_` prefix.
  Check source and browser builds for accidental credential inclusion.

Files: `server/notebook.mjs`, `server/api.mjs`, `.env.example`,
`src/game/notebook.ts`, `src/convai/Conversation.tsx`.

## 9. Running, documentation, and validation

- Add `start-gummy.cmd`: use Node from PATH or the local Codex runtime; start at
  port 5202 and automatically select the next free port if it is occupied.
  Direct players to the actual Local URL printed by Vite. `/?q=low` selects lower
  graphics settings. Node 24 supports the included TypeScript test tools.
- Add this summary, `CHANGELOG.md`, `handoff-notes/gummy.md`, and
  `handoff-notes/notebook.md`.
- Ignore generated `test-results/` screenshots and reports.
- Wire `pnpm test` to the six notebook/learning unit tests, covering evidence,
  authored answers, secret isolation, caching, measured improvement, fallback,
  and conversation redaction.
- Add browser checks for the complete gummy cast, wheelchair/cane props, gameplay
  transitions, citizen proximity/departure, movement effects, HUD overlap,
  colour customisation, night progression, mouse lock, unlock progress, intro
  animation, choice alignment, notebook persistence/access, and narrow layouts.
- Verify TypeScript and production builds. A synthetic live OpenRouter request
  returned HTTP 200 and validated Gemini notes. Routine tests mock paid APIs.

Browser tools are in `tools/check-*.mjs`. `tools/check-notebook-live.mjs` explicitly
makes a paid synthetic request and is intended for occasional integration checks.

## Data and operating limits

Notebook history stays in the current browser. Clearing site data removes it;
cross-device synchronisation is not implemented. Storage failure is reported in
the notebook. Gemini needs a configured server key and network access; saved
notes and authored practice remain available without it. Mouse lock requires a
browser-authorised gesture. The street retains the original guided progression.

## Commits preceding this final menu polish

| Commit | Change |
| --- | --- |
| `78acbf7` | Gummy characters, customisation, movement, court and market flow |
| `8ee3c93` | Persistent notebook, Gemini interpretation, and advisor memory |
| `65164d3` | Downward cloud opening and centred court decision graphics |

All commits use the existing **Eric Y** Git identity without an assistant coauthor.
