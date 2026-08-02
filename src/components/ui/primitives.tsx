"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "motion/react";
import type { StudentRef } from "@/lib/contract";

/* ---------------------------------------------------------------- monogram */

type MonogramStudent = Pick<StudentRef, "login" | "displayName" | "image">;

const MONO_TINTS = [
  "#4f84ae",
  "#37886e",
  "#c84d2f",
  "#a97a22",
  "#745fa6",
  "#a8505a",
  "#458f86",
  "#aa6680",
];

/** Stable per-login tint so the same person is the same colour on every scene. */
function tintFor(login: string): string {
  let h = 0;
  for (let i = 0; i < login.length; i++) h = (h * 31 + login.charCodeAt(i)) | 0;
  return MONO_TINTS[Math.abs(h) % MONO_TINTS.length];
}

function initials(student: MonogramStudent): string {
  const parts = student.displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return parts[0][0] + parts[parts.length - 1][0];
  return student.login.slice(0, 2);
}

export function Monogram({
  student,
  size,
}: {
  student: MonogramStudent;
  size: number;
}) {
  const tint = tintFor(student.login);
  return (
    <div
      className="mono"
      style={{
        width: `${size}rem`,
        height: `${size}rem`,
        fontSize: `${size * 0.36}rem`,
        background: `linear-gradient(150deg, ${tint}2e, ${tint}0d)`,
        borderColor: `${tint}55`,
        color: tint,
      }}
      title={`${student.displayName} (${student.login})`}
    >
      {student.image ? (
        <img src={student.image} alt="" loading="lazy" />
      ) : (
        initials(student)
      )}
    </div>
  );
}

/** True when animations should be skipped entirely — see Wall's `?still=1`. */
function isStill(): boolean {
  if (typeof window === "undefined") return false;
  return (
    new URLSearchParams(window.location.search).has("still") ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

/* ----------------------------------------------------------------- counter */

/**
 * Odometer for headline numbers. Animates on mount and whenever the value
 * changes after a refresh, so the wall visibly reacts to new data.
 */
export function Count({
  value,
  decimals = 0,
  duration = 1.4,
  prefix = "",
  suffix = "",
}: {
  value: number;
  decimals?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const inView = useInView(ref, { once: false });

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView) return;
    const start = from.current;
    from.current = value;

    // MotionConfig cannot reach an imperative animate() call, so the still
    // flag and the OS reduced-motion setting are checked here directly.
    if (isStill()) {
      node.textContent =
        prefix +
        value.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
        }) +
        suffix;
      return;
    }

    const controls = animate(start, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate(v) {
        node.textContent =
          prefix +
          v.toLocaleString("en-US", {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }) +
          suffix;
      },
    });
    return () => controls.stop();
  }, [value, decimals, duration, prefix, suffix, inView]);

  return (
    <span ref={ref} className="num">
      {prefix}
      {value.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}

/* ---------------------------------------------------------- snapshot time */

export function formatSnapshotTime(generatedAt: string, timeZone: string): string {
  const capturedAt = new Date(generatedAt);
  if (!Number.isFinite(capturedAt.getTime())) return "--:--";

  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(capturedAt);
  } catch {
    return "--:--";
  }
}

export function SnapshotTime({
  generatedAt,
  timeZone,
}: {
  generatedAt: string;
  timeZone: string;
}) {
  return (
    <div className="status__snapshot" title={`Snapshot captured at ${generatedAt}`}>
      <span>Data</span>
      <strong>{formatSnapshotTime(generatedAt, timeZone)}</strong>
    </div>
  );
}

/* ------------------------------------------------------------------- misc */

export function relTime(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(diff)) return "";
  if (diff < 90) return "just now";
  const mins = Math.round(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function markTint(mark: number): string {
  if (mark >= 120) return "var(--gold)";
  if (mark >= 110) return "var(--live)";
  if (mark >= 100) return "var(--sky)";
  return "var(--fg-dim)";
}
