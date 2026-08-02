#!/usr/bin/env node
/** Contract smoke test for a running 42 HIGHLIGHTS server. */

const BASE = process.argv[2] ?? "http://localhost:4242";
let passed = 0;
const failures = [];
const check = (name, condition, detail = "") => condition ? passed += 1 : failures.push(detail ? `${name} — ${detail}` : name);
const finite = (value) => typeof value === "number" && Number.isFinite(value);

async function json(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  return { status: response.status, body: await response.json() };
}

console.log(`42 HIGHLIGHTS smoke test against ${BASE}\n`);
// Initialise the lazy snapshot store before asserting section-level health.
await json("/api/snapshot");
const health = await json("/api/health");
check("health responds 200", health.status === 200, `got ${health.status}`);
check("health.ok", health.body.ok === true);
check("health is live-only", health.body.mode === "live");
check("health exposes cache v11", health.body.cache?.version === 11);
check("health exposes section freshness", Boolean(health.body.sections));
check("health exposes people-feed status", ["collecting", "partial", "ready"].includes(health.body.teamUp));
check("health exposes Connect status", ["collecting", "partial", "ready"].includes(health.body.connect));
check("health exposes Needs an evaluator status", ["collecting", "partial", "ready"].includes(health.body.needsEvaluator));
check("health exposes active-seat status", ["live", "partial"].includes(health.body.activeSeats));
check("health exposes profile status", ["collecting", "partial", "ready"].includes(health.body.profiles));
check("health exposes coalition contributor status", ["collecting", "partial", "ready"].includes(health.body.coalitionContributors));
check("health exposes coalition score status", ["collecting", "partial", "ready"].includes(health.body.coalitionScores));

const page = await fetch(BASE);
const html = await page.text();
check("wall responds 200", page.status === 200, `got ${page.status}`);
check(
  "wall is server rendered with the 42 HIGHLIGHTS brand",
  html.includes("Highlights") && html.includes('alt="42 Warsaw"') && html.includes("scene__title"),
);
check("wall presents the three public scenes", ["Completed", "Connect", "Campus"].every((label) => html.includes(label)));
check(
  "only current scenes appear in public navigation",
  ["Completed", "Connect", "Campus"].every((label) => html.includes(`rail__label">${label}</span>`)),
);
const snap = await json("/api/snapshot");
const s = snap.body.snapshot;
check("snapshot responds 200", snap.status === 200);
  check("snapshot payload present", Boolean(s));

if (s) {
  check("core metadata is finite", finite(s.campus?.id) && finite(s.cursus?.id));
  check("weekly totals are finite", finite(s.weekly?.current?.validations) && finite(s.weekly?.previous?.evaluations));
  check("Connect status is recognised", ["collecting", "partial", "ready"].includes(s.connect?.status));
  check("Needs an evaluator status is recognised", ["collecting", "partial", "ready"].includes(s.connect?.needsEvaluator?.status));
  check("Needs an evaluator requests are named", s.connect?.needsEvaluator?.requests?.every((row) => row.student?.login && row.projectName));
  check("Connect caps evaluator requests", s.connect?.needsEvaluator?.requests?.length <= 8);
  check("Connect caps project aggregates", s.connect?.needsEvaluator?.projects?.length <= 8);
  check("Team Up status is recognised", ["collecting", "partial", "ready"].includes(s.connect?.teamUp?.status));
  check("Team Up caps public requests", s.connect?.teamUp?.requests?.length <= 8);
  check(
    "peer contributors expose named rows for the Top 5 view",
    Array.isArray(s.connect?.peerContributors?.evaluators) &&
      s.connect.peerContributors.evaluators.every((row) => row.student?.login && finite(row.completedEvaluations)),
  );
  check("campus status is recognised", ["collecting", "partial", "ready"].includes(s.campusActivity?.status));
  check("campus Top list is capped at five", s.campusActivity?.topStudents?.length <= 5);
  check("active map seats have a dedicated status", ["live", "partial"].includes(s.campusActivity?.activeSeatStatus));
  check("workstation rows are coherent", s.campusActivity?.workstations?.every((row) => typeof row.host === "string" && finite(row.minutes)));
  check("coalitions expose total and per-member time", s.campusActivity?.coalitions?.every((row) => finite(row.minutes) && finite(row.minutesPerActiveMember)));
  check("coalitions expose official score or an honest null", s.campusActivity?.coalitions?.every((row) => row.score === null || finite(row.score)));
  check("coalition score status is recognised", ["collecting", "partial", "ready"].includes(s.campusActivity?.coalitionScoreStatus));
  check("coalition contributor status is recognised", ["collecting", "partial", "ready"].includes(s.campusActivity?.coalitionContributorStatus));
  check("celebrations are named and classified", s.celebrations.every((row) => row.student?.login && row.achievements?.length));
  check("celebrations no longer expose heat rankings", s.celebrations.every((row) => !("heat" in row)));
  for (const removed of ["source", "warnings", "community", "readyToShip", "ticker", "momentum", "rising", "climb", "projectFlow"]) {
    check(`${removed} is absent`, !(removed in s));
  }
}

const getRefresh = await fetch(`${BASE}/api/refresh`);
check("GET refresh is disabled", getRefresh.status === 405);
const before = s?.generatedAt;
const refreshHeaders = process.env.HIGHLIGHTS_REFRESH_TOKEN
  ? { "x-highlights-token": process.env.HIGHLIGHTS_REFRESH_TOKEN }
  : undefined;
const refreshed = await json("/api/refresh", { method: "POST", headers: refreshHeaders });
check("POST refresh responds 200", refreshed.status === 200);
check("POST refresh is not older", !before || Date.parse(refreshed.body.snapshot?.generatedAt) >= Date.parse(before));

console.log(`${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.log(`  x ${failure}`);
  process.exit(1);
}
console.log("\nAll contract checks passed.");
