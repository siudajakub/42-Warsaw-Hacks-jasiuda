import assert from "node:assert/strict";
import test from "node:test";
import {
  cachedProfilesForRoster,
  compactProfile,
  currentCoalitionsFromBlocs,
  finaliseProfileCache,
  profileIdBatches,
  type ProfileCache,
} from "@/lib/pipeline/collect";
import type { FtUserRef } from "@/lib/ft/types";

const SYNCED = "2026-08-01T10:00:00.000Z";

test("profile hydration batches at most 50 IDs", () => {
  const batches = profileIdBatches(Array.from({ length: 121 }, (_, index) => index + 1));
  assert.deepEqual(batches.map((batch) => batch.length), [50, 50, 21]);
  assert.deepEqual(batches.flat(), Array.from({ length: 121 }, (_, index) => index + 1));
});

test("profile compaction keeps only the public allowlist", () => {
  const full = {
    id: 7,
    login: "alice",
    displayname: "Alice Example",
    image: { link: "https://cdn.example/alice.jpg" },
    pool_month: "july",
    pool_year: "2026",
    email: "must-not-persist@example.com",
    phone: "+48123456789",
    wallet: 999,
    correction_point: 42,
  } as FtUserRef;
  const compact = compactProfile(full, SYNCED);
  assert.deepEqual(Object.keys(compact).sort(), [
    "displayName", "id", "image", "login", "syncedAt",
  ]);
});

test("partial profile refresh retains roster-scoped last-good entries and timestamp", () => {
  const previous: ProfileCache = {
    syncedAt: "2026-07-31T10:00:00.000Z",
    entries: {
      "1": { id: 1, login: "alice", displayName: "Alice", image: null, syncedAt: SYNCED },
      "2": { id: 2, login: "bob", displayName: "Bob", image: null, syncedAt: SYNCED },
      "99": { id: 99, login: "former", displayName: "Former", image: null, syncedAt: SYNCED },
    },
  };
  const entries = cachedProfilesForRoster(previous, [1, 2]);
  entries["2"] = { ...entries["2"], displayName: "Bob Fresh", syncedAt: SYNCED };
  const partial = finaliseProfileCache(entries, SYNCED, previous.syncedAt, false);

  assert.equal(partial.syncedAt, previous.syncedAt);
  assert.deepEqual(Object.keys(partial.entries).sort(), ["1", "2"]);
  assert.equal(partial.entries["1"].displayName, "Alice");
  assert.equal(partial.entries["2"].displayName, "Bob Fresh");
});

test("current coalition selection uses only the newest non-empty Warsaw bloc", () => {
  const coalitions = currentCoalitionsFromBlocs([
    {
      id: 100,
      campus_id: 67,
      cursus_id: 21,
      created_at: "2023-01-01T00:00:00Z",
      coalitions: [{ id: 330, name: "Loki", slug: "loki", score: 61_370 }],
    },
    {
      id: 129,
      campus_id: 67,
      cursus_id: 21,
      created_at: "2024-02-26T15:15:54Z",
      coalitions: [
        { id: 458, name: "Orionis", slug: "orionis", score: 35_818 },
        { id: 459, name: "Lunaria", slug: "lunaria", score: 43_216 },
        { id: 460, name: "Uniterrax", slug: "uniterrax", score: 33_920 },
      ],
    },
  ]);
  assert.deepEqual(coalitions.map((row) => row.name), ["Orionis", "Lunaria", "Uniterrax"]);
  assert.equal(coalitions.some((row) => row.name === "Loki"), false);
});
