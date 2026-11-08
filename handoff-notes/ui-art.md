# UI art (icons, frames, size brackets)

## What was made
- **Icons** (Codex imagegen, original art, style-reference only): 36 PNGs in `public/ui/icons/` (`name.png` 256px, plus `name@1x/@2x/@3x.png` = 96/192/288px). `<Ico name fallback>` in `src/ui/icons.tsx` renders them with `srcSet`; emoji fallback if a PNG is missing. Sheets + prompts + logs: `tools/_gen/*`, `tools/.codex-*.log`. Re-slice: `python tools/slice_icons.py`.
- **Day frames** (Codex, taupe paper / orange ribbon palette matched to the Sort the Court references, all newly drawn): `public/ui/frames/{panel,ribbon,plate,tile,bubble,key,ghost,gold,wood,yes,no}@1x/2x/3x.png`. Re-slice: `python tools/slice_frames.py`; regenerate CSS vars: `python tools/frames_css.py` -> `src/ui-art.css` (image-set 1x/2x/3x + PERCENT 9-slices, so density never changes the slice).
- **Night UI**: Kenney UI Pack RPG (brown/beige only) from `public/ui/kenney/`, pixelated rendering.
- Wired into Hud, CourtUI, Morning, Summary, Title, Treasury, BudgetScroll, MarketUI, StreetUI (emoji kept only where no icon exists: food items, morning income-line icons).

## Theme switching
`src/ui/icons.tsx` subscribes to the store and sets `<html data-theme="day|night">`: street, budget, market, checkout = night (Kenney); everything else = day (art). CSS: `:root[data-theme=...]:not([data-contrast="high"])` blocks at the end of `src/styles.css`. High-contrast mode skips all art and uses the plain CSS frames.

## Size brackets (no stretch scaling)
`--u` is now a FIXED px per bracket (all UI is multiples of it). Thresholds on viewport height (media-query fallback; `html[data-size]` takes over when device.ts sets it, same values):
| bracket | height | --u | notes |
|---|---|---|---|
| s | <=480 | 6.4px (7px if h>=400) | compact horizontal stat bar, larger small-text, hint pill right-aligned, 5-col item grid |
| m | 481-800 | 10px (12px if w>=1100) | corner stat plate |
| l | 801-1200 | 15px (17px if w>=1800) | |
| xl | >=1201 | 22px | |
Base sizes: body text 2.1-2.75u, buttons 2.6u font / min 64px tall, panel 9-slice border 1.8u, hit targets >=56px. `--ts` (text size setting) and high contrast still multiply/override on top. Touch (`pointer:coarse` / `data-input=touch`) hides the keyboard hint chip. Verified screenshots at 667x375, 844x390, 1024x768, 1366x1024, 1280x720, 1920x1080, 2560x1440 in `.shots/ui/` (`ui-k*`, `ui-n*`, `ui-treasury*`).

## Fixes made along the way
- BudgetScroll overflowed the viewport at 720p (Enter button off-screen): item grid now scrolls inside the scroll (`.items-wrap`), 6 cols (5 on s); HUD/hint pill hidden while the scroll or treasury is open.
- Setup card avatars/buttons now fit on one row; ribbon text `nowrap`.
- I created an empty `src/polish.css` placeholder because `main.tsx` imported it before the polish agent made it (overwrite freely).

## Still placeholder / known issues
- Style match is close in palette/outline/shape, not pixel-iterated: ribbon band is thinner than the reference, no footer ribbon / key-cap hint on the summary card yet (`key` frame exists, used for the Y/N tag only).
- `data-size`/`data-input` attrs not yet present in device.ts at time of writing: fallbacks are media queries; no gamepad glyph hints implemented.
- Checkout screen and treasury at 667x375 not visually re-verified after final CSS (same components as verified screens).
- Food item tiles still use emoji; "purple" buttons reuse the wood frame; Kenney night buttons rely on white text on brown (4.4:1, large text).
- Slice/border values are hand-tuned in `tools/frames_css.py` (`S` table) and the day block of `src/styles.css`.

