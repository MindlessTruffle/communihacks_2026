# Royal Concerns

A fantasy-kingdom game that helps young adults practise real-life money skills:
court decisions, budgeting, shopping, saving, and learning from each run.

## Run the game

On Windows, run `start-gummy.cmd` and open the Local URL printed in the terminal.
It starts at port 5202 and picks the next free port if needed. Add `/?q=low` for
lower graphics settings.

For a standard development setup, use Node 24:

```sh
pnpm install
pnpm dev
```

`pnpm test` runs the learning/notebook tests. `pnpm build` checks TypeScript and
builds the game. `pnpm preview` serves a preview; `pnpm serve` runs the production
server after a build.

Copy `.env.example` to ignored `.env.local` to configure ElevenLabs voices and
Gemini notebook interpretation through OpenRouter. Keep real keys server-side.
Scripted conversations and saved notebook notes work without these services.

## Game and assets

- `src/`: playable court, street, market, customisable characters, and notebook.
- `public/models/gummy-visitors.glb`: shared runtime gummy library.
- `visitor-kit/`: editable character Blender source, textures, and standalone demo.
- `server/`: voice and notebook API endpoints.
- `CHANGES_SINCE_BRANCH_PULL.md`: consolidated feature history.
- `CHANGELOG.md` and `handoff-notes/`: development notes and integration details.

The original intro prototype's files and assets are preserved alongside the game.
Its former README and asset notices are in `docs/legacy-intro-readme.md`.
The current app entry point is `src/main.tsx` to `src/App.tsx`.
