# Royal Concerns — Handoff Checklist

> Living document. Updated as work happens. Any agent/dev can pick up from here.
> Design source of truth: `../ROYAL_CONCERNS_PLAN.md` (E:\RoyalConcerns\ROYAL_CONCERNS_PLAN.md).
> Client: Community Living KW. Audience: adults with developmental disabilities. Read §2 of the plan (accessibility rules) before changing UI.

## 0. Quick start

```bash
cd E:/RoyalConcerns/game
pnpm install                # pnpm store is on E: (.npmrc) because C: was full
cp .env.example .env.local  # add ELEVENLABS_API_KEY (server-side only)
pnpm dev                    # http://localhost:5199  (also on LAN for phone/tablet testing)
```

| Command | What it does |
|---|---|
| `pnpm dev` | Vite dev server + `/api` (token minting) on :5199, LAN-exposed |
| `pnpm build && pnpm serve` | Production build + Node server (dist + /api) on :8080 |
| `pnpm sim` | Economy balance bots (always-yes / always-no / sensible, 300 reigns each) |
| `pnpm assets:kenney` | Re-copy Kenney packs from `_kenney_raw/` into `public/` |
| `pnpm voices:bake` | Generate ElevenLabs TTS mp3s for every authored line → `public/audio/voices/` |
| `pnpm agents:sync` | Create/update ElevenLabs conversational agents → `server/agents.json` |
| `pnpm music:gen` | Generate music loops with ElevenLabs Music → `public/audio/music/` |
| Blender | `tools/blender/*.py` generators → `public/models/*.glb` (see §5) |

## 1. Environment facts / gotchas

