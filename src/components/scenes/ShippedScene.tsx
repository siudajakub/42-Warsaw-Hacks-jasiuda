"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { AchievementKind, Celebration, Snapshot } from "@/lib/contract";
import { Count, Monogram, markTint, relTime } from "@/components/ui/primitives";
import { isExamProject, RANK_LABELS } from "@/lib/commoncore";
import { Empty, Frame, HeroFact } from "./Frame";
import { AvatarStack, PersonAvatar } from "@/components/people";
import { selectSpotlights } from "./shipped-select";

const ACHIEVEMENT_LABELS: Record<AchievementKind, string> = {
  first_core: "First Core project",
  exam: "Exam passed",
  perfect: "Perfect 125",
  first_try: "First try",
  team: "Team project",
  persistence: "Persistence paid off",
};

export function ShippedScene({ snapshot, paused = false, still = false }: {
  snapshot: Snapshot;
  paused?: boolean;
  still?: boolean;
}) {
  const all = snapshot.celebrations;
  const spotlights = useMemo(() => selectSpotlights(all), [all]);
  const [spotlightIndex, setSpotlightIndex] = useState(0);
  const hero = spotlights.length ? spotlights[spotlightIndex % spotlights.length] : undefined;
  const spotlightIds = useMemo(() => new Set(spotlights.map((row) => row.id)), [spotlights]);
  const projects = all.filter((celebration) => !isExam(celebration));
  const exams = all.filter(isExam);

  useEffect(() => {
    if (paused || still || spotlights.length < 2) return;
    const id = setInterval(() => setSpotlightIndex((index) => index + 1), 8_000);
    return () => clearInterval(id);
  }, [paused, still, spotlights.length]);

  return (
    <Frame
      title="Recent completions"
    >
      {!hero ? (
        <Empty
          title="Nothing validated in the window yet"
          hint={`No project has been marked at 42 ${snapshot.campus.name} in the last ${snapshot.windowDays} days. The wall will fill itself the moment one is.`}
        />
      ) : (
        <div className="shipped">
          <div className="shipped__spotlight">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={hero.id}
                className="shipped__spotlight-card"
                initial={still ? false : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: still ? 0 : 0.35 }}
              >
                <Hero celebration={hero} />
              </motion.div>
            </AnimatePresence>
            {spotlights.length > 1 && (
              <div className="shipped__spotlight-dots" aria-label="Student spotlights">
                {spotlights.map((row, index) => (
                  <i key={row.id} data-active={index === spotlightIndex % spotlights.length} />
                ))}
              </div>
            )}
          </div>
          <div className="shipped__streams">
            <CelebrationLane
              variant="project"
              title="Projects completed"
              celebrations={projects.filter((row) => !spotlightIds.has(row.id))}
              total={projects.length}
              windowDays={snapshot.windowDays}
            />
            <CelebrationLane
              variant="exam"
              title="Exams passed"
              celebrations={exams.filter((row) => !spotlightIds.has(row.id))}
              total={exams.length}
              windowDays={snapshot.windowDays}
            />
          </div>
        </div>
      )}
    </Frame>
  );
}

function isExam(celebration: Celebration): boolean {
  return isExamProject({
    id: celebration.projectId,
    name: celebration.projectName,
    slug: celebration.projectSlug,
  });
}

type CelebrationLaneProps = {
  variant: "project" | "exam";
  title: string;
  celebrations: Celebration[];
  total: number;
  windowDays: number;
};

