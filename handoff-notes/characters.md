# Characters (puppet rigs) - notes

## Generator
`"E:\Steam\steamapps\common\Blender\blender.exe" -b --factory-startup -P tools/blender/gen_characters.py -- public/models/chars [ids,comma] [--preview PNG | --portraits public/ui/chars]`
- No ids: exports all 24 characters + cane.glb, wheelchair.glb, wheelchair-power.glb + palette.png (~6k tris, ~145 KB each, uncompressed GLB; meshopt not applied).
- Specs live in `CAST` (skin, hair style/colour, top/bottom/shoes, feats, hat, glasses, beard, aid, kind human/ghost/robot). Colours come from the fixed `PAL` swatch atlas: all characters share one material/texture.
- `--portraits` renders transparent PNGs to public/ui/chars/<id>.png (Title picker uses `/ui/chars/ruler-X.png`).

## Part contract
torso (root, pivot at waist; userData crownY/float/noLegs) > head (hair, hat, glasses, eye_l, eye_r, mouth), arm_l/arm_r > hand_l/hand_r, optional cape; leg_l/leg_r top-level. Faces +Z, natural height ~0.9, Character scales by 0.44.
Aids: wheelchair(-power) has chair + wheel_l/wheel_r (spun on X); cane.

## Code
`Character` in src/scenes/common.tsx: same props. `resolveCharUrl` remaps legacy `/kenney/mini-characters/<rulerModel>.glb` (scenes still build that) to /models/chars/ruler-*.glb. Anims: idle, walk, sit, emote-yes/no, interact-right/left (settles into talk pose), pick-up, jump, die, wheelchair-sit/move-forward/look-left(yes nod)/look-right(no shake). Blink, breathing, reduce-motion (amplitude 0.45). Wheelchair users auto-map idle/walk to chair poses. Crown prop attaches to head using crownY.
Ruler ids are now ruler-a..f (RULER_MODELS in characters.ts; Title.tsx needs no edit). Old saves with character-* ids map to rulers.
Dev viewer: `/chargallery.html?anim=walk&ids=tilly,maya&cols=4&rot=0.8&zoom=1&crown=1`.

## Cast
rulers a-f (varied skin/hair, red vest / blue tunic / purple dress / green fur-collar / orange-teal / pink); tilly, marlo, fenwick, hazel, benny, rosa(cane), clank, wren, boo(ghost, floats), maya(power wheelchair), cogs(robot), bill, pip, gus, zib(alien), brick, prof, kid.

## Known issues / not done
- Owl NOT upgraded (still old owl.glb).
- SIT_Y (0.2) tuned by eye on the throne; legs are rigid so knees do not bend.
- Wheelchair/market cashier/yes-no reactions only checked via gallery and court idle; not every in-game visitor verified.
- Playwright browser is shared between agents; use own contexts.

## Round 2
- Owl: rebuilt (`--owl public/models/owl.glb`). Parts body, head (eye_l, eye_r, glasses, hat), wing_l, wing_r. `Owl` now blinks (eye scale.y) and breathes; uses the shared palette material.
- Food: `--food public/models/food` exports bread, milk, carrots, cabbage, apples, eggs, cheese, medicine, candles, fish, cookie, tea, cake, sundae, donuts, candy, wine (15-60 KB each). Traps use a glossy + emissive material variant. NOTE `Model` in common.tsx clamps roughness to >=0.55 (prep), so the gloss is mostly emissive glow; relax `prep` for /models/food if more shine is wanted. economy.ts `model:` fields updated; the old per-item `scale` boosts were removed (new props are already ~Kenney size). `--foodpreview PNG` / `--owlpreview PNG` render lineups.
- Rulers from behind: shorter hair (ruler-a is now a lighter auburn bob), gold royal crest ("emblem" feat) on every ruler's back, lighter legs. The street camera/HUD still hides most of the body.
- preloadCore: removed throne/backdrop, added owl + 6 rulers.
- Palette gained 12 swatches at the end (indices unchanged for old models).

