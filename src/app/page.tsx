import { getSnapshot, isStale } from "@/lib/pipeline/store";
import { Wall } from "@/components/Wall";
import type { Snapshot } from "@/lib/contract";
import { env } from "@/lib/env";
import { parseRequestedScene } from "@/lib/scene-query";

export const dynamic = "force-dynamic";

/**
 * The wall is server-rendered with a full snapshot already in the HTML, so the
 * TV shows real data on first paint — no loading state, no flash of empty
 * layout. The client takes over afterwards for rotation and polling.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Resolved on the server so the first paint is already the requested scene.
  // Doing this client-side instead would render scene 1, then swap — which
  // flashes on the wall and never settles in a headless screenshot run.
  const q = await searchParams;
  const still = q.still !== undefined;
  const initialScene = parseRequestedScene(q.scene);

  let snapshot: Snapshot | null = null;
  let error: string | null = null;

  try {
    snapshot = await getSnapshot();
  } catch (err) {
    error = err instanceof Error ? err.message : "Could not build a snapshot.";
  }

  if (!snapshot) {
    return (
      <main className="shell">
        <div className="bg" />
        <div />
        <div
          style={{
            display: "grid",
            placeItems: "center",
            gap: "1rem",
            textAlign: "center",
          }}
        >
          <p className="kicker">42 HIGHLIGHTS / cold start</p>
          <h1 className="display" style={{ fontSize: "3rem" }}>
            No snapshot yet
          </h1>
          <p className="label" style={{ maxWidth: "40rem", lineHeight: 1.6 }}>
            {error}
          </p>
        </div>
        <div />
      </main>
    );
  }

  return (
    <Wall
      initial={snapshot}
      initialStale={isStale()}
      refreshSeconds={env.refreshSeconds}
      still={still}
      initialScene={initialScene}
    />
  );
}
