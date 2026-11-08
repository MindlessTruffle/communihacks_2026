# Learning notebook

Open **Misc.** on the side of the game, or **Menu → Misc. · My notebook**.
The home page shows measured improvements. Each run has Did well, Try next,
Practice, and Day log pages. Content uses large plain-language text and supports
read-aloud. Practice questions allow retries without a timer or penalty.

## Data and memory

- Notebook archive: local storage `royal-concerns-notebook-v1`. It is separate from
  the current save and survives a lost run or new run. It stays in this browser;
  clearing site data removes it. A storage failure is shown in the notebook.
- New saves carry a unique `runId`; old saves use their seed as a legacy identifier.
- Court decisions are imported by log index, without duplication. Shopping facts,
  awarded kindness, successful treasury actions, and finished minigames are also
  recorded. Generic star totals are unscored notes, avoiding double-counting.
- Progress uses scored events only, with at least two earlier and two later
  observations. It compares actual success rates, including across runs. It does
  not infer a disability, ability, personality, or improvement from an AI claim.
- Scripted and ElevenLabs conversations retain their last ten text lines in the
  run notebook. API-key patterns and email addresses are redacted. No audio is saved.
- Practice attempts persist independently. A wrong first answer followed by a
  correct answer appears as practice progress without inflating game-choice scores.

## Gemini configuration

Use Node 24 (also used by the existing TypeScript simulation tools). In ignored
`.env.local`, set `OPENROUTER_API_KEY` and
`OPENROUTER_MODEL=google/gemini-3.6-flash`. Restart the dev/production server after
changing keys. Never add a `VITE_` prefix or commit this file.

`POST /api/notebook` forwards only recent game events, authored practice seeds,
and bounded conversation snippets through the server to OpenRouter. The endpoint
enforces input limits, per-IP request limits, a 20-second provider timeout,
inflight deduplication, a bounded cache, JSON schema, short text, and evidence IDs.
Invalid or unavailable responses leave the saved-note fallback available.
Clients cache successful reflections by their input fingerprint; new events
immediately appear through the fallback until a fresh reflection is ready.

AI explanations keep authored test questions, options and answers. Free-form
model memory is replaced by validated notes plus the latest unscored event.
ElevenLabs receives this short context through `today_summary` and `run_report`.
The code treats all conversation excerpts as data rather than instructions.

API contract: [OpenRouter chat completions](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion).
Model: [Gemini 3.6 Flash](https://openrouter.ai/google/gemini-3.6-flash).

## Validation

- `pnpm test`: evidence validation, authored answers, secret isolation, caching,
  measured improvement, fallback and chat redaction. No paid API calls.
- `tools/check-notebook.mjs`: browser coverage using a mocked service, including
  saved history, multiple runs, big text, retries, advisor memory, access during
  conversations, pausing, narrow windows and offline behavior.
- `tools/check-notebook-live.mjs`: explicitly makes one paid request using only
  synthetic events. Prints status/counts, never credentials. Do not run routinely.
- Use `PLAYWRIGHT_MODULE` to point browser tools to the installed Playwright module
  when it is not available on the regular Node module path.

Relevant files: `src/game/learning.ts`, `src/game/notebook.ts`,
`src/ui/Notebook.tsx`, `server/notebook.mjs`, and `server/api.mjs`.
