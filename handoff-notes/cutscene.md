# Budget-win cutscene + savings reward

## Flow
`store.checkout()` -> `sim.applyMarket` -> if `result.budgetWin` (list done AND under budget) it sets `store.win` (WinData) and phase "checkout".
`MarketUI` renders `<BudgetWin/>` while `win` is set, then the normal Checkout card (which now shows a "Savings bonus" row).
- 3D beat (~2.8 s): `MarketScene#WinShot` - ruler (Character + crown, walk anim) walks out of the cashier stall toward the camera carrying the basket; warm point light + Sparkles. `FirstPerson` and the viewmodel `Basket` are paused while `win` is set.
- DOM beat: `src/ui/BudgetWin.tsx` + `budgetwin.css`: parchment list, SVG stroke-dashoffset strike per item, quill follows, pen sfx (`pen`, new) + pop + sparkle per item, stamp lands (`stamp` sfx; gold variant + fanfare + more confetti with 3 stars), "You saved N", reward box (savings bonus, responsibility gem, savings streak), coins fly to the treasury chip (top right) and the number ticks up. Auto-ends ~7.5 s.
- Skip: tap/click/Space/Enter/gamepad A jumps to the next beat (3D -> stamp -> reward -> end); Esc skips everything. Reduce-motion: no 3D, near-instant strikes, fade stamp, ~2.5 s. `gameSpeed` scales the clock. Ollie's line goes through `speak("advisor", ADVISOR.budgetWin | budgetWinPerfect)` so captions + browser-TTS fallback work.

## Reward (sim.ts)
`SAVINGS_BONUS_MIN = 3`; bonus = max(3, ceil(saved/2)), saved = budget - spent. Added to gold in `applyMarket`. Responsibility gem +1 given once if budgetWin OR 3 stars (no double count). Streak is `run.budgetStreak` (extra untyped field on RunState, saved with the run; reset to 0 on any non-win shop). `MarketResult` gained `budgetWin, saved, bonus, streak, gemGiven`. `pnpm sim` still passes (sensible bot survives 291/300, was 292).
Also: `store.checkout()` now ignores calls unless phase === "market" and no result yet (Enter on the checkout card used to re-fire `pay()` in MarketUI; also guarded there).

## Admin
Menus.tsx: "Budget-win cutscene" (`store.playWinDemo()`, fake list bread/milk/carrots/apples/candles, alternates normal / 3-star on each press, no gold/gems change, returns to the previous phase afterward; from market/checkout it returns to street) and "Replay tutorial" (dynamic `import("./Intro.tsx")` -> `openIntro()`; Intro.tsx exists now, so it could become a static import).

## Fix pass (real checkout, shared VFX, walk-out shot)
- **Real checkout path verified by hand** (Playwright, keyboard walking): budget scroll -> Enter the Night Market -> walk ('w' + drag-look) -> click stall items (item card, off-list warning works) -> walk to the cashier -> pay (button and Enter) -> `store.checkout()` sets `win` within one frame -> cutscene (3D walk-out -> list strikes -> stamp -> reward) -> normal checkout card with "Savings bonus +N gold" -> Enter / "Go to sleep" -> next day (streak = 1). Non-win runs (one item missing; list done but cake bought = over budget) skip the cutscene and show the normal card immediately (`win` stays null, no `.bw`). Shots in `.shots/fixes/` (08-13).
- **Bugs found + fixed (MarketScene.tsx)**: (1) the fountain sits dead centre in the aisle and its push-out was purely radial, so walking straight down the aisle pinned you against the basin forever; now a blocked step becomes a slide round the rim (towards the side you are on, right if dead centre). (2) `nearCashier` radius was 3.4 but `BOUNDS.zMin` keeps you 2.9 m from the counter, so hugging the edge of the aisle never offered "Pay"; radius now 4.4 (whole end of the aisle).
- **Shared VFX**: `BudgetWin.tsx` no longer has its own `Confetti` / `flyCoins`. Stamp = two `vfx.burst("confetti", vfx.pct(30|70, 52))` (+ `"stars"` on a 3-star run); reward = `vfx.coinsTo(chipEl, n, bonusRowCentre)`. The 2D vfx canvas is lifted above the cutscene by CSS in `src/fx/vfx.css`: `body:has(.bw) .vfx2d { z-index: 80 }` (or add class `vfx-top` to `<body>` for any other overlay). Removed `.bw-confetti` / `.bw-flycoin` / `bwFall` from budgetwin.css.
- **Walk-out shot**: ruler scale 2.4 (was 2), camera dollies in (-17.1 -> -16.2 z) while the ruler walks 2.9 m toward it, so the ruler grows from ~22% to ~40% of the screen height (measured ~285 px of 720 at the end). Basket is now parented to the right hand part: `Character` got `carry` (right arm held forward and slightly across the body at hip/waist height, left arm still swings) and `handChildren` (portalled into `hand_r` with `createPortal`). The basket group counter-rotates the raised forearm so it hangs level; grip = top of the handle (basket model y 0.71).

## Notes / gotchas
- App.tsx opens the pause menu on Esc unless `.item-pop` exists; BudgetWin renders a hidden `<span class="item-pop">` so Esc only skips. Cleaner: have App check `.bw` too.
- VFX: done, see "Fix pass" above (shared layer, lifted above z 70 with CSS).
- Gold ticker in the cutscene chip starts at `goldBefore` (= gold after paying, before the bonus), so the 3D beat sees the HUD gold already reduced by the purchase.
- The viewmodel Basket (bottom-right of the first-person view) is still visible behind the checkout card; harmless.
- HUD stats / list pin are hidden while `.bw` exists (CSS `body:has(.bw)`); the cutscene has its own treasury chip.
- Screenshots + frame sheets: `.shots/cutscene/` (`sheet-1280.png`, `sheet-667.png`, `sheet-667-perfect.png`, frames g*/f*/p*).
