"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import type { CoalitionTime, Snapshot, WorkstationStat } from "@/lib/contract";
import { Monogram } from "@/components/ui/primitives";
import { ActiveSeatOverlay, PersonAvatar } from "@/components/people";
import { Empty, Frame } from "./Frame";
import {
  CAMPUS_CLUSTER_ZONES,
  CAMPUS_DESKS,
  CAMPUS_MAP_HEIGHT,
  CAMPUS_MAP_WIDTH,
  CAMPUS_SEAT_POINTS,
  CAMPUS_WALLS,
  WORKSTATION_SIZE,
  type CampusDeskDefinition,
} from "./campus-map-layout";

export function CampusScene({ snapshot, paused = false, still = false }: {
  snapshot: Snapshot;
  paused?: boolean;
  still?: boolean;
}) {
  const campus = snapshot.campusActivity;
  return (
    <Frame
      title="Campus Activity"
    >
      {campus.status === "collecting" && campus.workstations.length === 0 ? (
        <Empty title="Collecting cluster time" hint={campus.note} />
      ) : (
        <div className="campus-scene">
          <section className="panel campus-map-panel">
            <div className="campus-stats">
              <CampusStat label="Now online" value={campus.currentOccupancy} suffix="" />
              <CampusStat label="Peak this week" value={campus.peakOccupancy} suffix="" />
              <CampusStat label="Cluster time" value={Math.round(campus.totalMinutes / 60)} suffix="h" />
              <CampusStat label="Workstations seen" value={campus.workstations.length} suffix="" />
            </div>
            <CampusMap
              workstations={campus.workstations}
              activeSeats={campus.activeSeats}
              paused={paused}
              still={still}
            />
            <div className="campus-map__legend">
              <span><i className="seat-dot seat-dot--active" /> online now</span>
              <span><i className="seat-dot" /> used this week</span>
              <span>{campus.activeSeatStatus === "live" ? "avatar = active login" : "live seat feed updating"}</span>
            </div>
          </section>

          <aside className="campus-side">
            <section className="panel time-board">
              <header><span className="label">Top cluster time</span><span className="kicker">This week</span></header>
              <div className="time-board__rows">
                {campus.topStudents.map((person, index) => (
                  <motion.div className="time-person" key={person.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }}>
                    <span className="time-person__rank">{index + 1}</span>
                    <Monogram student={person} size={2.5} />
                    <div><strong>{person.displayName}</strong><span>{person.login}</span></div>
                    <b className="num">{formatMinutes(person.minutes)}</b>
                  </motion.div>
                ))}
              </div>
            </section>

            <CoalitionBoard snapshot={snapshot} paused={paused} still={still} />
          </aside>
        </div>
      )}
    </Frame>
  );
}

function CampusStat({ label, value, suffix }: { label: string; value: number; suffix: string }) {
  return <div><span className="kicker">{label}</span><strong className="num">{value.toLocaleString("en-US")}{suffix}</strong></div>;
}

function CampusMap({ workstations, activeSeats, paused, still }: {
  workstations: WorkstationStat[];
  activeSeats: Snapshot["campusActivity"]["activeSeats"];
  paused: boolean;
  still: boolean;
}) {
  const mapped = workstations.filter((row) => row.cluster !== null && row.row !== null && row.seat !== null);
  const byHost = new Map(mapped.map((row) => [row.host.toLowerCase(), row]));
  return (
    <div className="campus-map">
      <svg className="campus-floorplan" viewBox={`0 0 ${CAMPUS_MAP_WIDTH} ${CAMPUS_MAP_HEIGHT}`} preserveAspectRatio="none" role="img" aria-labelledby="campus-map-title campus-map-description">
        <title id="campus-map-title">42 Warsaw Floor 2 workstation map</title>
        <desc id="campus-map-description">A schematic floor plan showing all 152 workstation positions inside three separate clusters, with open passages between them.</desc>
        <defs>
          <pattern id="floor-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" className="floor-grid-line" fill="none" />
          </pattern>
        </defs>
        <rect width={CAMPUS_MAP_WIDTH} height={CAMPUS_MAP_HEIGHT} fill="url(#floor-grid)" />

        <g className="floor-shell" aria-label="Campus rooms and entrance">
          {CAMPUS_CLUSTER_ZONES.map((zone) => (
            <polygon
              points={zone.points.map((point) => `${point.x},${point.y}`).join(" ")}
              className={`floor-shell__zone floor-shell__zone--${zone.id}`}
              key={zone.id}
            />
          ))}
          {CAMPUS_WALLS.map((wall, index) => (
            <line {...wall} className="floor-shell__wall" key={index} />
          ))}
          <path d="M443 390V356M433 367L443 356L453 367" className="floor-shell__arrow" />
          <text x="443" y="410" className="floor-shell__room">ENTRANCE</text>
        </g>

        {[1, 2, 3].map((cluster) => (
          <g className={`floor-cluster floor-cluster--${cluster}`} aria-label={`Cluster ${cluster}`} key={cluster}>
            {CAMPUS_DESKS.filter((desk) => desk.cluster === cluster).map((desk) => (
              <FloorDesk desk={desk} byHost={byHost} key={`c${cluster}r${desk.row}`} />
            ))}
          </g>
        ))}
      </svg>
      <ActiveSeatOverlay
        activeSeats={activeSeats}
        width={CAMPUS_MAP_WIDTH}
        height={CAMPUS_MAP_HEIGHT}
        positionForHost={(host) => CAMPUS_SEAT_POINTS.get(host.toLowerCase())}
        avatarSize="clamp(10px, 1.08vw, 21px)"
        paused={paused}
        still={still}
      />
    </div>
  );
}

