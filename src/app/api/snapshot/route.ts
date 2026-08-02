import { NextResponse } from "next/server";
import { getSnapshot, isStale, secondsUntilRefresh } from "@/lib/pipeline/store";
import type { SnapshotResponse } from "@/lib/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    const body: SnapshotResponse = {
      ok: true,
      snapshot,
      nextRefreshIn: secondsUntilRefresh(),
      stale: isStale(),
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (err) {
    const body: SnapshotResponse = {
      ok: false,
      snapshot: null,
      nextRefreshIn: 30,
      stale: true,
      error: err instanceof Error ? err.message : "Unknown error",
    };
    return NextResponse.json(body, { status: 503 });
  }
}
