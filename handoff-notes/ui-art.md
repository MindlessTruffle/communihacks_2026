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
