# Party / Classroom mode — plan (to build after the gummy merge)

Status: **not started**. Decisions captured so far; full design still to write.

## Concept
- Educator creates a room → 4-digit code (+ QR) on the projected teacher screen.
- Players join on their own devices with the code (no accounts; first name or preset name + ruler pick).
- Audio, read-aloud, music and ElevenLabs voice are **OFF by default** on player devices (toggle to enable).

## Collaborative decisions (key rule)
- Players do **not** make individual court decisions. **The whole class votes** on each visitor's request.
- Every player sees the same visitor + request and taps ✓ or ✗.
- On the teacher screen (and on player screens), **each player's little sticker/avatar pops up next to the ✓ or ✗ they voted for** — a live tally of faces, not numbers only.
- Majority wins (tie → advisor asks for one more vote, or teacher breaks the tie). No timer pressure; teacher advances when ready (or when everyone has voted).
- The shared outcome applies to the **class kingdom** (one shared treasury / happiness / people), so everyone collaborates toward the goal.
- Open question: do the evening street / market stay individual (personal shopping list, contributes savings to the class pile) or also become group votes? Proposed: market stays individual, savings feed the class pile.

## Teacher screen
- Players' characters walk around idly along the bottom (their ruler model + colour + name tag).
- A **dotted goal line that never moves**.
- The rest is a room with a huge pile of coins = total class money.
- **Scaling:** the line is fixed; the value each coin represents changes with the number of connected players, so pile height always reads as "% of class goal". Coins regroup smoothly when players join/leave; celebration past 100%.
- Vote phase: the two big ✓ / ✗ columns with player stickers stacking beside each.

## Networking (free, no credit card) — recommended for the hackathon
1. **Host on a laptop:** add a WebSocket (`ws`) endpoint to `server/serve.mjs`; rooms in an in-memory Map; server-authoritative vote tally + class treasury.
2. **Expose with a Cloudflare quick tunnel** (`cloudflared tunnel --url http://localhost:8080`): free, no account, public HTTPS URL that works on any network; show it as a QR code on the teacher screen.
3. **LAN fallback:** same server via `http://<laptop-ip>:8080` on one Wi-Fi (venue Wi-Fi may block device-to-device; a phone hotspot or travel router avoids that).
4. Hosted alternative later: Supabase Realtime (free tier, GitHub login; presence + broadcast, no server code).

## Message protocol sketch
```ts
type C2S =
  | { t: "join"; code: string; name: string; ruler: string; color?: string }
  | { t: "vote"; cardId: string; choice: "yes" | "no" }
  | { t: "wealth"; gold: number }            // individual market savings → class pile
type S2C =
  | { t: "joined"; playerId: string; room: RoomState }
  | { t: "room"; room: RoomState }           // players, phase, current card, class treasury, goal
  | { t: "votes"; cardId: string; yes: string[]; no: string[] }   // playerIds → stickers
  | { t: "result"; cardId: string; choice: "yes" | "no"; outcome: unknown }
```

## MVP order
1. Room create/join + lobby with stickers (teacher screen).
2. Shared court with class voting + sticker tally + shared outcome.
3. Teacher pile screen with the goal line + idle characters.
4. Individual market feeding the class pile; end-of-session class summary (anonymous).
