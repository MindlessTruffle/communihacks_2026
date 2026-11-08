# Royal Concerns — playable intro

A standalone React Three Fiber intro using the latest court scene. The original Blender file is preserved.

## Run

Install Node.js 22 or later, open a terminal in this folder, then run:

```sh
npm install
npm run dev
```

Open the local address printed in the terminal. For a production build, run `npm run build`, then `npm run preview`. Serve the build over HTTP; opening index.html directly will not load the 3D assets.

## Included behavior

- Royal Concerns uses Perandory Semi-Condensed, without outlines, over a close-up of snowy mountain peaks.
- Soft image-based cloud banks rise toward the middle of the screen. Start sits in a diffuse, unoutlined cloud glow.
- Start moves the camera down to the court over a 2,000 ms animation clock. Clouds sweep upward with directional blur.
- On arrival, Hilltop Courtroom / Day 1 fades in over 650 ms, then fades away after the opening beat.
- The landing camera adjusts to the viewport while retaining the ruler on the left and the visitor on the right.
- Keyboard activation, visible focus, Escape to skip, and a reduced-motion crossfade are included.
- The demo includes Replay intro. Production usage hides it by default.

## Add to the game

Copy src/RoyalConcernsIntro.tsx, src/scene.ts, src/styles.css, public/assets, and public/fonts into your app. Install the dependencies from package.json. Render the component at the game entry point:

```tsx
import { RoyalConcernsIntro } from './RoyalConcernsIntro';

<RoyalConcernsIntro
  sceneUrl="/assets/royal-court.glb"
  onArrive={() => { /* enable the first day's gameplay here */ }}
/>
```

The component owns its Canvas. Keep it mounted if you want to retain this scene after arrival; connect gameplay inside that scene when integrating. The included court has the existing static characters. Gameplay and automatic eye blinking remain separate steps.

## Verification

validation.json records successful Chrome checks at desktop, portrait phone, landscape phone, small phone, and tablet dimensions. Tests covered keyboard focus/activation, repeated clicks, Escape, reduced motion, enlarged text, and asset failure/retry. The exported scene batches 569 source mesh primitives into 75 draw groups. Tests used software WebGL; physical-phone performance has not been measured. A slow device can present the final animation frame after the 2,000 ms clock completes.

The GLB embeds its textures. The cloud foreground is an original generated image, compressed to a 229 KB WebP. Perandory is included for this personal preview; its download source labels it personal-use only. Confirm the appropriate web/app license with Kulture Type before public distribution: https://font.download/font/perandory .

Lighting revision: Blender sun direction/color and four area-light positions are reconstructed with a directional sun and rectangular lights. One shadow map (1024 on narrow screens, 2048 on desktop), shared instanced geometry, and a prefiltered environment keep costs bounded. This approximates Blender lighting; it does not reproduce Cycles path tracing or gummy transmission exactly.
