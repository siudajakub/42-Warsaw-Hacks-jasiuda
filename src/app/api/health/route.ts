import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getStoreHealth, isStale, secondsUntilRefresh } from "@/lib/pipeline/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness + config probe. Docker healthcheck and on-site debugging both use it. */
export async function GET() {
  const store = getStoreHealth();
  return NextResponse.json(
    {
      ok: true,
      mode: "live",
      hasCredentials: env.hasCredentials,
      campusId: env.campusId,
      cursusId: env.cursusId,
      refreshSeconds: env.refreshSeconds,
      nextRefreshIn: secondsUntilRefresh(),
      stale: isStale(),
      uptimeSeconds: Math.round(process.uptime()),
      cache: {
        version: store.cacheVersion,
        loadedFromDisk: store.loadedFromDisk,
        hasSnapshot: store.hasSnapshot,
        generatedAt: store.generatedAt,
      },
      dashboardStatus: store.status,
      diagnostics: store.diagnostics,
      sections: store.sectionLastSuccess,
      connect: store.connect,
      needsEvaluator: store.needsEvaluator,
      teamUp: store.teamUp,
      peerContributors: store.peerContributors,
      campusActivity: store.campusActivity,
      activeSeats: store.activeSeats,
      coalitionContributors: store.coalitionContributors,
      coalitionScores: store.coalitionScores,
      profiles: store.profiles,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
