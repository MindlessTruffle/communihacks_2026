# Voice + conversational agents (ElevenLabs)

## Voices (character -> voice -> why)
Account had only the 21 premade voices; 4 were added from the shared Voice Library (names suffixed "(RC)", same IDs). `V` map + `characters.ts` updated. All 19 characters now have DISTINCT voices (no sharing).

| Character | Voice (id) | Why |
|---|---|---|
| Little Juno (kid) | Sunny - Bubbly, Children Narrator (`FgiNpTIapnCbaD6xiqIo`) **new** | young, bright, child-like; was Jessica (shared with Boo) |
| Boo (ghost) | Serena - melodic, dreamy, ethereal (`mqyRCI8OeJTogXjYUGZ5`) **new** | soft, airy, gentle, never scary; was Jessica |
| Sir Clank (knight) | Cody McAvoy - Devoted Knight (`1RVpBInY9YUYMLSUQReV`) **new** | calm, pleasant, heroic but kind; was Harry "Fierce Warrior" (too rough) |
| Auntie Rosa | Nana Margaret - Little Old Lady (`xIzR6egd3S3LJZbVW0c1`) **new** | warm elderly voice for a caring older woman with a cane; was Lily |
| Professor Quill | Alice - Clear, Engaging Educator (`Xb7hH8MSUJpSbSDYk0k2`) | very clear educator diction; was Eric |
| Sage Ollie (advisor) | George - Warm, Captivating Storyteller (`JBFqnCBsd6RMkjVDRZzb`) | kept: warm grandparent-storyteller, clear, slow; best fit for the wise owl |
| Treasurer Cogs | Daniel - Steady Broadcaster (`onwK4e9ZLuTAKqWW03F9`) | kept: precise, formal, polite = robot treasurer |
| Old Bill | Bill - Wise, Mature, Balanced (`pqHfZKP75CvOlQylNhV4`) | kept: old, wise fisherman |
| Zib the Traveller | Liam - Energetic (`TX3LPaxmHKxFdv7VOQHJ`) | kept: excitable visitor, clear American |
| Tilly | Laura (`FGY2WhTYpPnrIDTdsKH5`) | kept: quick, quirky clerk |
| Marlo | Charlie (`IKne3meq5aSn9XLyUdCD`) | kept: cheerful salesman |
| Sly Fenwick | Callum - Husky Trickster (`N2lVS1w4EtoT3dr4eOWO`) | kept: smooth trickster, not harsh |
| Farmer Hazel | Matilda (`XrExE9yKIg1WjnnlVkGX`) | kept: upbeat farmer |
| Benny | Will - Relaxed Optimist (`bIHbv24MWmeRgasZH58o`) | kept |
| Wren | Chris - Down-to-Earth (`iP95p4xoKVk53GoZ742B`) | kept |
| Maya | Bella - Bright, Warm (`hpp4J3VqNfWAUOO0d1Us`) | kept |
| Doctor Pip | Sarah - Reassuring (`EXAVITQu4vr4xnSDxMaL`) | kept: calm healer |
| Captain Gus | Roger - Laid-Back (`CwhRBWXzGAHq8TQ4Fs17`) | kept |
| Brick | Brian - Deep, Comforting (`nPczCjzI2devNBz1zQrb`) | kept: booming but comforting |
| Narrator | River (`SAz9YHcvj6GT2YYXdXww`) | kept |

Caveat: voice choice was made from library metadata + generation tests, not by ear. Juno's Sunny is a young adult voice with a child-narrator style, not a literal child recording; swap `V.sunny` if the team prefers another.

## Models
- Agents (`tools/sync-agents.ts`): TTS `eleven_v4` with `expressive_mode: true` accepted by the Agents API (read back OK). Tried order v4 -> v4_turbo -> v3_conversational -> flash_v2 with automatic fallback in the script. `stability .5, similarity .8, speed .92`. Per-character `suggested_audio_tags` (e.g. Juno [giggles]/[whispers], Boo [whispers]/[gasps], Clank [proudly]). Tags are stripped from captions in `session.ts` (`stripTags`).
- Latency: v4 is fine in live voice sessions (greeting audio + replies ~1-2 s, user speech answered in a few seconds). eleven_v4_turbo exists as a drop-in if a slow connection needs it (edit `TTS_MODEL_PREFERENCE`).
- LLM: was `deepseek-v41-flash`; now `claude-haiku-5-5` (fast, strong with tools and simple warm talk). Other options in the platform list include claude-sonnet-5-5, gemini-3.x-flash, gpt-5.4-mini. Prompts/safety rules untouched.
- Baked lines + no-mic `/api/tts`: `server/voiceModel.mjs` (single source): bake = `eleven_v4`; live no-mic = `eleven_v4_turbo` -> `eleven_v4` -> `eleven_v3` fallback. Voice settings `stability .5, similarity .8, style 0, speaker boost, speed .92`.

