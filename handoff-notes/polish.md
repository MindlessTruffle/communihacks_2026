# Polish agent notes

Screenshots: `E:\RoyalConcerns\game\.shots\polish\` (names `NN-screen-WxH.png`). Verified against `pnpm build && pnpm serve` (port 8080, stable) and dev server.

## Device profile contract (src/platform/device.ts)

`getDevice()` returns `{ form, input, size, os, standalone, dpr, orientation, recommendedQuality }`

| field | values | rule |
|---|---|---|
| form | phone / tablet / desktop | **screen** short side + UA (`userAgentData.mobile`, iOS/iPadOS/Android). Small desktop window stays desktop. `?form=phone` URL override for testing |
| input | touch / mouse / gamepad | hardware guess (touch-screen laptop with trackpad => **mouse**), then switched live by the first real event: touch pointerdown => touch, mouse move => mouse, pad button/stick => gamepad |
| size | s <=480, m 481-800, l 801-1200, xl >1200 | viewport CSS **height** |
| os | ios, ipados, android, windows, mac, linux, chromeos, other | iPadOS = Mac UA + maxTouchPoints>1 |
| dpr | 1/2/3 | rounded + clamped |
| recommendedQuality | high / low | phone => low, tablet with <=6 cores => low, else high. look.tsx not edited; wire `getDevice().recommendedQuality` into `detectQuality()` |

Also written to `<html>` as `data-form data-input data-size data-dpr data-os data-orientation data-standalone`. Updates on resize, orientationchange, pointer/hover/display-mode media changes, gamepad connect/disconnect, and real input. Event `rc-device` (detail = Device) fires on any change. `isTouch()` / `isPhone()` are thin wrappers. `noteInput(kind)` is exported. Verified in the browser: Windows touch laptop => `desktop / mouse`.
NOTE: the focus-ring mode attribute is `data-focus-mode` (key/pad/mouse), NOT `data-input`.

Used in my files: Canvas DPR cap (phone `[1,1.25]`), rotate prompt (`form=phone && portrait`), touch haptics, admin touch gesture, walk hints via isTouch.

## Bugs fixed
- **Title -> New Reign erased the save** (`goto()` saved with `run=null` => removeItem). `goto` now only saves live, non-lost reigns and never for title/setup/reign-end. This also stopped a lost reign being written as a save after "New Reign" on the reign-end screen.
- "Are you sure?" on New Reign when a save exists (App-level confirm; Title.tsx untouched): Keep my reign => Continue.
- Minigames: results auto-advanced on 1.6-2.2 s timers (time pressure) => now Next/Finish buttons. Bakery accepted taps during the 0.9 s completion window (counted as misses) and ignored wrong-tap hints; 0-score reward screen now friendly; gold from minigames now saved (`finishMinigame` did not `save`). Layout: panel no longer overflows (ribbon outside scroller, fixed Leave button).
- Conversation: scripted last-line `speak().then` could speak the goodbye after the player already left; live chat dropping (`status=error`) left dead quick-reply chips => falls back to scripted chat; focus management after chips change. Tested scripted (aiChat off) flow end to end with keyboard, advisor review -> reign summary -> New Reign.
- Voice volume/read-aloud were ignored by the live-agent TTS and mic audio; now honoured (`session.ts`). `speak()` now honours `readAloud` globally (previously only Summary did).
- Service worker cached `/audio/*/index.json` forever (re-baked audio would never appear), tried to cache 206 responses, and had no versioning. Rewritten (network-first json/manifest, cache-first assets/media, ignores Range, versioned caches).
- `public/icons/` was empty although manifest/index.html referenced it: generated icon-192, icon-512, icon-maskable-512. Manifest now has id, maskable entry, categories.
- Production server: 404 for missing assets (was index.html), Range support (iOS audio), brotli/gzip, ETag, immutable hashed assets.

## Settings added (Options screen, `src/ui/Options.tsx`, re-exported by Menus.tsx; state in store `settings`, applied by `useApplySettings` in `src/platform/a11y.tsx`)
Tabs: Gameplay, Audio, Display, Access, Controls. Esc / pad Start opens the **pause menu** (Keep playing / Options / Title screen with confirm); Esc / pad B = back. Gear button on title screens too.

| setting | where it applies |
|---|---|
| master / music / sfx / voice volume | audio.ts `setVolumes` (master multiplies all) |
| readAloud | `speak()` + live agents; off = silent but captions still show |
| subtitles | `Captions` overlay for every `speak()` line, skipped when the same words are already on screen; top of screen on short phones |
| textScale 1 / 1.15 / 1.3 / 1.5 | `--ts` |
| highContrast | `:root[data-contrast=high]` rules in polish.css (also defaults on from OS `prefers-contrast`) |
| reduceMotion | `data-motion`, fades off; defaults from OS preference on first run; scenes already read the setting |
| dyslexiaFont | OpenDyslexic (new dep `@fontsource/opendyslexic`, loaded lazily only when enabled) for body + display fonts |
| colorBlind | Okabe-Ito blue/orange for yes/no/stat colours, square vs round buttons, up/down arrows on floats and `.pos/.neg` |
| walkMode hold / tap | App patches `walkInput.hold` (StreetScene export) into a latch; reset on convo/minigame/menu |
| gameSpeed 0.75/1/1.25 | `--spd` scales card/panel animation durations; there are **no timers anywhere** (all minigame/court feedback waits for a tap) |
| Graphics Auto/High/Low | writes `localStorage["rc-quality"]` = auto/high/low then reloads (Apply & restart button) |
| aiChat | unchanged |
| Reset to defaults | `resetSettings()` with confirm |
Controls tab is a read-only table (keyboard / gamepad / touch).

Accessibility plumbing: `useDialog` focus trap + focus restore + keeps Enter/Space/Y/N from reaching window-level game shortcuts (used by options, pause, confirm, minigames, conversation); visible blue double focus ring for keyboard and gamepad (mouse hides it); gamepad d-pad moves focus and A clicks inside any `[data-modal]` (sliders and tabs respond to left/right); `role=tablist/radiogroup/switch`, aria labels; screen-reader live region announces stat changes ("Gold up by 10, now 247") and screen changes; `main` landmark; canvas `aria-hidden`.
Game feel: scene curtain + per-phase veil fades, press feedback on chips/tiles/coins, tick haptics on touch, audio pauses when the tab is hidden.

## Viewport results (prod build, `?q=low`; overflow check = any overlay element outside the viewport excluding scroll areas)
| viewport | result |
|---|---|
| 1920x1080 | clean, all 15 screens |
| 1280x720 | clean (dev + prod) |
| 1024x768 | clean, all screens incl. options/pause/minigames |
| 1366x1024 | screens captured, minigames/options checked by eye, fine |
| 844x390 | captured (all screens), options/pause/minigames/convo fine |
| 667x375 | captured; pause card + minigames + options compacted with `@media (max-height:520px)`; budget scroll (other agent) is scrollable and OK |
| 375x667 portrait (`?form=phone`) | rotate prompt shown (`rotate-prompt-375x667.png`) |
Scripted checks for overflow ran per screen in the first 1024/1920 runs; later runs on 1366/844/667 were reviewed from screenshots only (the tool timed out before the clip report returned).

## Performance (prod build)
| chunk | raw | brotli/gzip |
|---|---|---|
| three (+r3f, drei, postprocessing) | 1,412 kB | 426 kB br (455 kB gz) |
| react (+zustand) | 207 kB | 64 kB gz |
| index (game code, UI) | 137 kB | 44 kB gz |
| store | 57 kB | 21 kB gz |
| Conversation (ElevenLabs SDK) | 604 kB | 159 kB gz, **lazy** - loads only when a chat opens |
| StreetScene / MarketScene / StreetUI / MarketUI | 11 / 11 / 9 / 7 kB | lazy, prefetched at idle one phase ahead |
| OpenDyslexic fonts | ~120 kB each weight | only if the option is enabled |
Before: one 1,744 kB index chunk (559 kB gz) plus the SDK chunk (made lazy by me; it was statically imported by App before). Now the eager path is three+react+index (~530 kB gz) and vendor chunks cache independently (`vite.config.ts` advancedChunks). `pnpm sim` unchanged and passing (alwaysYes dies d8, alwaysNo d11, sensible 292/300).
Not done: no real Lighthouse run (no Chrome CLI available here); `node_modules` audio/GLB totals are large (public/audio 22 MB, kenney 25 MB, models 2.8 MB) - the SW caches them on first use. Per-phase GLB preloading beyond the scene chunks needs the scene files (not mine): StreetScene/MarketScene could call `useGLTF.preload` on their kit pieces from `useEffect` in the preceding phase.

## Logic / visual bugs in files I don't own
- `Hud.tsx` Stats has `role="status"` on the whole panel: with my live region screen readers may double-announce. Remove the role there.
- `StreetUI.tsx` hint says "Hold the screen to walk" regardless of the walk-mode setting; read `useGame(s=>s.settings.walkMode)`.
- `StreetUI.tsx`/Court/Summary/Morning window-level Enter/Space handlers are fine now inside dialogs, but a page-level handler fires while the pause menu is open if the key arrives from the gamepad bridge (the bridge routes to the dialog first, so OK).
- `Title.tsx` could expose its own Options button (I add a gear bottom-right on title/setup/reign-end).
- look.tsx `detectQuality()` should read `localStorage["rc-quality"]` (auto => `getDevice().recommendedQuality`); the settings screen already writes it.

## Known issues
- Gamepad navigation is implemented but untested with real hardware (no pad here); logic reviewed only.
- Live ElevenLabs chat path (mic/text) was not exercised (health says voiceAgents true, but I only tested the scripted fallback to avoid spending the key); the error-to-scripted fallback is untested for real network failure.
- Captions only suppress duplicates by text match; the 140 ms delay means a caption can flash briefly for lines whose on-screen text differs slightly.
- Dev-server HMR from other agents' edits reloads the page mid-session; use the :8080 build for stable captures.

## Round 2: conversation screen
Compact fixed-px layout (per html[data-size] s/m/l/xl via --cf/--cb/--cw/--cm/--lw on .convo in polish.css): speech panel top-left (last 2 lines, <=31vw), replies as a column bottom-right, type box+Send only in live No-mic mode under the replies, Mic / No mic / Done bar bottom-left, status text above it, 56px+ touch targets, 3px focus ring. Verified with a rect check (no overlaps, nothing in the centre third, nothing offscreen) at 667x375, 1024x768, 1280x720, 1920x1080, 2560x1440 with captions on and off, plus live text mode at 667x375. Screenshots: .shots/polish/convo2-*.png
