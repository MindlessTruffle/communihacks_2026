# Royal Concerns

A mobile-friendly court scene and opening menu built with React, Three.js, and React Three Fiber.

## Run

Use Node.js 22.12+:

```sh
npm install
npm run dev
```

Use `npm run build` to produce the application, then `npm run preview` to view that build over HTTP.

## Project contents

- `src/`: responsive opening menu, camera framing, instanced scene assembly, cloud transitions.
- `public/assets/royal-court.glb`: latest court with grounded coin pile, camera-facing coins, 60 grounded spill coins, five limestone steps, and plum/gold stair runner.
- `assets/blender/royal-court.blend`: editable source of that exported court, with packed textures.
- `visitor-kit/`: separate modular gummy visitor library, GLB, texture atlas, manifest, seeded assembler, and interactive demo. Run it independently using its README.
- `docs/`: setup, design notes, validation, and integration handoff.

The opening uses Perandory lettering, soft cloud imagery, and a view of three snowy peaks. Start triggers a two-second quintic ease-in/ease-out descent. Arrival displays Hilltop Courtroom / Day 1. Reduced motion uses a short crossfade; Escape skips the descent.

The current scene includes static ruler/visitor figures. Court gameplay and the modular visitor assembler have not yet been connected. See `docs/HANDOFF.md` before integration.

## Asset notices

Perandory Semi-Condensed is included from the personal-use download at https://font.download/font/perandory . Confirm the appropriate web/app and redistribution license with Kulture Type before distributing the game. The cloud image is an original generated asset. Textures embedded in the scene and the visitor atlas are included alongside their editable Blender sources.