## Baking
- 470 unique lines, 19,383 characters (well under the 150k limit): everything re-baked with eleven_v4. 72 unreferenced old mp3s pruned; index.json has 470 entries.
- `voiceKey` is unchanged (voice+text), so game lookups still hit. New `public/audio/voices/models.json` records which model made each file; `voices:bake` re-bakes files whose model differs. Flags: `--dry`, `--budget=N` (priority order: advisor+UI, unlocks, scripted chats, cards), `--prune`.
- `public/sw.js` VERSION bumped v2 -> v3 so cached old mp3s (same file names) are dropped.

## Mic flow (src/convai/mic.ts, Conversation.tsx, session.ts)
1. Tap Mic -> `micState()`: insecure context / no getUserMedia -> friendly panel + typing; Permissions API `denied` -> panel with browser-specific re-enable steps; `prompt` -> big-text explanation ("To talk out loud, allow the microphone") with [Allow the microphone] / [Type instead]; `granted` -> straight in.
2. [Allow] calls `getUserMedia` (browser prompt) then releases the stream. Denied/no device -> panel + stay in No-mic typing. Remembered-mic preference only auto-starts mic if already granted.
3. `/api/convai-token?agent=X&mode=mic` -> conversation token -> WebRTC `Conversation.startSession`.
4. No-mic: `mode=text` -> **signed URL websocket** text session (see bugs). Replies voiced via `/api/tts` in the character voice, queued so split replies don't cut each other.
5. Mic <-> No mic on a live voice session only mutes/unmutes the mic (no double voicing). Typing -> Mic restarts as voice with a recap, greeting only if nothing was said yet.
6. End: session closed, TTS stopped, speechSynthesis cancelled. Agent hang-up -> "Chat finished, tap Done". Connection drop -> falls to scripted chat.

## Bugs fixed
- **No-mic text chat was broken**: text-only over WebRTC (conversation token) made the agent leave the room after a few seconds and never answer typed messages. Now websocket + signed URL (`server/api.mjs` `mode=text`).
- start() racing stop() could leave a live session / open mic after leaving; now guarded by a generation counter.
- Mic->No-mic kept the voice session AND voiced replies via /api/tts (double voice); fixed.
- Switching to mic with nothing said silenced the agent (empty first_message override); fixed.
- Failed mic start emitted "error" -> scripted fallback raced the text restart; start() now just returns + `lastFailure`.
- Unexpected disconnects were shown as nothing; now ended/error handled. Token endpoint no longer echoes upstream bodies; agent name validated; rate limit 20 -> 60 per 10 min per IP.
- TTS audio URLs revoked; split replies queued.

## Tested (Chrome, localhost:5202, fake media flags, fake mic fed a spoken WAV)
- Pre-prompt panel -> Allow -> WebRTC session live in ~1 s; agent audio track playing; user speech ("Hello. I like your shiny coin...") transcribed and the agent answered in character (Juno, Rosa); End closed everything (no leftover audio elements).
- Typed No-mic chat (Juno, Clank): reply in 1-2 s, voiced via /api/tts (200).
- Denied/insecure panels: denied panel verified; insecure/unsupported/no-device panels are code paths only (localhost is secure).
- Not tested: real phones/Safari, a real human mic, https deploy, hearing the voices (judged by metadata only).
- Paid usage: ~9 short agent sessions (kid x6 incl. config probes, clank x2, rosa x1), 1 WAV TTS (63 chars), 3 TTS timing probes (~290 chars), bake 19,383 chars. Scratch scripts only in the temp scratchpad.

## Left as-is / caveats
- Only 9 characters have agents (advisor evening/review, rosa, benny, maya, hazel, clank, kid, bill, zib). Boo, Cogs, Quill etc. are scripted + baked only; their voices apply to baked lines.
- Playwright check scripts for this are not saved in the repo.