## Round 2 (fix round)
- **Palette**: day frames regenerated warm (parchment panel with corner studs, red-orange chunky ribbon, cream plate/tile/ghost). Files `public/ui/frames/*@1x|2x|3x.png`; `python tools/slice_frames.py && python tools/frames_css.py`. Prompts in `tools/_gen/g2-*`.
- **Budget scroll**: fixed-height tile rows (`--row`), grid scrolls inside, price/name never clip, Enter button inside the frame; Kenney rods removed at night; stray yellow box was my gold glow box-shadow (removed). Hint paragraph hidden at bracket s.
- **Night contrast**: buttons use darkened Kenney brown (`kenney/*_brownDark*.png`, white text ~6:1); primary (`.gold`) = beige plate with ink text.
- **Icons**: 36 new generated icons: 17 food/market items (`bread`...`juice`, wine uses `juice`), `repeat plus minus box boxchecked tap`, input glyphs `key keywide keycluster mouse touch keysmall pad_a pad_b pad_x pad_y pad_start pad_stick` (blank art; letters are CSS text). `EmoIco`, `FoodIco` in icons.tsx map content-file emoji to PNGs (Morning income lines, guild buttons, market list pin/item card, checkout). `sparkle` came out as a fragment - unused.
- **Input prompts**: `<Hint k="yes|no|next|move|menu">` and `<Continue/>` read `html[data-input]` (via `rc-device` event): mouse = keycaps (Y/N/Space/WASD), gamepad = pads (X=yes, B=no, A=next, stick=move), touch = nothing / "Tap to ..." text, attribute missing = plain `[Y]` text. Used on court yes/no, court reply/advisor/summary/morning continue, street + market hints (StreetUI hint follows walkMode hold/tap and getDevice().input). The old "check/cross" chip is replaced by Y/N key glyphs.
- **Brackets**: `--u` and layout now keyed on `html[data-size]`; media queries remain only under `:root:not([data-size])` as fallback. Hud stats lost `role="status"` (a11y.tsx announces).
- Title component is owned by the environment agent now; I did not touch it after the handoff (Setup/ReignEnd still mine).
- Verified: 667x375, 1280x720, 1920x1080, 2560x1440 (`.shots/ui/ui-r*.png`).
- Known: key glyph letters are small at bracket s; checkout screen not re-shot this round; gamepad glyphs only verified by forcing `data-input=gamepad`.

## Round 3: decision bubble, layering, overlap checker
- **Decision bubble** (`DecisionBubble` in `CourtUI.tsx`): compact (buttons 56/64/76/96 px for s/m/l/xl via `--dec-btn`, labels clamped to 2 lines). Anchored to the ruler head (`useAnchors.ruler`), re-evaluated every frame; searches a grid for the closest spot that is inside the viewport and overlaps none of: `.phase-dots .corner-btn .stats .speech .advisor-tip .hint-pill .captions .wallet .list-pin` (live `getBoundingClientRect`) nor the head itself. Y/N key glyphs now sit only on the yes/no buttons (removed from the speech panel).
- **z-index scale** (`styles.css`, end): `--z-hud 10 < --z-panel 20 < --z-decision 30 < --z-dialog 40 < --z-captions 50 < --z-toast 60 < --z-veil 80`. `.captions`, `.veil`, `.curtain` from polish.css are re-pointed to the scale with a higher-specificity override.
- **Captions band**: while `.captions` exists, bottom strip `--cap-band` is reserved (cards/scroll shrink, hint pill / interact / advisor tip move up); captions max-width 56u; at bracket s they sit bottom (not top). Modal cards, budget scroll and treasury hide the HUD panels (phase dots, stats) instead of drawing over them.
- **s bracket**: stats become a compact vertical column; phase dots show only the active phase; advisor tip right-aligned; denser cards.
- **Overlap checker**: `node tools/overlap-check.mjs [url]` (needs `playwright`; the same `collect()` was pasted into the Playwright MCP for my runs). Steps: setup, morning, court ask/reply/advisor, court-done, summary, street, budget, market, checkout at 667x375, 1024x768, 1280x720, 1920x1080, 2560x1440. Clipped (scrolled-away) tiles are ignored. Last run: zero overlaps / offscreen at all five sizes.
- Title is now `START` (environment agent); the checker clicks it.

