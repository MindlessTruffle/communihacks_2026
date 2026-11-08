# Environment art + scene lighting (agent notes)

## What changed
- New mid-poly environment kit, generated headlessly: `tools/blender/gen_env.py` -> `public/models/env/*.glb` (49 assets, ~5.8 MB total, 48k tris if one of each).
- Scenes rebuilt on the kit (no Kenney building/nature/castle pieces remain in Court / Street / Market / Kingdom; Kenney is still used for the mini-characters and the market's food items, which come from `economy.ts`).
- `look.tsx`: presets retuned (warm key, soft cool fill, pink-lilac haze, mild bloom, light AO, Khronos Neutral tone mapping instead of ACES), `detectQuality()` honours `localStorage["rc-quality"]` ("high" | "low" | "auto"). Order: `?q=` URL param, then `rc-quality`, then auto heuristic. Grass blade is now 3 segments.
- New `src/scenes/env.tsx`: asset loader + shared materials + instancing (`Props`, `Prop`, `setGlow`, `useSandTexture`, `rng`, dev `Gallery`).
- Files touched: `CourtScene.tsx, StreetScene.tsx, MarketScene.tsx, Kingdom.tsx, look.tsx, env.tsx (new), tools/blender/gen_env.py (new)`. Gameplay anchors untouched (COURT constants, street CURVE/STOPS/DOORS + proximity, market layout()/slots/BOUNDS/CASHIER, item pick, basket).
- Old `public/models/backdrop.glb` and `throne.glb` are no longer used by the scenes (replaced by `env/court_wall.glb`, `env/throne.glb`); `common.tsx#preloadCore` still preloads them - harmless, could be dropped (not my file).

## Generator usage
```
"E:/Steam/steamapps/common/Blender/blender.exe" -b --factory-startup -P tools/blender/gen_env.py -- E:/RoyalConcerns/game/public/models/env [asset names...]
```
No names = rebuild everything (~10 s). Add an asset: write a `@asset def my_thing(): b = Builder("my_thing", seed); ...; return b.build()` and add the name to `ENV_NAMES` in `env.tsx`.
Authoring space = three.js space (x right, y up, z toward the viewer; the front of houses/stalls is +z). The `Builder` has `box / blob / tube / cyl / prism` primitives, a `push/pop` transform stack, per-vertex colour + baked AO.
Gotcha: the Blender glTF exporter treats colour attributes as sRGB-encoded and linearises them, so `Builder.build()` pre-encodes to sRGB. Do not "fix" that.
Dev viewer: `http://localhost:5201/?gallery=1` (or `?gallery=house,tree` prefix filter) shows every asset with orbit controls.

## Assets (all `public/models/env/<name>.glb`, one mesh, materials `env` (vertex colours) + `glow` (window / lantern glass))
trees: tree_oak_a, tree_oak_b, tree_olive, tree_round, tree_pine, tree_small · plants: bush_a/b/pink/white, flowers_pink/yellow/white/purple, tuft · rocks: rock_a/b/c, path_stone · props: fence, lamp_post, sign_bracket (unused), crate, barrel, banner_red/green, well, fountain · market: stall_terra/teal/mustard/pink · houses: cottage_a/b/c, house_two, house_tall, shop · landmarks: tower, castle, windmill + windmill_blades (rotated in code), gate_towers · court: court_wall (arch window, stone blocks), pillar, banner_hang, sconce, perch, throne (same unit scale as the old throne, scene scales x2.5).
Instances share two materials (`envMat`, `glowMat` in env.tsx). `setGlow(n)` sets window glow: Court 0.7 day / 2.2 night, Street 1.7, Market 3.2.

## Palette (sRGB, `P` in gen_env.py) - one distinct value/hue per surface type
- ground: grass #8ccb4d (dark clumps #62ad3e, light #b8e26a) | path: warm sand #f4dba8 (feathered alpha edges) | path edge stones #d2cdc2
- timber #80502f / dark #5c3a24 / light #a8683c | plaster #f0e4c8 | roofs: terracotta #cb5a3c/#dc7249, slate blue #4f7fa0 | stone #b4b0a8
- foliage: deep teal #27706f / mid #37917f / light #5eb08a, olive #8fb23c / lime #b6cc4e | shutters/doors: teal #3e8c90, mustard, wine
- court: wall = cool grey-lilac stone, arch frame cream, floor warm biscuit tiles, carpet red + gold, throne gold + velvet, banners purple
- Lighting presets (look.tsx `LOOKS`): day (court), dusk (court at reign end), sunset (street), night (market).

## Performance (measured with draw-call hooks on the GL context, 1280x720, RTX 4060 Ti, so fps is vsync-capped; the numbers that matter are the counts)
Counts are per frame, ALL passes (shadow map + main + N8AO normal/depth pass on high).
| scene | tier | draw calls | triangles | fps (this GPU) |
|---|---|---|---|---|
| Court (day, 100 people) | high | ~210 | ~260k | 60 |
| Court (500 people, grown) | high | ~257 | ~332k | 60 |
| Court | low | ~210 | ~225k | 60 |
| Street | high | ~375-420 | ~650-675k | 60 |
| Street | low | ~334 | ~440k | 60 |
| Market | high | ~299 | ~240k | 60 |
Instanced props are bucketed into 26 m cells (Props `cell` prop) so frustum + shadow culling drops far cells. Tiny props (tufts, flowers, path stones, fences) do not cast shadows. Street scatter counts are x0.4 on the low tier.
NOT verified on a real phone / mid laptop iGPU. Street low is the heaviest low-tier scene (440k tris incl. shadow pass).

## Known issues / next steps
- Market food items (Kenney food kit, from `economy.ts`) are still the blocky low-poly style; replacing them needs the item models regenerated in the same palette (game/ not mine).
- Low tier: houses are still ~2-4k tris each; a LOD1 variant per house (no timber braces / flower boxes) would roughly halve street tris on phones.
- Court `Filler` (kingdom dressing) is drawn in one big cell (camera is fixed), shadows off.
- `pointLight` count: street 3 door lights + gate, market 4 + trap stalls + fountain, court 3. Each adds shader cost on low-end GPUs.
- The street `Road` / kingdom road are alpha-feathered ribbons (renderOrder 1, polygonOffset); do not put transparent objects directly on them.
- Gallery dev tool lives in `CourtScene` (`?gallery=` param); remove the 2 lines there if you do not want it shipped.
- Before screenshots: only the court exists (`.shots/env/court_before_clean.png`); the street/market "before" were not captured before the rewrite.

## Screenshots (`E:\RoyalConcerns\game\.shots\env\`)
court_before_clean.png -> court_after.png, court_after_grown.png | street_after.png (+ street_v4b.png convo view, street_low.png) | market_after.png (+ market_v2b.png) | gal_*.png asset galleries.

---
# Round 3: to-scale court, device-aware camera, new title screen
Reference prototype (E:\RoyalConcerns\ref-communihacks) was used for scale/simplicity only. Nothing of theirs is in our repo: no GLB/blend/textures/cloud image; their Perandory font is NOT used.

## A. Court (CourtScene.tsx, Kingdom.tsx, gen_env.py)
- Direct side view, much closer. Elements only: warm brick back wall with 3 tall pointed windows + 2 sconces (`court_wall`, `sconce`), throne on 5 limestone steps with plum/gold runner on the left (`throne`, profile-extruded stairs, chair faces +x), big grounded coin mound in the left foreground (`coin_mound_s/m/l`: coins face the camera, spilled coins on the floor; tier by treasury, <150 / <400 / more), plum runner + plain tile floor on the right, owl perch by the stairs. Pillars, banners, extra clouds are gone from the scene.
- Scale: Kenney mini characters are only ~0.37 units tall, so ruler/visitors use `CHAR = 5` (~1.9 m). Owl 1.9 on the perch, 4.6 as visitor.
- COURT constants changed (values only): throne [-7.4,0,0.3], seat offset, visitorStand 1.2, visitorZ 2.7, offstage 15, owl [-3,1.9,1.5], coins [-8.4,0,3.7]. Visitor walk-in/stand/leave, CoinPile pulse, `useAnchors.ruler` all still work.
- Kingdom: each of the 3 windows frames a fixed slice (camera x is constant), so `LAYOUT` is placed with `seen(window, depth, offset)`; growth order unchanged (`visibleCount`). Castle is always on the horizon, three snowy peaks (own jittered-cone geometry, `Peaks`) are aligned one per window. Road ribbon winds through the windows.
- Gen: `court_wall` uses a Boolean slab (pointed-window prisms) + brick boxes + cream trim; stats ~13k tris, 1.2 MB. Coin mounds 2-9k tris.

## B. Device-aware framing (`frameCourt` in CourtScene.tsx)
Fixed authored direction (0,-0.012,-1); `SAFE` boxes (throne+ruler+steps, coin mound, visitor lane) must stay inside a per-device screen rectangle; a focus point (-6.8,2.6,0.3) is pinned to a per-device screen position with `setViewOffset`; the camera dollies back (1.5% steps) until all box corners fit. Profile from `getDevice()`: phone (ax .25, ay .5, bottom margin for the stats), tablet / <1.5 aspect, desktop, portrait. Re-runs on resize and on the `rc-device` event. The ruler-head anchor is re-projected after every reframe. Checked at 667x375, 844x390, 1024x768, 1366x1024, 1280x720, 1920x1080, 2560x1440 with HUD + speech panel visible: no character is covered (sheet: `.shots/env/r3_devices_sheet.png`, singles `r3_dev_<w>x<h>.png`). Dev only: `window.__courtFrame` holds the last framing result.

## C. Title (src/ui/Title.tsx `Title` only + src/ui/title.css)
- Own cloud art: generated with Codex imagegen -> `public/ui/cloud-bank.jpg` (80 KB). Three misty snowy peaks are 3D (Kingdom `Peaks`), seen by the title camera high over the clouds.
- Font: `@fontsource/bodoni-moda` (OFL), weight 700, uppercase, scaleX .86 to feel semi-condensed. Ivory, no outline, soft shadow. One START (diffuse cloud glow, min 230x106). If a save exists: secondary text buttons CONTINUE and OPTIONS (Options sends Escape -> App's pause menu). Enter/Space also starts. The New Reign confirm in App.tsx is untouched.
- START: 2 s quintic-eased camera descent (`intro.progress` in scenes/anchors.ts drives CourtCamera between the peak pose and the court pose; clouds slide up in DOM, white wash mid-fall), then `goto("setup")` + the chooseRuler line, i.e. the existing ruler picker. Reduced motion (store setting or OS): ~180 ms crossfade, no camera travel (measured 204 ms). Esc skips (listener registered at module load, before App's, so the pause menu does not open; measured 584 ms when pressed at 500 ms).
- package.json: added `@fontsource/bodoni-moda`.

## Perf (court, high tier, RTX 4060 Ti): 173 draw calls, ~211k tris per frame incl. all passes, 60 fps.
## Shots: before `r3_court_before.png`, `r3_title_before.png` -> after `r3_court_after.png` (HUD) / `r3_court_after_clean.png`, `r3_title_a.png`, `r3_title_save.png`, `r3_descent_sheet.png`, `r3_devices_sheet.png`.
## Known: the brick wall is quite saturated next to the gold; peaks are simple cones (misty on purpose); gen_env.py "court_wall" Boolean needs Blender >= 4.x (EXACT solver).

---
# Round 4 (fixups) + painterly texture system
## Fixes
- Owl perch moved to x=-5.3, z=2.8 (plain wall left of window 1, in front of the stairs): the owl reads against brick at every bracket, never in front of a window. Brick wall muted/darker (mid-value warm brick, mortar #8f7464). Floor grout softened. Title peaks rebuilt: jittered faceted cones, jagged snow line (snow cap + blue-grey rock below), baked atmospheric haze toward the bottom/distance, no fog.
- Measured (1280x720, RTX 4060 Ti, all passes): title idle 87 draw calls / 74k tris / 60 fps; START descent 111 calls / 121k tris / 60.5 fps; court (gold mound + shafts + flames + coin rain) 198 calls / 284k tris / 60 fps; street 372 / 641k / 60; market 257 / 279k / 60.

## src/scenes/painterly.ts (API for the characters agent)
```ts
painterlyMaterial(opts: { color?, map?, detail: "stone"|"brick"|"wood"|"roof"|"cloth"|"skin"|"hair"|"metal"|"gold"|"foliage"|"ground"|"auto", scale?, roughness?, metalness?, vertexColors? }): THREE.MeshStandardMaterial
applyPainterly(root: THREE.Object3D, pick?: (mesh) => opts | null): void   // default pick guesses from material/mesh names, keeps colour/map/vertex colours
```
MeshStandardMaterial + onBeforeCompile: triplanar sample of a tileable hand-painted greyscale swatch (x2, mean grey, tints any colour), warm-top / cool-underside world-up gradient, painted edge highlight (fwidth of the normal), cavity darkening from baked vertex colour, soft rim. One program per detail (`customProgramCacheKey`). Works with InstancedMesh; skinned meshes sample in bind-pose object space (no swimming). "auto" (env kit) classifies each fragment from its vertex colour into stone / wood / roof / foliage / gold. `scale` = swatch tiles per world unit (defaults per detail; characters usually want ~1.0-1.5 for skin/hair/cloth, they are ~1 unit tall x5-6 scale).
Swatches: `public/textures/painterly/<detail>.webp` (512 px, greyscale), generated with Codex imagegen (1024 raw in `raw/`), normalised + made seamless with a roll-blend (wood grain has a faint vertical seam). Hook `usePainterly(opts, deps)` in env.tsx for React.
Applied to: all env kit assets (`envMat`, brick court wall, metallic gold mounds), court floor, street / market / kingdom ground + hills, peaks.

## Court detail + arrangement
Timber dado panelling with rail, stone trim band + timber ceiling beam with brackets, stone window frames with keystones and sills, patterned rug (gold border + medallions) lifted with polygonOffset, plum banner framing the throne, throne with studs / piping / tassels / rosettes, shader flames (animated noise flipbook-less) + glow halos on both sconces. Stage: foreground coin mound + owl, mid throne group + visitor lane, background windows (kingdom + peaks).

## Volumetric light (src/scenes/fx.tsx)
`Shaft` (additive prism, soft noise shader), `WindowShafts` (3 warm shafts through the windows + `Sparkles` dust on the high tier; low tier = static shafts, no dust), `Flame`, `Halos` (one-draw additive points: market lantern + string-light haze), street sunset shafts. No postprocessing GodRays (shafts are geometry, cheaper and work on the low tier).

## Coins
Mound coins: metal 0.92 / rough 0.3, env reflection (envMapIntensity 3.2 + faint emissive so shadowed gold never goes dark), embossed crown on every coin face (gen_env `coin_disc`), `Sparkles` glints. `CoinRain` (CourtScene): gold up -> one coin per 5 gold (max 20) falls from the ceiling every 0.11 s with tumble, 2 bounces, "coinIn" clink, lands on the mound's ellipsoid heightfield + 0.2 m along the surface normal (clear of the baked coin layer), fades after ~1.1 s; gold down -> up to 10 coins lift off and fade. Crown coin face textures are canvas-made (map + bumpMap).
## Z-fight audit
Rug / carpet lifted + polygonOffset, runner/trim boxes in the throne GLB offset >= 3 mm, camera near 0.5 / far 1800 (checked 2x close-ups of rug, steps, floor, mound: clean). Shots: `r5_court_final.png`, `r5_closeups.png`, `r5_rain_sheet.png`, `r5_street_after.png`, `r5_market.png`, `r4_title_after.png`.

---
# Round 5
- COINS: flat-shaded thin discs (~1:8), raised ring rim, embossed crown, recessed face; mound = smooth gold dome with 34/72/135 overlapping tilted coins facing the camera + 2-3 floor stacks, flat spilled coins, a few leaning on edge. Metal 0.92 / rough 0.36, envMapIntensity 1.9, faint emissive (no blown-out orange). Falling coins are the same disc geometry and land at rest on the mound heightfield.
- WINDOW VIEW: Kingdom moved far back and small (village z -44..-90, houses/trees scale 0.2-0.5, castle z -112 x0.55, low rolling hills, shared 3 peaks at x 36/80/125 = one per window; title camera looks at the same peaks). Windows moved to x -0.4 / 6.2 / 12.8; visitor stands at 2.9 between window 1 and 2.
- LIGHT: court key light is now the sun BEHIND the windows (Lighting `sun` override, pos [-9,11,-21.6], warm) so the brick wall casts real window-shaped light on the floor/rug; cool unshadowed fill from front-left; light shafts follow the same direction (0.27,-0.42,0.87) with dust; floor is warm tile with a depth gradient (darker toward camera). Contact shadows from the shadow map + N8AO.
- DAIS: moulded plinth / mid band / cornice cap + carved panels on a stepped dais with plum+gold runner. Owl perch moved onto the dais top beside the throne (COURT.owl = [-6.35, 1.7, 0.7], base y = 1.7): it no longer blocks stairs or windows.
- BUG FIXED (affects street + market since r3): the court camera pins its focus with `setViewOffset` on the shared camera; Street/Market never cleared it, so everything was shifted ~330 px sideways. Both now call `clearViewOffset()` on mount.
- CONVERSATION CAMERA (StreetScene): ~1.5x further back (2.45 m landscape / 2.7 phone or short / 3.2 portrait, x1.45 for the owl), NPC centred, camera ~0.4 m below the face so the look is slightly upward; uses getDevice(). Shot: `r6_convo_owl.png`.
- PAINTERLY PASS: triplanar detail strength 0.7 -> 0.4, strokes bigger (scale 0.14-0.2 for brick/stone/auto, 0.07 ground); bricks are chunky bevelled boxes with baked top-light / dark underside; court wall emissive keeps it a warm tan. Swatches were NOT regenerated.
- Honest list of what still looks off: window-shaped floor patches are soft/subtle (clearest from window 2 on the rug; window 1's patch is faint); court_wall is 28k tris / 4.3 MB; peaks still read as grey-blue facets with a stone texture; floor tiles are still a canvas texture (not painted strokes); wall is still darker/browner than the reference's light tan; the Codex swatches remain somewhat photographic (only turned down).
- Shots: r6_court_final.png, r6_cmp_wall/steps/floor.png (before = r5, after = r6), r6_coins_close.png, r6_windows_rays.png, r6_dev_667x375.png, r6_dev_2560x1440.png.

---
# Round 6
- OWL: floor perch (taller, scale y 1.4) at COURT.owl [-3.2,0,1.2], right of the stair foot in front of the plain wall between stairs and window 1; head at ruler-head height. `useAnchors().owl = [x%, y%]` (head, world y 4.0) is re-projected on every reframe next to `ruler`; SAFE box widened so the owl is always on screen.
- RULER: `throne` split into `throne_dais` + `throne_chair`; the chair group is turned 0.6 rad toward the camera, near arm lowered/thinned, ruler 1.12x bigger and turned 3/4: full face, crown, torso read.
- PAINTERLY: Codex swatches regenerated as broad strokes on a flat field (+ 1.2 px blur, seamless roll-blend; contact sheet `r7_swatches.png`). Court wall = simple UV-mapped slab (`court_wall`, 18 KB) with a hand-painted canvas brick sheet (chunky rounded bricks, painted mortar, top-edge highlights, lighter warm tan) + `court_trim` (stone frames, dado, beams, 415 KB) -> total 0.43 MB / 3k tris (was 4.3 MB / 28k). Floor = painted big tiles canvas (gradients, edge highlights, uneven grout). Title / window peaks: flat per-face colours (white lit snow, blue-violet shadow planes, haze), MeshBasic, no texture.
- GOD RAYS: each window also projects an additive window-shaped soft patch onto the floor (`FloorPatch`) along the sun direction, so window 1's patch reads like window 2's.
- FLOOR: plane now 260 x 160 m reaching far forward/outward, shade plane extended; checked 800x600, 1024x768, 667x375, 1280x800, 2560x1440, 2560x1080: no bare band at any aspect (`r7_devices_sheet.png`).
- Honest critique vs ref2.png: wall/floor are painted and light now but the chair/dais still look more "game-ish" than the reference's smooth gold; floor patches are soft/pink-orange; the stairs' stone still takes the (new) stone swatch via "auto" classification and can look slightly mottled; the coin mound is denser/more yellow than the reference's dome with sparse coins; peaks are plain pale blue-violet (cleaner than before but a little flat).
