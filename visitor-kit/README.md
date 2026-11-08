# Gummy visitor kit

Character-source handoff for the Royal Concerns gummy branch. This folder includes
the editable character Blender library, exported GLB, textures, manifest, and
standalone React demo. The game's runtime copy is
`../public/models/gummy-visitors.glb`, with integration code in
`../src/characters/gummy/`. The exported GLB matches the runtime copy byte for byte.
Only the character library Blender source is included in this handoff.

A modular court-visitor library for Three.js and React Three Fiber. Your original court and character files are unchanged.

## Open the assets

- `gummy_visitor_library.blend`: editable library and a six-character example lineup. Blender 5.2 or newer. The LIBRARY collection is hidden for the preview; unhide its objects to edit parts. PREVIEW and STUDIO are examples, not part of the exported GLB.
- `gummy_visitors.glb`: 2 body meshes, 2 curved eye meshes, 30 body-fitted cosmetic meshes, body roots and named anchors. Textures are embedded.
- `manifest.json`: parts, sizes, colors, measured dimensions, per-body attachment positions, variant names, and eye-atlas rectangles.
- `textures/`: editable PNGs. Eye artwork is in `eyes_styles_blink.png`; the other two textures provide shared cosmetic color and metallic/roughness values.

The GLB is a parts library. Loading its whole scene directly displays overlapping parts. Use the provided assembler to display one chosen combination.

## Included choices

Bodies: tall and chubby. Uniform sizes: small 0.85, medium 1.0, large 1.15.
Colors: red, blue, mint, lavender, orange, yellow.
Eyes: oval, round, relaxed, cheerful, stern. Every style includes open, half-closed and closed frames.
Head slot: none, crown, cap, beret, wizard hat, hair tuft.
Eyewear: none, round glasses, square glasses, monocle.
Face details: none, smile, moustache, freckles.
Clothing: none, collar, short cape, apron, belt.

Only one item occupies each slot. Hats and hair share the head slot. Crowns are excluded from ordinary random visitors, but remain selectable for rulers and special visitors. All included parts have fitted variants for both bodies.

## Start the interactive demo

Use Node.js 22.12+ (Node 24 was used for verification). In this folder:

```sh
npm install
npm run dev
```

Or use `pnpm install` and `pnpm dev`; the included lockfile records the verified package versions. The demo has Shuffle and eye-frame controls and rearranges the lineup on narrow screens.

```sh
npm run build
npm test
```

`validation.json` records the browser validation. `react/validate.ts` exports an additional GLB validation routine used from the local demo server.

## Add to an existing React Three Fiber project

Copy the `react/appearance.ts`, `react/assembly.ts`, and `react/GummyCharacter.tsx` files into a folder in your source tree. Put `manifest.json` immediately above that folder, or adjust the import in appearance.ts. Copy `gummy_visitors.glb` into your public assets. The GLB embeds its textures, so external PNG requests are not required.

Use your existing Three.js, React, and R3F dependencies. The standalone demo was verified with Three.js 0.180.0, R3F 9.8.2, React 19.3.1, TypeScript 5.9.3, and Vite 7.3.7.

```tsx
import { Suspense, useMemo } from 'react';
import { generateCharacter } from './gummy/react/appearance';
import { GummyCharacter } from './gummy/react/GummyCharacter';

function Visitor({ visitorId }: { visitorId: string }) {
  const appearance = useMemo(() => generateCharacter(visitorId), [visitorId]);
  return (
    <Suspense fallback={null}>
      <GummyCharacter
        appearance={appearance}
        assetUrl="/gummy_visitors.glb"
        blinkFrame={0}
        position={[0, 0, 0]}
      />
    </Suspense>
  );
}
```

Place this inside your existing Canvas. Save the returned appearance with the visitor record to keep their exact look if the library changes later. Reusing the same seed and kit version also reproduces the appearance. String and numeric seeds are deliberately distinct. Appearance is independent of NPC role, behavior, and financial circumstances.

For a ruler, use `generateCharacter(id, { allowCrown: true })`, or explicitly set `head: 'crown'` on an appearance. The override makes the crown eligible; it does not force it to be chosen.

## Height and fitting

GLB/manifest coordinates use +Y up and +Z forward. Feet are at local Y=0. Medium chubby body height is 2.0 units; medium tall body height is 2.4 units, excluding hats. Blender uses Z up; the exporter converts coordinates.

Every assembled root contains the body, eyes, and attachment nodes `HeadTop`, `Face`, `Eyewear`, `Neck`, and `Waist`. Body-specific anchors are measured from the normalized body geometry. The root's uniform size multiplier scales the body, anchor positions, and accessories together. Do not independently randomize accessory height or scale.

Each cosmetic is modeled in its attachment's local space, with a separate tall/chubby variant. Its manifest fitting transform is relative to that anchor. Eyes and face details share Face; glasses use Eyewear. Clothing currently uses Waist; Neck is available for future neck accessories.

The original scene's bodies were roughly twice these normalized heights. If matching the existing court's scale, use an outer uniform scale around 2.06 and position the root at the floor/platform height. This scales all attachments consistently. Arbitrary width changes and skeletal deformation are not supported by this first kit.

In plain Three.js, call `loadVisitorLibrary(url)`, then `assembleCharacter(gltf.scene, appearance)`, and add the returned root to your scene. Call the returned `dispose()` when removing that visitor; it releases private eye resources and preserves shared geometry and materials.

## Reminder: animate blinking later

The artwork and `blinkFrame` control are ready. Automatic timing has not been added.

Frame 0 is open, 1 is half-closed, and 2 is closed. Later drive a short 0 → 1 → 2 → 1 → 0 sequence at discrete intervals. Use independent timing per visitor. The runtime supports changing the frame without rebuilding meshes.

The atlas is 1024 x 512 pixels, with five columns of eye styles and three rows of frames in padded 128-pixel cells. Manifest rectangles use glTF UV coordinates. GLB eye UVs already occupy oval/open; assembly.ts shifts a private texture transform to the requested cell. It does not modify shared geometry or other visitors' eye states.

## Performance and verification

The maximum modeled combination is 2,442 triangles and six mesh/material draws. A fully dressed GLB example measured 2,434 triangles and six draws; simpler random visitors use less. These counts exclude the room, lights, shadow passes, and post-processing. They are asset budgets, not measured phone frame rates.

Geometry and cosmetic textures are reused across visitors. Body materials are cached per color. Each visitor owns its eye material and texture-transform state while sharing the underlying image. Eyes use alpha cutout, not sorted transparent blending. The GLB contains no lights, cameras, backup meshes, court geometry, or skeletal animation.

Verified: TypeScript check, production build, 100 deterministic random appearances, crown exclusion/override, required-asset errors, optional-part fallback, GLB loading with embedded textures, 90 attachment combinations, all 15 eye states, ground origins, scaled heights, isolated color/eye state, and desktop/mobile-sized browser controls. Front and side fit sheets were rendered and reviewed. Mobile browser preview used a 390 x 844 viewport, not a physical phone performance test.

`fit_*` sheets show columns in this order: crown, cap, beret, wizard hat, tuft, round glasses, square glasses, monocle, smile, moustache, freckles, collar, cape, apron, belt. Rows from top to bottom: small, medium, large. The eye sheet shows columns oval, round, relaxed, cheerful, stern; rows open, half-closed, closed.

## References for integration

- [React Three Fiber loader caching and hooks](https://r3f.docs.pmnd.rs/api/hooks)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html)
- [Three.js texture transforms](https://threejs.org/docs/pages/Texture.html)
