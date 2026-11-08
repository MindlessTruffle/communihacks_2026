# Multiplayer simulation (party-mode preview)

Admin panel ("/" x4) -> "▶ Multiplayer simulation". A scripted, seeded ~90 s preview of Day 1 of a 10-player class match. No networking.

## Flow (all pacing in `SIM_TIMING` at the top of `src/sim/simData.ts`)
1. Lobby (~4 s of joins, then auto "Start Day 1"): room code 4821, pseudo-QR tile, sticker cards pop in with a chime.
2. Court (~25 s): 5 real cards (pip_checkup, fen_prize, rosa_lost_purse, boo_candy, fen_caught). Players decide in 1-4 s, two per card hesitate and change their mind (sticker hops column). Majority wins; real yes/no lines; class gold/happy/people tween; coin trickles from stickers.
3. Street (~25 s): real Meadow/Road/Scenery/Gate; clusters stroll, wave, chat with Marlo and Hazel (bubbles), three players enter the Coin Counter door and return with a coin pop. Slow-damped orbiting bird's-eye camera.
4. Night market (~25 s): real layout; 2-3 stalls each, items picked one by one (icon pop), two get tempted by the pink SALE stalls and put the item back, queue + pay at the cashier.
5. End card: "Your class saved N gold together", hero "Exit simulation", "Replay". Skip ▶ and ✕ Exit always available; Esc exits.

## Files
- `src/sim/MultiplayerSim.tsx` director (clock, events, curtain transitions, music), `simStore.ts` (own zustand store + `simClock`; also swallows keyboard while open), `simData.ts` (cast, timing, votes), `simActors.tsx` (pose-driven gummies, icon pops, name-tag projector/declutter), `SimCourt/SimStreet/SimMarket.tsx` (3D), `SimUI.tsx` + `sim.css` (DOM).
- Everything on screen is a pure function of `simClock.t`, so Skip/Replay are trivial and runs are identical.

## Pausing the real run
`App.tsx`: the main Canvas gets `frameloop="never"` while `useSim().open`; the real overlay is `visibility:hidden`; the sim mounts as a sibling (z 55, under Vfx2D). simStore's capture-phase key blocker keeps Y/N/Space/E/WASD away from the hidden game. adminOpen is left as is, so Exit lands back on the admin panel. Verified `__rc.getState()` identical before/after.

## Edits outside src/sim (additive)
`StreetScene.tsx` exports Road/Meadow/Scenery(+optional `keep` prop)/Gate/SunShafts/frameAt/roadDist; `MarketScene.tsx` exports layout/buildMarket/ShopItem/PriceTag/StringLights/Stars/Moon/FOUNTAIN/CASHIER/useCobbleTexture; `CourtScene.tsx` exports Floor/WallExtension/CoinPile; `GummyPortrait` got `crown={false}` (draws hat/glasses/face); `audio.ts` `currentMusic()`; `Menus.tsx` button.

## Known issues
- Players' custom looks come from mutating `GUMMY_PROFILES` at import (ids `sim-*`).
- At 667x375 name tags/tally crowd the court row; tally hides players' lower bodies.
- Street: door and Marlo can sit at the frame edge; the end-card camera has the fountain in the foreground.
- Vite HMR can duplicate simStore (reload the page when testing); first section load may hitch (curtain hides it).
- Not measured: fps (headless software GL).
