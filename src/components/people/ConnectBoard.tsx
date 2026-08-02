"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  PeopleSectionStatus,
  ConnectRequest,
  ConnectState,
} from "@/lib/contract";
import { relTime } from "@/components/ui/primitives";
import {
  CONNECT_PAGE_MS,
  connectPageCount,
  requestPage,
  topPeerContributors,
} from "./helpers";
import { PersonAvatar } from "./PersonAvatar";
import styles from "./people.module.css";

function StatusBadge({ status }: { status: PeopleSectionStatus | ConnectState["status"] }) {
  if (status === "ready") return null;
  return <span className={styles.sectionStatus}>{status}</span>;
}

function RequestCard({ request, index }: { request: ConnectRequest; index: number }) {
  return (
    <article
      className={styles.requestCard}
      style={{ animationDelay: `${index * 45}ms` }}
    >
      <PersonAvatar student={request.student} size={66} />
      <div className={styles.personCopy}>
        <strong>{request.student.displayName}</strong>
        <span>{request.student.login}</span>
      </div>
      <div className={styles.projectCopy}>
        <strong>{request.projectName}</strong>
        <span>
          {request.rank === null ? "Outer Core" : `Rank 0${request.rank}`}
          {` · ${relTime(request.updatedAt)}`}
        </span>
      </div>
    </article>
  );
}

function RequestColumn({
  kind,
  title,
  total,
  requests,
  status,
  empty,
}: {
  kind: "peer" | "team";
  title: string;
  total: number | null;
  requests: readonly ConnectRequest[];
  status: PeopleSectionStatus | ConnectState["status"];
  empty: string;
}) {
  return (
    <section className={styles.connectColumn} data-kind={kind}>
      <header className={styles.connectHead}>
        <div>
          <h3>
            {title}
            <StatusBadge status={status} />
          </h3>
        </div>
        <strong className={styles.connectCount}>{total ?? "—"}</strong>
      </header>
      {requests.length > 0 ? (
        <div className={styles.requestList}>
          {requests.map((request, index) => (
            <RequestCard request={request} index={index} key={request.id} />
          ))}
        </div>
      ) : (
        <div className={styles.connectEmpty}>{empty}</div>
      )}
    </section>
  );
}

export function ConnectBoard({
  connect,
  paused = false,
  still = false,
}: {
  connect: ConnectState;
  paused?: boolean;
  still?: boolean;
}) {
  const pages = connectPageCount(connect.needsEvaluator.requests, connect.teamUp.requests);
  const [page, setPage] = useState(0);
  const safePage = page % pages;

  useEffect(() => {
    if (paused || still || pages < 2) return;
    const id = window.setInterval(() => setPage((current) => (current + 1) % pages), CONNECT_PAGE_MS);
    return () => window.clearInterval(id);
  }, [pages, paused, still]);

  useEffect(() => {
    if (page >= pages) setPage(0);
  }, [page, pages]);

  const peerRequests = requestPage(connect.needsEvaluator.requests, safePage);
  const teamRequests = requestPage(connect.teamUp.requests, safePage);
  const evaluators = useMemo(
    () => topPeerContributors(connect.peerContributors.evaluators),
    [connect.peerContributors.evaluators],
  );
  return (
    <div
      className={styles.connectBoard}
      data-page={safePage}
      data-paused={paused || undefined}
      data-still={still || undefined}
    >
      <RequestColumn
        kind="peer"
        title="Needs an evaluator"
        total={connect.needsEvaluator.open}
        requests={peerRequests}
        status={connect.needsEvaluator.status}
        empty={connect.needsEvaluator.status === "ready" ? "No students need an evaluator right now." : "Evaluation schedule unavailable."}
      />

      <RequestColumn
        kind="team"
        title="Open to team up"
        total={connect.teamUp.searching}
        requests={teamRequests}
        status={connect.teamUp.status}
        empty="No named team requests right now."
      />

      <section className={styles.connectColumn} data-kind="evaluators">
        <header className={styles.connectHead}>
          <div>
            <h3>
              Most evaluations
              <StatusBadge status={connect.peerContributors.status} />
            </h3>
          </div>
          <strong className={styles.connectCount}>
            {connect.peerContributors.totalCompleted}
          </strong>
        </header>
        {evaluators.length > 0 ? (
          <div className={styles.evaluatorList}>
            {evaluators.map((contributor, index) => (
              <article className={styles.evaluatorRow} key={contributor.student.id}>
                <span className={styles.evaluatorRank}>{index + 1}</span>
                <PersonAvatar student={contributor.student} size={60} />
                <div className={styles.personCopy}>
                  <strong>{contributor.student.displayName}</strong>
                  <span>{contributor.student.login} · {relTime(contributor.latestAt)}</span>
                </div>
                <strong className={styles.evaluatorCount}>
                  {contributor.completedEvaluations}
                  <small>evals</small>
                </strong>
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.connectEmpty}>Collecting named peer contributions.</div>
        )}
      </section>
    </div>
  );
}