## Round 4: smaller day UI + hand-inked SVG frames
- **Frames are now SVG** (`public/ui/frames/svg/*.svg`, generated by `python tools/gen_frames_svg.py`, which also writes `src/ui-art.css`): wobbly rounded outlines with uneven weight (outer/inner paths wobble independently), subtle paper grain (feTurbulence) plus pencil hatch strokes, offset hand-inked shadow, inked inner rule + corner studs on the panel. Pieces: panel, plate, tile, bubble, key, wood/gold/ghost buttons, yes (round), no (square), ribbon with swallow tails. Vector = crisp at every DPR; slices are px of each SVG's intrinsic size (`--sl-*`). The old raster Codex frames stay in `frames/*@Nx.png` as unused fallback art.
- **Icons**: day theme applies an SVG displacement filter (`#rc-hand`, injected by icons.tsx) so raster icons get a slight hand-drawn wobble. Headers keep Lilita One (hand-lettered feel, very legible); body stays Atkinson.
- **Smaller day UI**: `--u` under `[data-theme=day]` per bracket: s 5.4 (5.8 if h>=400), m 7.8 (8.8 if w>=1100), l 11 (12.5 if w>=1800), xl 16. Night keeps the larger units. Decision bubble buttons 56/58/66/80 px, label font 14/15/17/21 px; `.btn` min target 56px.
- Overlap checker re-run after the change: 667x375, 1280x720 full flow (setup..checkout) = zero issues; 1024x768, 1920x1080, 2560x1440 day phases (setup, morning, ask, reply, summary) = zero issues.
- Shots: `.shots/ui/before-r3-*-ask.png` (before) vs `ui-p1280-ask.png`, `ui-p667-ask.png` (after).

## Owl anchor
`DecisionBubble` reads `useAnchors.getState().owl` (percent coords, optional until anchors.ts exports it): the owl head is treated as an uncoverable rect and the bubble prefers the side of the ruler's head away from the owl. Verified by injecting `owl: [30,38]` at 1280x720 (bubble moved left, clear of both). Court ask/reply/advisor re-verified rendering correctly at 1280x720 (`ui-q1280-ask|reply|advisor.png`); the empty white bubble / bare "Day 1" in `.shots/env/r6_court_final.png` was not reproducible (likely captured while the SVG frames were still loading / ui-art.css was being regenerated).

## FINAL STATUS (wrap-up)
**Done**: 72 generated icons (UI, food, glyphs, income), hand-inked SVG day frames (`tools/gen_frames_svg.py`), Kenney night theme with dark-brown buttons, phase-based theme switching, fixed-px size brackets via `html[data-size]` (day theme uses smaller units), input glyph prompts (`Hint`, `Continue`), z-index scale, caption band, compact `DecisionBubble` (HUD-avoiding, owl-anchor aware), overlap checker `tools/overlap-check.mjs` (last runs: zero overlaps at 667/1024/1280/1920/2560). Court ask/reply/advisor verified at 1280x720 and 667x375 (`.shots/ui/ui-final*-ask|reply|advisor.png`). `tsc --noEmit` passes. No Codex jobs running from this agent (all logged `done`).
**Not done / known issues**
- **At 800x600 and 667x375 the yes/no card still covers part of the ruler**: the bubble search avoids HUD rects and a fixed-size head box, but on short viewports there is not enough free area, so it overlaps the ruler's body/face region. Needs a smaller bubble (icons only) or a dedicated placement for bracket s.
- Speech panel does not avoid the owl/visitor (no visitor anchor; owl anchor only used by the bubble, and only once `anchors.ts` exports `owl`).
- Style match with Sort the Court is by eye; raster Codex frames are unused fallback art; icons are Codex PNGs with a wobble filter, not redrawn as SVG.
- Not re-verified after the final CSS: treasury at 667x375, gamepad glyphs on real hardware; `sparkle` icon is a bad crop (unused).
- The empty white bubble / bare "Day 1" in `.shots/env/r6_court_final.png` could not be reproduced.

