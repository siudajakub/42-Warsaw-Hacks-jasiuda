import { NextResponse, type NextRequest } from "next/server";
import { refresh, secondsUntilRefresh } from "@/lib/pipeline/store";
import { env } from "@/lib/env";
import type { SnapshotResponse } from "@/lib/contract";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Manual refresh — the hackathon brief requires the wall be "easily updateable".
 *
 * Three ways in, all hitting this one handler:
 *   - the REFRESH button in the header
 *   - pressing R on a keyboard plugged into the TV stick
 *   - `curl -X POST http://tv.local:4242/api/refresh` from anywhere on the LAN
 *
 * HIGHLIGHTS_REFRESH_TOKEN gates it when the box is reachable beyond the LAN.
 */
async function handle(req: NextRequest) {
  if (env.refreshToken) {
    const provided =
      req.headers.get("x-highlights-token") ??
      new URL(req.url).searchParams.get("token") ??
      "";
    if (provided !== env.refreshToken) {
      return NextResponse.json(
        { ok: false, snapshot: null, nextRefreshIn: 0, stale: true, error: "Unauthorized" } satisfies SnapshotResponse,
        { status: 401 },
      );
    }
  }

  try {
    const snapshot = await refresh();
    const body: SnapshotResponse = {
      ok: true,
      snapshot,
      nextRefreshIn: secondsUntilRefresh(),
      stale: false,
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
      error: err instanceof Error ? err.message : "Refresh failed",
    };
    return NextResponse.json(body, { status: 502 });
  }
}

export const POST = handle;