- [x] **Project lives on `E:\RoyalConcerns\game`** (moved from OneDrive Documents: C: drive had 0 bytes free; OneDrive also hates node_modules).
- [x] `.npmrc` sets `store-dir=E:/.pnpm-store`.
- [x] Node 24 runs `.ts` files directly (type stripping) → content/sim imports use explicit `.ts` extensions; `tsconfig` has `allowImportingTsExtensions`.
- [x] ElevenLabs key lives ONLY in `.env.local` (gitignored). Browser gets short-lived tokens from `/api/convai-token`. **The key was pasted in a chat — rotate it in the ElevenLabs dashboard before any public deploy, then update `.env.local`.**
- [x] Blender 5.2 at `E:\Steam\steamapps\common\Blender\blender.exe`. The live Blender MCP session had the user's own file (Blackwater_Rods) open — do NOT build in it; use background Blender (`blender -b --factory-startup -P script.py`) or the MCP `execute_blender_code_for_cli` tool.
- [x] Kenney packs (CC0) downloaded via kenney.nl's `download-link/<hex("assets/<slug>")>` endpoint into `_kenney_raw/` (zips gitignored).
- [ ] git repo initialised, **nothing committed yet** (user hasn't asked for commits).

## 2. Architecture map

```
src/game/types.ts            all data types
src/game/content/            cards.ts (visitors), characters.ts (cast + voices), economy.ts (TUNING, market, unlocks, rates), advisor.ts
src/game/sim/sim.ts          PURE rules: newRun/startDay/decide/applyMarket/endDay/treasury/reignReport. No DOM.
src/game/store.ts            zustand store: wraps sim, phase machine, save/load (localStorage)
src/audio/                   sfx/music (howler), voice playback (baked mp3 → fallback speechSynthesis)
src/convai/                  ElevenLabs agent session wrapper + ConversationScreen (3 buttons: mic / no-mic / end)
src/scenes/                  r3f scenes: Court, Street, Market, shared Character + Kingdom diorama
src/ui/                      DOM overlay UI (parchment panels), admin panel, settings, title, summary, budget scroll, treasury
src/platform/                fullscreen, orientation, haptics, wake lock, input helpers
server/api.mjs               /api/health, /api/convai-token (used by vite plugin + server/serve.mjs)
tools/                       copy-kenney, bake-voices, sync-agents, gen-music, economy-sim, blender/
```

## 3. Feature checklist

Legend: [x] done · [~] partial · [ ] not started

### Core sim
- [x] Types, cast (19 characters w/ ElevenLabs voice IDs), ~70 visitor cards with lessons + real-life links
- [x] Economy: taxes, weekly upkeep (rent), torch bill, recurring subscriptions, growth by happiness, loss rules
- [x] Unlocks schedule (day 5 vault … day 40 pension) + treasury actions + RDSP matching
- [x] Reign report (good/bad concepts, tips) → text for final advisor chat
- [x] Balance bots: always-yes dies ~day 8 (gold), always-no ~day 10 (happiness), sensible survives 40 days 96%

### Phases / screens
- [x] Title screen + ruler setup (King/Queen/Ruler, 6 models, name optional)
- [x] Morning (income lines, unlock intro, Treasury panel)
- [x] Royal Court (side view, visitor walk-in, ✓/✗ bubble, speech panel, stats, advisor tips)
- [x] Day Summary card
- [x] Evening Street (spline path, over-shoulder cam, advisor chat first, NPC chats, minigame doors)
- [x] Conversation screen (first-person, Mic / No mic / Done, kindness sparkles, scripted fallback; live chat drops fall back to scripted). Layout keeps the NPC's face clear in the centre third.
- [x] Minigames: Coin Counter, Price Compare, Bakery order (Next button instead of timers; gold now saved)
- [x] Budget Scroll
- [x] Night Market (first-person WALKABLE, basket viewmodel, item pick, traps) — `src/ui/MarketUI.tsx`: list pin, item card (put in / put back / leave, over-budget + off-list warnings, advisor nudge), touch joystick (bottom-right), pay prompt near cashier (Enter/Space too)
- [x] Checkout + stars (animated stars, 3 reasons, missing needs, "Go to sleep" → next morning)
- [x] Reign end: instant final advisor chat (good/bad/how to improve) → reign summary → new reign
- [x] Title: cloud-bank sky + 3 snowy peaks, Bodoni Moda ivory logo, single START → 2 s quintic camera descent into the court (reduced motion = crossfade, Esc skips); Continue / Options when a save exists; New Reign asks "Are you sure?"
- [x] Admin panel ("/" ×4, or 4 taps bottom-left corner on touch): force loss, gold, day skip, phase jump, unlock all

### Platform / native feel
- [x] PWA manifest + service worker (fixed: icons existed nowhere, voice/music index cached forever), fullscreen, landscape
- [x] Rotate prompt for phones in portrait
- [x] Safe-area insets, no zoom/select/callout, haptics, wake lock
- [x] Device profile `getDevice()` in `src/platform/device.ts` → `html[data-form|data-input|data-size|data-dpr|data-os|data-orientation]`, live-updating (rc-device event). Form from SCREEN size, input from actual use (touch-screen laptop = desktop + mouse until touched).
- [~] Input: touch, mouse, keyboard (Y/N, arrows, space), gamepad (focus nav + glyph prompts; gamepad not tested on real hardware)
- [x] Options screen (`src/ui/Options.tsx`): Gameplay / Audio / Display / Access / Controls tabs, pause menu on Esc / pad Start. Read-aloud, subtitles, 4 text sizes, high contrast, reduce motion, dyslexia font (OpenDyslexic, lazy), colour-blind mode (shape cues), hold vs tap walk, game speed, graphics Auto/High/Low, volumes, reset.
- [x] UI size brackets: fixed px per `data-size` s/m/l/xl (no viewport-unit stretching); day theme is smaller. Overlap checker `node tools/overlap-check.mjs` = zero overlaps at 667/1024/1280/1920/2560 (see known issue on bracket s).

### Audio / voice
- [x] SFX map (Kenney packs, `src/audio/audio.ts`)
- [x] Music loops (6 in `public/audio/music/`)
- [~] Baked voices (465 in `public/audio/voices/`; newest advisor lines not baked yet)
- [~] Conversational agents (`pnpm agents:sync`; live chat worked once in testing; state of all 6 agents not re-verified)

### Art
- [x] Characters: 6 rulers + 17 cast mid-poly rigid-part puppets (`tools/blender/gen_characters.py` → `public/models/chars/`), code-animated in `Character` (common.tsx); knee joints; wheelchair / cane users; owl rebuilt; crown rebuilt. Details: `handoff-notes/characters.md`.
- [x] Environment kit: ~50 mid-poly GLBs (`tools/blender/gen_env.py` → `public/models/env/`), instanced via `src/scenes/env.tsx`. Court rebuilt to scale (reference: `E:\RoyalConcerns\ref-communihacks`, reference only): dais + 3/4 throne, flat-disc coin mound + coins that fall one by one, 3 arched windows onto distant peaks + growing Kingdom, sconce flames, sun shafts. Camera frames safe boxes per device (`frameCourt`). Details: `handoff-notes/environment.md`.
- [x] Painterly finish: `src/scenes/painterly.ts` (`painterlyMaterial`, `applyPainterly`) — triplanar hand-painted swatches (`public/textures/painterly/`), warm-top/cool-bottom gradient, edge + cavity, rim. Used by env, characters, food.
- [x] Lighting (`src/scenes/look.tsx`): presets day/dusk/sunset/night, Khronos Neutral tone mapping, post stack on high tier (N8AO full-res, bloom, grade, vignette, SMAA), wind grass, shadow frustum follows player/camera.
- [x] Food props: 17 mid-poly GLBs in `public/models/food/` (traps glossy + glowing).
- [x] UI art: 72 Codex icons (`public/ui/icons/`, @1x/@2x/@3x), hand-inked SVG day frames (`tools/gen_frames_svg.py` → `public/ui/frames/svg/`, `src/ui-art.css`), Kenney brown night theme, theme switch by phase (`html[data-theme]`), input glyph prompts. Details: `handoff-notes/ui-art.md`.

### Quality tiers
- `QUALITY` in `src/scenes/look.tsx`, resolved once at load: `?q=high|low` → `localStorage["rc-quality"]` (Options → Graphics, reloads) → `getDevice().recommendedQuality` (phone, or tablet with ≤6 cores → low).
- Low = no post stack, 1/3 grass, 1024 shadows, static god rays.
- Perf on the dev RTX 4060 Ti, all 60 fps: court ~184 draws / 275k tris; street ~372 / 641k; market ~257 / 279k; title 87 / 74k. Real phone not measured.

### Dev-only helpers (stripped from prod by `import.meta.env.DEV`)
- `?gallery=1` or `?gallery=<prefix>`: env asset viewer. `/chargallery.html?anim=walk&ids=...`: character viewer.
- `?forceVisitor=maya`: every non-ruler character becomes that cast member (screenshots only). `?form=phone`: device override.

## 4. Known issues / TODO next
- N8AO `halfRes` crashes on three r172+ (uses removed `WebGLMultipleRenderTargets`) → must stay full-res. If an error `setupRenderTarget … reading 'length'` appears, check that first; it also cascades into drei `<Environment>` CubeCamera errors.
- three r187 removed `PCFSoftShadowMap` (falls back to PCF) — don't set it.
- Court at bracket s (667x375, 800x600): the yes/no bubble overlaps part of the ruler (no free space). Fix idea: icon-only bubble or dedicated s placement.
- Speech panel does not avoid the owl/visitor (only the decision bubble reads the `owl` anchor).
- Court art still off vs reference: the throne and dais look more "game-like" than smooth gold, the stair stone is a bit mottled, the window peaks are a little flat, and the left window's light patch is weaker than the right's.
- Characters: ruler-c hairline blocky at cheek, Brick's beard heavy, Boo very pale; slight flat cheek area on rulers from the side.
- Low tier not verified on a real phone/tablet. Gamepad not tested on hardware. Live ElevenLabs chat tested once (Rosa); no Lighthouse run.
- Market basket viewmodel is in world space → can poke into stall geometry when you hug a stall.
- Bake voices for new advisor lines (`marketTrap`, `marketOffList`) with `pnpm voices:bake` (browser TTS until then).
- Fonts: Bodoni Moda + OpenDyslexic are OFL. Do NOT import Perandory from the reference repo (personal-use licence).
- Unused leftovers: `public/models/throne.glb`, `backdrop.glb`, raster `public/ui/frames/*@Nx.png` (fallback art).
- Still not committed to git.

## 5. Asset notes
- Kenney models share one `Textures/colormap.png` per kit; keep the folder layout when copying.
- Mini-characters have 32 animations each (idle, walk, sit, emote-yes, emote-no, wheelchair-*, …).
- Custom models: generated by `tools/blender/*.py`, exported to `public/models/`.

## 6. Session log
- 2026-11-07: Plan written. Project scaffolded on E:. Kenney packs downloaded. Sim + content + balance done.
- 2026-11-07 (late): All scenes/screens written (court, street, market, convo, minigames, menus, treasury).
- 2026-11-08: Market UI + checkout written. Lighting/post/grass pass (look.tsx) on all 3 scenes. Fixed ElevenLabs session typing (tsc clean). Quality tier + touch detection fixed for touch laptops. Market reach 4.2→6.5 m, cashier clip fixed, basket viewmodel shrunk. Browser-verified loop: court → street → budget → market → checkout → sleep → day 2. Alt dev server config `royal-concerns-alt` (port 5201) in Documents/.claude/launch.json.
- 2026-11-08 (later): Four parallel agents (UI art, characters, environment, polish) over several rounds. Results summarised above, with per-area detail in `handoff-notes/{ui-art,characters,environment,polish}.md`. tsc clean; `pnpm sim` and `pnpm build` pass.