## Round 5: fluid scale + "one big stylized button" (supersedes the fixed-px bracket table above)
**Scaling model**
- `--u` is no longer a fixed px per bracket. `src/platform/device.ts` `unitFor(h, w, night)` interpolates piecewise-linearly over viewport **height** through the old tuned values as anchors (day: 375->5.4, 390->5.8, 480->6.8, 720->8.8, 1080->12.5, 1440->16; night: 375->6.4, 480->8.6, 720->12, 1080->17, 1440->22), keeps growing proportionally beyond 1440 (4K = 24px day) and shrinks proportionally below 300, then caps by width (`w/128` day, `w/100` night) so 1000x1000 / 4:3 windows do not overflow. It writes `--ud` / `--un` (+ `--vw`/`--vh`) inline on `<html>`; CSS picks `--u: var(--ud)` (day) or `var(--un)` (`[data-theme=night]`). `styles.css` has a pure-CSS `clamp(min(vh,vw))` fallback for before JS runs. Change the curve by editing the `DAY_U` / `NIGHT_U` anchor arrays only.
- `html[data-size] s/m/l/xl` (thresholds unchanged) are **layout presets only** (compact stat column at s, corner plate at m+, 5 vs 6 grid columns, hint pill placement...). No bracket sets a px size any more. Decision card (`--dec-btn/--dec-font/--dec-pad`) and conversation/captions (`--cf --cb --cw --cm --lw`) are now formulas of `--u` (min 56px buttons, so touch targets stay >= 56 even at 600x340). `--ts` (text size) still multiplies on top.
- Change detection: `startDeviceWatch` now listens to resize (rAF-coalesced), orientationchange, visualViewport resize, a ResizeObserver on `<html>` and a re-armed `(resolution: Ndppx)` media query (browser zoom / DPR / moving between monitors). `Device` gained `w`,`h`, so `rc-device` fires on every viewport change. `DecisionBubble` and the speech panel re-run their placement on resize/`rc-device` (and every frame when anything they depend on moves).
- Canvas: `.canvas-wrap { position:absolute; inset:0 }`; verified canvas rect == viewport at every sweep size (no letterbox).
- Verified (Playwright, one page, `setViewportSize` sweep): 600x340 -> 3840x2160 in 25 steps + 1000x1000, 2560x1080, 1366x768, 1440x900, 844x390, 900x1150, 1600x900: court-ask state, canvas fills window and `tools/overlap-check.mjs` collect() reports zero overlaps/offscreen at all of them. Full flow checker also run at 844x390, 1100x650, 1366x768, 2560x1080 (see report in the task summary).

**Button philosophy**
- `.btn.hero` = the ONE primary action per screen: big (font 3.5u, min-height 8.4u, >= 64px), icon + bold label + `▶`, colour-only idle shimmer (no movement, so the target never wiggles), deep press (translate + scale). Used for: Morning "Open the court", Court done "See the day", Summary "Continue" (now a real button, not just a tap hint), Budget "Enter the Night Market", Street door "Enter X" / gate "Go to the Night Market", Market item card "Put in basket", Pay at the counter, Checkout "Go to sleep", Treasury "Done" (replaces "Back").
- Secondary actions: `.btn.sm` (ghost, small) e.g. Morning "Treasury", item card "Put one back"; `.btn.link` (underlined text, still >= 56px tall) for "Leave it". Morning footer is a stacked `.footer.stack`.
- Court yes/no stays two round/square chunky buttons (`.thought`), sized by `--dec-btn` (~58px at 720p, ~90px at 1440p).
- Placement (`DecisionBubble`): obstacles = HUD rects (live) + king (head anchor + throne body), owl (anchor `owl`, head + body) and visitor. Character box sizes follow `S = min(W/1.6, H)`. The visitor has **no anchor** in `useAnchors` and scenes are off limits, so it is a fixed estimate (`VISITOR = [83, 58]` % of the screen; accurate within ~5% in the shots at 16:9, 1:1 and 21:9) - replace with a real anchor if the scene ever exports one. If no clear spot exists the bubble switches to `data-compact="1"` (icon only, labels remain as aria-label/title). The speech panel (`useAvoidScene`) narrows itself from the left if it would touch the owl or visitor.
- `tools/overlap-check.mjs`: now takes sizes as argv[3] / `SIZES` env, `CHROMIUM` env (executablePath), `SHOTS` dir for per-screen screenshots, seeds `rc-intro-seen`, and only auto-runs when executed directly (exports `collect`, `SELECTOR`).
