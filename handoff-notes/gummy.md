# Gummy edition

Feature branch: `feat/gummy-customization-market-flow`, based on the local
`royal-concerns-gummy` work and the upstream `royal-concerns-game` build.

See `../CHANGELOG.md` for the development history, including citizen proximity
interaction, departure animations, and the compact movement hint.

On Windows, run `start-gummy.cmd`, then open the Local URL printed by Vite.
It starts at port 5202 and tries the next free port if occupied. Add `/?q=low`
to the URL for lower graphics settings.
Dependencies must already be installed. The launcher uses Node from PATH or the local Codex runtime.

All six rulers, eighteen visitors, and the advisor use the shared 234 KB
`public/models/gummy-visitors.glb` library from the original walkaround prototype.
Character identities, save IDs, scene placement, and game logic are preserved.
Wheelchair and cane props remain visible. The advisor is a purple wizard gummy.
Ruler selection uses matching inline SVG portraits.

Edit `src/characters/gummy/profiles.ts` to change colours and accessories.
`GummyCharacter.tsx` handles movement, reactions, blinking, and mobility aids;
`common.tsx` exports it through the existing Character/Owl interface.
Old character assets remain in the repository for reference but are not loaded.

Setup offers named colour presets, a pointer/keyboard colour wheel, brightness,
and a native custom colour picker. The custom colour is stored on `RunState`
and uses a private body material; old saves use their original palette defaults.
Street travel progressively blends the sky, sun, fill, and fog towards the market
night palette. Backtracking does not rewind the time of day.

Desktop market entry requests pointer lock from the entry-button gesture. Esc
releases the pointer; click the scene or look prompt to resume. Item inspection,
dialogs, checkout, and scene cleanup release it. While locked, food clicks raycast
from the crosshair. Touch keeps drag-to-look. The market movement hint disappears
after the first movement, and the shopkeeper stands in front of the end counter.

Court choices live inside the speech panel, with the price below Yes. Checkout
shows the next three unlock milestones, progress bars, and already-open features
before the player starts the next day.

Validation: TypeScript and production build passed. `tools/check-gummy.mjs`
checks ruler selection, court, street, market, checkout, day two, the full cast,
mobility aids, browser errors, and absence of old character asset requests.
It stubs API calls so the check makes no paid voice requests. Screenshots and
results are written to the ignored `test-results/` directory. Browser validation
used low graphics; no frame-rate improvement is claimed for other graphics modes.

The original walkaround project is in the sibling `royal-concerns` folder.