## Round 3 (detail + painterly)
- Geometry: ~8-11k tris per character. Sculpted hair locks (hair_locks, per-style counts), ears with inner shade, nose, brows, boots (shaft/foot/toe cap/sole/cuff), hand thumb + finger grooves, sleeve folds, belts with framed buckles, collar wings, neck, placket, cape clasps with gems, hat rims/buckles/rivets/gems (hat_extras). Crown rebuilt (`--crown public/models/crown.glb`): band, rims, 5 pearl points, bezelled gems, velvet cap. Owl: layered chest scallops, 3 layers of wing feathers, robe trim/collar/clasp, face-disc rings, ear tufts, beveled hat.
- Palette now has darker/lighter variants of every colour (`d_x`, `l_x`, `hl_/hd_` for hair) baked as painted value steps; 14 rows. Regenerate everything together (chars, owl, food, crown) so atlases match.
- Painterly: `prepChar` in common.tsx maps part names to painterly details (head/hands -> skin, hair, torso/arms/legs/cape/hats -> cloth, glasses/crown -> gold, knight + robot -> metal, owl body/wings -> hair, chair -> metal, cane -> wood) with one cached material per detail sharing the palette atlas. Food gets a soft "skin" finish; traps get roughness 0.22 + emissive. Hooked into `Model` via the /models/food/ prefix.
- Mouths/eyes/buttons are real offset geometry (eyes protrude ~0.015), no coplanar decals found at 3x close-up.
- Dev viewer: /chargallery.html (see above).

## Round 4
- Owl redesigned (friendly): big cream face disc, large eyes with glasses, caramel/tan breast oval with soft low-contrast scallops, rounded wing paddles with scalloped ends, rounded feet, rounded robe hem. `Owl` now faces the camera: the scene's `rotationY` is honoured only within ~0.4 rad of the direction to the camera (3/4 view in court, faces the player in street/convo). Change the clamp in `Owl` (useFrame) if a scene needs a different yaw.
- Legs are now thigh + shin (`leg_l` > `shin_l`, `leg_r` > `shin_r`, knee pivot y=0.145). `sit` bends knees 90 deg (thigh -1.5, shin +1.5); walk has knee flex; squat/jump use shins. Robot also split; ghost has none. `SIT_Y` = -0.19 (hips on the cushion of the new throne).
- Wheelchair: new `cushion` part (navy / dark teal) gets the cloth detail; frame and wheels stay metal.
- Helmet visor rebuilt smooth (rim torus, nose guard, ridge, rivets).
- Convo view: the scene's camera is almost inside the owl, so the face is mostly hidden behind the UI; pulling the camera back ~1.5x would show the face disc.

## Round 5
- "Pale square on the face" = the hair cap's front clip left a rectangular opening (straight vertical/horizontal edges) so bare skin showed as a card-like patch from the side/3-4. The opening is now an elliptical hairline and the old `ears` clip (rectangular temple cut) is gone. Checked all 6 rulers + 17 cast front, 3/4 and side (`.shots/chars/r5_sheet_*.png`).
- Owl breast: 3 staggered rows of larger shingled U-feather scallops in the brown family (light top to dark bottom) over a lighter oval.
- Not verified: the wheelchair visitor (Maya) inside the court itself (could not force her visit; verified in gallery only). Afro (ruler-c) hairline is still a bit blocky at the cheek; Brick's beard is heavy; Boo reads very pale.

## Round 6
- Owl breast is now a smooth lighter oval (no raised blocks). The feather read is painted: the palette atlas has a 64x64 painted tile (low-contrast chevrons, same brown family) at the bottom-left; faces use per-vertex UVs into it (`sq(..., uvfn=...)`, `tile_uv`). Small soft tuft of 5 feather points where breast meets robe. Atlas height changed (swatches shifted), so all assets must be regenerated together (chars, owl, food, crown, portraits) - done.
- Dev only: `?forceVisitor=maya` (or rosa, etc.) makes every non-ruler `Character` use that cast member (wheelchair/cane included). Gated by `import.meta.env.DEV` in common.tsx.
- Hairline: cone-shaped opening with a wavy threshold plus sideburn locks (a planar cut always read as a straight card edge from the side).
