# Task 6 — Authenticated connection verification and recovery

Completed 2026-10-31 for [the integration plan](../workshop-game-integration-plan.md).

Workshop now verifies a real external API reply for the complete selected character snapshot. **Your game connected** requires authenticated server evidence, not a download, world allocation, Workshop test or timer broadcast.

## Implementation

- [Shared snapshot identity and response type](../../shared/src/snapshot.ts): deterministic JSON key ordering, complete normalized draft including persona, catalogues, limits, labels, signals, schedules and embedded reference pictures. Node SHA-256 and browser SubtleCrypto hash the same UTF-8 string. Arrays retain order. Runtime inventory/start overrides do not rewrite the configuration identity.
- [World metadata](../../server/src/worlds.ts) owns each NPC’s immutable snapshot hash and separate reply evidence. [Authenticated status](../../server/src/routes/v1.ts), `GET /api/v1/worlds/:id/connection`, uses the existing world bearer token and returns `Cache-Control: no-store`. No public world-status endpoint was added. It returns world ID, busy state, calls left and per-NPC `{ id, name, snapshot, first_reply, last_say }`; no token, persona, dialogue or other world’s configuration.
- Evidence is recorded only after the external `/say` transaction is saved within the event cap: `outcome === 'acted'`, an accepted model attempt, and a `SAID` event by the addressed NPC to `player`. The first event/time stays stable. Missing provider setup and subsequent unavailable turns update recovery metadata. Timer/report paths, player-only lines, silent actions, rejected proposals, fallbacks and rejected over-cap transactions never create evidence. A previously successful reply remains historical evidence when a later provider call fails; the UI reports that latest failure too.
- [Example’s local UI](../../examples/game-backend/verification.mjs): `/verify` prints only an ephemeral loopback address. A same-origin POST with a dedicated UI header reveals the ID/token in a local page. Host, Origin and fetch-site checks, CSP, no-store and no-referrer protect the handoff. No token appears in URLs, terminal logs or committed files. The listener closes after five minutes, `/quit` or a replacement `/verify`. Interactive mode keeps the world accessible after initial provider/action failures for manual recovery.
- [Verification component](../../web/src/ConnectionVerification.tsx) keeps credentials only in mounted component state. Back, import/replacement, server/snapshot changes and Clear credentials discard them and abort pending reads/timers. The password field disables autocomplete. No browser storage, URL or analytics writes are used. Unchanged form retries retain credentials in memory.
- [Status and polling helpers](../../web/src/connectionStatus.ts) show **Not connected**, **World created**, **First reply received**, **Unavailable or expired**, and **Configuration mismatch**. Each submission makes at most six reads, three seconds after each completed read, each with a ten-second timeout; 401, 404 and mismatches stop early. Manual retry starts a new bounded run. No polling starts simply by opening the screen. Redirects, cookies and referrers are disabled. Raw server error bodies are never displayed where they might echo a token. Snapshot hashing requires localhost or HTTPS.
- [Handoff screen](../../web/src/GameConnection.tsx) blocks verification of a stale downloaded copy and explains that existing worlds retain their older configuration. Returning preserves the Workshop draft, dialogue and unsent message.

Example authenticated status (values illustrative, no credentials):

```json
{
  "world_id": "example-world",
  "busy": false,
  "calls_left": 148,
  "npcs": [{
    "id": "portable_ada",
    "name": "Portable Ada",
    "snapshot": "sha256:<64 hexadecimal characters>",
    "first_reply": { "event_id": "e_0004", "at": "2026-10-31T22:07:00.000Z" },
    "last_say": "reply"
  }]
}
```

## Checks and recovery evidence

[14 API tests](../../server/src/routes/__tests__/v1-connection.test.ts), [16 browser-helper tests](../../web/src/__tests__/connectionStatus.test.ts), and [the local credential-page test](../../examples/game-backend/verification.test.ts) cover authentication, complete hashing, per-NPC evidence, in-flight status, actual timer broadcasts, provider failures, silent/rejected/over-cap actions, independent snapshots/price floors, zero quota, restart, eviction, read cancellation, bounded retries, malformed responses and cross-origin credential-page refusals.

[Task 7’s browser record](../workshop-game-integration-task-7/README.md) includes fresh/imported desktop and 390px journeys, matching replies, wrong credentials, stale copies, mismatches, provider outage recovery, credential clearing and a real fixture process restart. Final checks: **514 tests / 43 files passed**, typecheck passed, web build passed with the existing large Phaser chunk warning, and `git diff --check` passed. Linked raw outputs are in Task 7.

No live-provider calls, deployment or human newcomer study were performed. This milestone proves the local/backend API path with scripted model proposals through the real ledger; it does not add durable worlds, production credential management or engine adapters.