function FloorDesk({ desk, byHost }: {
  desk: CampusDeskDefinition;
  byHost: ReadonlyMap<string, WorkstationStat>;
}) {
  return (
    <g className="floor-desk">
      {desk.seats.map((seat) => {
        const host = `c${desk.cluster}r${desk.row}s${seat.seat}`;
        const data = byHost.get(host);
        const used = Boolean(data && data.minutes > 0);
        return (
          <g
            className="floor-seat"
            data-active={data?.active || undefined}
            data-used={used || undefined}
            data-host={host}
            transform={`translate(${seat.x} ${seat.y})`}
            key={host}
          >
            <title>{data ? `${host} · ${formatMinutes(data.minutes)} · ${data.uniqueUsers} users` : `${host} · no logged time this week`}</title>
            <rect x={-WORKSTATION_SIZE / 2} y={-WORKSTATION_SIZE / 2} width={WORKSTATION_SIZE} height={WORKSTATION_SIZE} rx="2" />
          </g>
        );
      })}
    </g>
  );
}

type CoalitionView = "points" | "time";

function CoalitionBoard({ snapshot, paused, still }: {
  snapshot: Snapshot;
  paused: boolean;
  still: boolean;
}) {
  const [view, setView] = useState<CoalitionView>("points");
  useEffect(() => {
    if (paused || still) return;
    const id = window.setInterval(
      () => setView((current) => current === "points" ? "time" : "points"),
      9_000,
    );
    return () => window.clearInterval(id);
  }, [paused, still]);

  const visibleView: CoalitionView = still ? "points" : view;
  const rows = useMemo(() => {
    const coalitions = [...snapshot.campusActivity.coalitions];
    return coalitions.sort((a, b) => visibleView === "points"
      ? (b.score ?? -Infinity) - (a.score ?? -Infinity) || a.name.localeCompare(b.name)
      : b.minutes - a.minutes || a.name.localeCompare(b.name));
  }, [snapshot.campusActivity.coalitions, visibleView]);
  const peak = Math.max(1, ...rows.map((row) => visibleView === "points" ? row.score ?? 0 : row.minutes));
  const status = visibleView === "points"
    ? combineStatuses(
      snapshot.campusActivity.coalitionScoreStatus,
      snapshot.campusActivity.coalitionContributorStatus,
    )
    : snapshot.campusActivity.status;

  return (
    <section className="panel coalition-race" data-view={visibleView}>
      <header>
        <span className="label">{visibleView === "points" ? "Coalition points" : "Coalition cluster time"}</span>
        <span className="kicker">{status === "ready" ? (visibleView === "points" ? "Official score / member" : "Total / active member") : status}</span>
      </header>
      <motion.div className="coalition-race__rows" key={visibleView} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        {rows.map((coalition, index) => (
          <CoalitionRow coalition={coalition} index={index} peak={peak} view={visibleView} key={coalition.id} />
        ))}
        {rows.length === 0 && <p className="campus-side__empty">Coalition mapping is unavailable for this snapshot.</p>}
      </motion.div>
    </section>
  );
}

function combineStatuses(
  first: Snapshot["campusActivity"]["coalitionScoreStatus"],
  second: Snapshot["campusActivity"]["coalitionContributorStatus"],
): Snapshot["campusActivity"]["coalitionScoreStatus"] {
  if (first === "ready" && second === "ready") return "ready";
  if (first === "collecting" && second === "collecting") return "collecting";
  return "partial";
}

function CoalitionRow({ coalition, index, peak, view }: {
  coalition: CoalitionTime;
  index: number;
  peak: number;
  view: CoalitionView;
}) {
  const pointsContributor = coalition.topPointsContributor;
  const timeContributor = coalition.topTimeContributor;
  const metric = view === "points" ? coalition.score ?? 0 : coalition.minutes;
  return (
    <div className="coalition-row">
      <span className="coalition-row__rank">{index + 1}</span>
      <div className="coalition-row__copy"><strong>{coalition.name}</strong><span>{coalition.activeMembers} active members</span></div>
      <div className="coalition-row__numbers">
        <strong className="num">{view === "points" ? coalition.score?.toLocaleString("en-US") ?? "—" : formatMinutes(coalition.minutes)}</strong>
        <span className="num">{view === "points" ? "points" : `${formatMinutes(coalition.minutesPerActiveMember)} avg`}</span>
      </div>
      {view === "points" ? (
        pointsContributor && (
          <div className="coalition-row__ship">
            <PersonAvatar student={pointsContributor.student} size={36} />
            <span>
              <b>{pointsContributor.student.displayName}</b>
              <small>
                Top contributor · {pointsContributor.points.toLocaleString("en-US")} points contributed
              </small>
            </span>
          </div>
        )
      ) : (
        <div className="coalition-row__ship">
          {timeContributor ? (
            <>
              <PersonAvatar student={timeContributor.student} size={36} />
              <span>
                <b>{timeContributor.student.displayName}</b>
                <small>
                  Top cluster time · {formatMinutes(timeContributor.minutes)} logged
                </small>
              </span>
            </>
          ) : (
            <span className="coalition-row__ship-empty">No cluster time recorded this week</span>
          )}
        </div>
      )}
      <div className="coalition-row__bar"><motion.i style={{ background: coalition.color }} initial={{ width: 0 }} animate={{ width: `${(metric / Math.max(1, peak)) * 100}%` }} /></div>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours}h ${String(rest).padStart(2, "0")}m` : `${hours}h`;
}