function CelebrationLane({
  variant,
  title,
  celebrations,
  total,
  windowDays,
}: CelebrationLaneProps) {
  const reducedMotion = useReducedMotion();
  const visible = celebrations.slice(0, 6);
  const featuredOnly = total > 0 && visible.length === 0;

  return (
    <section className={`ship-lane ship-lane--${variant}`} aria-label={title}>
      <header className="ship-lane__head">
        <div className="ship-lane__title">{title}</div>
        <div className="ship-lane__total">
          <strong>{total}</strong>
          <span>{windowDays}d</span>
        </div>
      </header>

      <div className="ship-lane__list">
        {visible.map((celebration, index) => (
          <motion.article
            key={celebration.id}
            className={`ship-card ship-card--${variant}`}
            initial={reducedMotion ? false : { opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: reducedMotion ? 0 : 0.5,
              delay: reducedMotion ? 0 : 0.16 + index * 0.055,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Monogram student={celebration.student} size={3.85} />
            <div className="grow ship-card__copy">
              <div className="ship-card__project truncate">
                {celebration.projectName}
              </div>
              <div className="ship-card__meta truncate">
                {celebration.student.login}
                {variant === "project" && celebration.occurrence === 0 && (
                  <span className="badge badge--first ship-card__badge">1st try</span>
                )}
                {variant === "project" && celebration.teammates.length > 0 && (
                  <span className="badge badge--team ship-card__badge">
                    +{celebration.teammates.length}
                  </span>
                )}
                {variant === "exam" && celebration.rank !== null && (
                  <span className="badge badge--rank ship-card__badge">
                    Rank 0{celebration.rank}
                  </span>
                )}
                <span className="badge ship-card__badge">
                  {ACHIEVEMENT_LABELS[celebration.achievements[0] ?? "first_try"]}
                </span>
              </div>
            </div>
            <div className="ship-card__result">
              <div
                className="ship-card__mark"
                style={{ color: markTint(celebration.finalMark) }}
              >
                {celebration.finalMark}
              </div>
              <div className="ship-card__meta">{relTime(celebration.markedAt)}</div>
            </div>
          </motion.article>
        ))}

        {total === 0 && (
          <div className="ship-lane__empty">
            <strong>No {variant === "exam" ? "exam" : "project"} wins yet</strong>
            <span>This lane will update with the next validation.</span>
          </div>
        )}
        {featuredOnly && (
          <div className="ship-lane__empty">
            <strong>The latest completion is featured</strong>
            <span>It is featured in the large card on the left.</span>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- hero */

function Hero({ celebration: c }: { celebration: Celebration }) {
  const perfect = c.finalMark >= 120;
  const exam = isExam(c);

  return (
    <div className="panel panel--ticked shipped__hero">
      {perfect && <Confetti />}

      <div className="shipped__portrait-story">
        <div className="shipped__portrait-wrap">
          <PersonAvatar student={c.student} size={216} />
          <MarkRing mark={c.finalMark} />
        </div>
        <div className="shipped__story-copy">
          <div className="row shipped__achievement-row">
            <span className="badge" style={{ color: "#fff", background: "var(--flame)" }}>
              Student spotlight
            </span>
            {c.achievements.map((kind) => (
              <span className={`badge badge--achievement badge--achievement-${kind}`} key={kind}>
                {ACHIEVEMENT_LABELS[kind]}
              </span>
            ))}
          </div>

          <motion.h3
            className="shipped__name shipped__name--hero"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {c.student.displayName}
          </motion.h3>
          <p className="shipped__statement">
            {exam ? "passed" : "completed"} <strong>{c.projectName}</strong>
          </p>
          <p className="shipped__meta">
            {c.student.login} · level {c.student.level.toFixed(2)} · {relTime(c.markedAt)}
            {c.rank !== null && ` · ${RANK_LABELS[c.rank]?.split(" — ")[1] ?? `Rank 0${c.rank}`}`}
          </p>
          {c.teammates.length > 0 && (
            <div className="shipped__team">
              <AvatarStack celebration={c} maxVisible={3} size={38} />
              <span>completed together</span>
            </div>
          )}
        </div>
      </div>

      <div className="shipped__stats">
        <HeroFact
          label="Worth"
          value={c.xp > 0 ? c.xp.toLocaleString("en-US") : "PASS"}
          unit={c.xp > 0 ? "XP" : exam ? "exam passed" : "project validated"}
        />
        <HeroFact
          label="Attempt"
          value={String(c.occurrence + 1)}
          unit={c.occurrence === 0 ? "no retries" : "persistence paid off"}
        />
        <HeroFact
          label={exam ? "Gate" : "Team"}
          value={exam && c.rank !== null ? `R0${c.rank}` : String(c.teammates.length + 1)}
          unit={exam ? "Common Core rank" : c.teammates.length ? "on the repo" : "solo"}
        />
      </div>
    </div>
  );
}

function MarkRing({ mark }: { mark: number }) {
  const R = 34;
  const circumference = 2 * Math.PI * R;
  const frac = Math.min(1, mark / 125);
  const tint = markTint(mark);

  return (
    <div className="markring" style={{ width: "5.5rem", height: "5.5rem" }}>
      <svg viewBox="0 0 80 80" style={{ width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
        <circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke="var(--line)"
          strokeWidth="5"
        />
        <motion.circle
          cx="40"
          cy="40"
          r={R}
          fill="none"
          stroke={tint}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - frac) }}
          transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
        />
      </svg>
      <span className="markring__value" style={{ color: tint, fontSize: "1.6rem" }}>
        <Count value={mark} />
      </span>
    </div>
  );
}

/**
 * Deterministic confetti. Positions derive from the index rather than
 * Math.random() so the server-rendered markup matches the client's and React
 * doesn't throw a hydration mismatch on the first paint.
 */
const CONFETTI_TINTS = ["#e85b36", "#e2ae4c", "#55b997", "#78aedd", "#9a82cf"];

function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {Array.from({ length: 26 }, (_, i) => {
        const left = ((i * 37) % 100) + (i % 3);
        const delay = ((i * 13) % 70) / 10;
        const duration = 4.2 + ((i * 7) % 26) / 10;
        const drift = ((i % 5) - 2) * 2.4;
        return (
          <span
            key={i}
            style={{
              left: `${left}%`,
              animationDelay: `${delay}s`,
              animationDuration: `${duration}s`,
              background: CONFETTI_TINTS[i % CONFETTI_TINTS.length],
              ["--dx" as string]: `${drift}rem`,
              borderRadius: i % 4 === 0 ? "50%" : "1px",
            }}
          />
        );
      })}
    </div>
  );
}
