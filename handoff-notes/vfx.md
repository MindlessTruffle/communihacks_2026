# VFX / game-feel layer (agent notes)

Files: `src/fx/vfx.ts` (bus + API), `src/fx/Vfx2D.tsx` (canvas overlay), `src/fx/Vfx3D.tsx` (instanced billboards in R3F), `src/fx/vfx.css` (button squash, stat pops, canvas z-level).
Shots: `.shots/vfx/` (court-yes-*, coinfly-*, ripple-*, market-burst-*, reduce-glow-*, street-walk-*, market-walk-*; tags `1280-high`, `667-low`, `-reduce`).

## API (import `{ vfx } from "../fx/vfx.ts"`)
```ts
vfx.burst(kind, at, opts?)   // kind: "confetti"|"coins"|"sparkle"|"hearts"|"dust"|"ripple"|"stars"
                             // at: {x,y} screen px | DOM Element (its centre) | THREE.Vector3 / {x,y,z} world position
                             // opts: { n?: count, scale?: 3D size multiplier (1 = person-sized, court visitor ~2.2), spread? }
vfx.coinsTo(el, n = 6, from?)// coins fly in an arc from `from` (default lower-centre) into el, el pops on arrival
vfx.stat("gold"|"happiness"|"people") // HUD stat element (null if HUD not mounted)
vfx.pct(px, py)              // viewport percent -> screen px point, e.g. vfx.burst("confetti", vfx.pct(50, 40))
vfx.ripple(x, y)             // hand-inked tap ring (already fired on every pointerdown)
```
Screen `at` goes to Vfx2D, world `at` goes to Vfx3D (needs `<Vfx3D />` mounted in the scene; it is in Court, Street, Market). For the budget-win cutscene: `vfx.burst("confetti", vfx.pct(50, 35))`, `vfx.coinsTo(vfx.stat("gold"), 10)`.
Pooling: 2D 260 particles (120 low), 3D 320 (140 low), ring buffers (oldest recycled). Low tier (`QUALITY==="low"`) halves every count and uses DPR 1 for the canvas. 3D is ONE instanced draw call, hidden (no draw) when nothing is alive.
Reduce motion (`settings.reduceMotion`, read live): bursts become one soft static glow (fades in/out, no travel), dust is dropped, ripple is a non-expanding ring, coin fly becomes a glow on the stat, button squash CSS is removed (brightness only), stat pops become a glow. 3D footstep dust is skipped.

## Where each effect fires
| effect | trigger | where |
|---|---|---|
| tap ring | every primary `pointerdown` | Vfx2D (window capture) |
| button squash + overshoot pop | `.btn` / `.yes` / `.no` / `.corner-btn` :active | vfx.css |
| coin fly into gold stat | `run.gold` increases (store subscribe, any source incl. admin +gold) | Vfx2D; if HUD hidden (conversation/minigame) coins pop at 50%/58% instead |
| hearts from happiness stat / sparkle at people stat / dust on a drop | `run.happiness` / `run.people` deltas | Vfx2D |
| stat icon pop | `data-pop` on `.stat` (set in Hud.tsx), `.vfx-hit` on coin arrival | vfx.css |
| hearts + sparkle | store fx `"kindness"` | Vfx2D |
| confetti | store fx `"coins"` (minigame reward) | Vfx2D |
| stars | checkout star reveal (one line in MarketUI Checkout timers) | MarketUI.tsx |
| confetti + sparkle (+hearts if happiness up) over visitor | fx `"decision"`, choice yes and net delta >= 0 (quiet on "no") | `CourtFx` in CourtScene.tsx |
| dust when visitor arrives | Visitor onArrive | CourtScene.tsx |
| street footstep dust | step timer (0.32 s) | StreetScene.tsx |
| market footstep puffs 2.8 m ahead, alternating sides | step timer (0.38 s) | MarketScene.tsx FirstPerson |
| sparkle on item pick | `pick()` | MarketScene.tsx |
| coins + sparkle at the stall | fx `"basket"` (Vfx3D `slotPos` prop) | Vfx3D / MarketScene |

Edits outside src/fx: Hud.tsx (`data-stat`, `data-pop`), App.tsx (1 import + `<Vfx2D />`), StreetScene (2 imports, `<Vfx3D />`, 1 burst), CourtScene (2 imports, `<Vfx3D />`, `<CourtFx />`, 1 burst, CourtFx component), MarketScene (2 imports, `<Vfx3D slotPos=.../>`, 2 one-line bursts), MarketUI (1 import, 1 burst call). No store/sim/Menus/Intro/BudgetWin/styles.css edits.

## Perf (1280x720 headless Chromium, real GPU, `?q=high`; draw calls = all gl draw calls per frame incl. shadow/AO passes; sustained = confetti x40 every 120 ms)
| scene | idle fps / draws | during effects fps / draws | p95 frame |
|---|---|---|---|
| Court | 60.3 / 184 | 60.2 / 186 (confetti storm) | 16.8 ms |
| Street | 60.4 / 387 | 60.5 / 393 (walking, dust) | 16.8 ms |
| Market | 60.4 / 264 | 60.3 / 232 (walking; camera view differs) | 16.8 ms |
| Court 667x375 `?q=low` | 60.4 / 145 | 60.3 / 146 | 17 ms |
| Market 667x375 `?q=low` | 60.5 / 213 | 60.6 / 193 | 17 ms |
VFX adds +1 to +2 draw calls only while particles are alive. Not measured on a real phone / iGPU.

## Honest list of what is off / not done
- Idle sparkle on doors / market gate / cashier (optional item 5): NOT done.
- Footstep dust is subtle: the street/market hint pill covers the player's feet and the bottom of the market view, so puffs are mostly hidden. I could not get a clearly visible dust frame in a screenshot.
- 3D hearts/confetti in the court read small at 1280x720 (about 12-25 px); I enlarged them once, final court-yes shots were taken before the enlargement.
- Coin fly starts from a fixed point (screen lower-centre) rather than the thing that paid out; `coinsTo(el, n, from)` accepts `from` for the cutscene agent.
- The Hud stat remounts on each change (`key={bump}`), so the stat ico pop plays at once while coins land ~0.8 s later; arrival pop re-finds the live element.
- Basket coin pop at the stall was only verified through the bus (the stall was out of view in the shot); the pick sparkle likewise.
- The dev server full-reloaded often (other agents editing), so measurements came from my own Playwright runs in `scratchpad` (not committed), driven through the store via the app's own module URL.
- Budget-win cutscene is not hooked (belongs to the other agent).
