"use client";

import type { Snapshot } from "@/lib/contract";
import { ConnectBoard } from "@/components/people";
import { Empty, Frame } from "./Frame";

export function ConnectScene({
  snapshot,
  paused = false,
  still = false,
}: {
  snapshot: Snapshot;
  paused?: boolean;
  still?: boolean;
}) {
  const connect = snapshot.connect;
  const hasPeople = connect.needsEvaluator.requests.length > 0 ||
    connect.teamUp.requests.length > 0 ||
    connect.peerContributors.evaluators.length > 0;

  return (
    <Frame
      title="Move the next project forward"
    >
      {!hasPeople &&
      connect.status === "collecting" &&
      connect.needsEvaluator.status === "collecting" &&
      connect.teamUp.status === "collecting" &&
      connect.peerContributors.status === "collecting" ? (
        <Empty title="Collecting peer activity" hint="The board will fill with verified people from the active Warsaw roster." />
      ) : (
        <ConnectBoard connect={connect} paused={paused} still={still} />
      )}
    </Frame>
  );
}
