# Integration handoff

## Current state

The user approved the latest court after fixing a visible slit under the gold mound. Canonical Blender source: `assets/blender/royal-court.blend`. Canonical runtime export: `public/assets/royal-court.glb`. Earlier Blender iterations must not replace these.

The five steps lead up to the throne: rise 1.168 scene units, tread 1.752, ratio 1:1.5. Staircase width is 5.2. A camera-facing plum/gold runner wraps each rise and tread. Limestone texture is baked and packed.

84 coins cover the mound. 44 coins from the hidden side were redistributed to the camera-facing side. Another 60 loose coins were rigid-body settled against the mound, floor, and stairs. Physics was baked into static transforms; no runtime physics needed. The mound's curved underside was flattened into the floor to close the visible gap.

## Intro and camera

Root application is a standalone demo, not the complete game. `RoyalConcernsIntro` owns its Canvas. `onArrive` is the handoff point for enabling gameplay. Replay is a demo option. Keep the scene mounted if reusing it for gameplay.

Title: Royal Concerns, Perandory, ivory, no cartoon outlines. Start uses a diffuse cloud glow. The startup camera fits the three tallest snowy summits, adjusting for aspect ratio. Landing retains a direct-side perspective, throne left and visitor right, with device-aware framing. Clouds occupy the lower area and blend toward the middle. Normal transition is 2000 ms with quintic easing applied to camera and cloud progress; reduced-motion transition is 180 ms. Arrival: Hilltop Courtroom / Day 1, 650 ms fade-in, later fade-out.

Lighting approximates Blender with AgX, an environment, area lights and a directional sun; it is not a Cycles match. Static shadow-map updates are disabled after the initial update for this static intro. Re-enable updates or request shadow updates when moving actors are introduced.

## Modular visitor kit

Tall/chubby bodies, sizes 0.85/1/1.15, body colors, eye styles with open/half/closed frames, fitted hats, glasses, face details, clothing. Crown reserved for ruler by default. Named anchors and per-body fitting data are in the manifest. Seeded random appearance generation and per-instance mutable materials are supplied in visitor-kit/react. Automatic blinking remains a later step: remember to connect eye-frame animation. Do not load every library part at once; use its assembler.

## Verification and limits

TypeScript and production builds passed before delivery. Latest browser preview had no console/page errors and 75 draw groups after instancing (569 source mesh primitives; 504 batched objects). Prior responsive checks covered desktop, portrait/landscape phones, small phone and tablet; keyboard, repeat clicks, Escape, reduced motion, enlarged text and load retry. Latest asset-only correction was visually checked from the gameplay camera. Software WebGL screenshots recorded delayed frames (roughly 2.66 s for the configured 2 s animation); physical phone performance is unmeasured.

No assistant co-author trailer or assistant Git author was added. User requested direct work on main.

Lighting correction: runtime masonry drops the exported bump/normal map, rebuilds front-wall planar UVs, and aligns facade normals so arch triangulation does not create bright/dark wedges. Wall shadow receiving is disabled; floor/character lighting remains. This uses cloned geometry/materials and preserves the source Blender asset. Visually checked from the gameplay camera with no browser errors; draw count remains 75.
