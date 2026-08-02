import type { CSSProperties } from "react";
import type { Snapshot } from "@/lib/contract";
import styles from "./people.module.css";

interface HighlightMetricProps {
  label: string;
  value: number | string;
  previous?: number;
  subtext?: string;
  tint: string;
}

function HighlightMetric({ label, value, previous, subtext, tint }: HighlightMetricProps) {
  return (
    <div
      className={styles.highlightsMetric}
      style={{ "--metric-tint": tint } as CSSProperties}
    >
      <strong>{typeof value === "number" ? value.toLocaleString("en-US") : value}</strong>
      <span>
        {label}
        {previous !== undefined && (
          <small>{previous.toLocaleString("en-US")} prev</small>
        )}
        {subtext !== undefined && (
          <small>{subtext}</small>
        )}
      </span>
    </div>
  );
}

export function HighlightsStrip({ snapshot }: { snapshot: Snapshot }) {
  const { weekly, campusActivity } = snapshot;
  const topProject = weekly.topProject;
  return (
    <aside className={styles.highlightsStrip} aria-label="Community highlights this week">
      <div className={styles.highlightsLabel}>This week</div>
      <HighlightMetric
        label="validations"
        value={weekly.current.validations}
        previous={weekly.previous.validations}
        tint="#378f77"
      />
      <HighlightMetric
        label="top project"
        value={topProject?.name ?? "—"}
        subtext={topProject ? `${topProject.count} ${topProject.count === 1 ? "validation" : "validations"}` : undefined}
        tint="#e85b36"
      />
      <HighlightMetric
        label="peer evals completed"
        value={weekly.current.evaluations}
        previous={weekly.previous.evaluations}
        tint="#5d97c7"
      />
      <HighlightMetric
        label="exams passed"
        value={weekly.current.exams}
        previous={weekly.previous.exams}
        tint="#876bc5"
      />
      <HighlightMetric
        label="online now"
        value={campusActivity.currentOccupancy}
        tint="#378f77"
      />
    </aside>
  );
}
