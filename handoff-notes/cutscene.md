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

## Notes / gotchas
- App.tsx opens the pause menu on Esc unless `.item-pop` exists; BudgetWin renders a hidden `<span class="item-pop">` so Esc only skips. Cleaner: have App check `.bw` too.
- VFX: `src/fx/vfx.ts` exists but no layer was mounted when I finished, so BudgetWin uses its own tiny `Confetti` + `flyCoins` helpers (top of BudgetWin.tsx). Swap for `vfx.burst("confetti", pt)` / `vfx.coinsTo(chipEl, n)` once the layer mounts above z-index 70 (the cutscene overlay).
- HUD stats / list pin are hidden while `.bw` exists (CSS `body:has(.bw)`); the cutscene has its own treasury chip.
- Screenshots + frame sheets: `.shots/cutscene/` (`sheet-1280.png`, `sheet-667.png`, `sheet-667-perfect.png`, frames g*/f*/p*).
