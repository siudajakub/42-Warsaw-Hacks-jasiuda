"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "motion/react";
import type { Snapshot, SnapshotResponse } from "@/lib/contract";
import { dashboardStatus } from "@/lib/pipeline/diagnostics";
import { SCENE_SCHEDULE, type SceneId } from "@/lib/scene-schedule";
import { SnapshotTime } from "@/components/ui/primitives";
import { HighlightsStrip } from "@/components/people";
import { ShippedScene } from "@/components/scenes/ShippedScene";
import { ConnectScene } from "@/components/scenes/ConnectScene";
import { CampusScene } from "@/components/scenes/CampusScene";

interface SceneProps {
  snapshot: Snapshot;
  /** Only the overview scene shows the cadence, but every scene may have it. */
  refreshSeconds?: number;
  paused?: boolean;
  still?: boolean;
}

const COMPONENTS: Record<SceneId, ComponentType<SceneProps>> = {
  shipped: ShippedScene,
  connect: ConnectScene,
  campus: CampusScene,
};

const SCENES = SCENE_SCHEDULE.map((scene) => ({
  ...scene,
  Component: COMPONENTS[scene.id],
}));

export function Wall({
  initial,
  initialStale,
  refreshSeconds,
  still = false,
  initialScene = null,
}: {
  initial: Snapshot;
  initialStale: boolean;
  refreshSeconds: number;
  /** `?still=1` — kill every entry animation. See page.tsx. */
  still?: boolean;
  /** `?scene=N` (1-3) — open and hold one scene. */
  initialScene?: SceneId | null;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [stale, setStale] = useState(initialStale);
  const initialIndex = initialScene
    ? Math.max(0, SCENES.findIndex((scene) => scene.id === initialScene))
    : 0;
  const [index, setIndex] = useState(initialIndex);
  const [paused, setPaused] = useState(initialScene !== null);
  const [busy, setBusy] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  // Bumped on every scene entry so the progress bar restarts its animation.
  const [cycle, setCycle] = useState(0);

  /* ------------------------------------------------------------ rotation */

  const go = useCallback((delta: number) => {
    setIndex((i) => (i + delta + SCENES.length) % SCENES.length);
    setCycle((c) => c + 1);
  }, []);

  const sceneDuration = SCENES[index].durationSeconds;

  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => go(1), sceneDuration * 1000);
    return () => clearTimeout(id);
  }, [index, paused, sceneDuration, go, cycle]);

  /* -------------------------------------------------------------- polling */

  const pull = useCallback(async (force: boolean) => {
    setBusy(true);
    try {
      const res = await fetch(force ? "/api/refresh" : "/api/snapshot", {
        method: force ? "POST" : "GET",
        cache: "no-store",
      });
      const body = (await res.json()) as SnapshotResponse;
      if (body.ok && body.snapshot) {
        setSnapshot(body.snapshot);
        setStale(body.stale);
      }
    } catch {
      // Offline TV: keep showing what we have rather than blanking the wall.
      setStale(true);
    } finally {
      setBusy(false);
    }
  }, []);

  // Poll a little faster than the server rebuilds, so a new snapshot reaches
  // the glass within ~30s of being built.
  useEffect(() => {
    const period = Math.max(20, Math.round(refreshSeconds / 3)) * 1000;
    const id = setInterval(() => void pull(false), period);
    return () => clearInterval(id);
  }, [pull, refreshSeconds]);

  /* ------------------------------------------------------- keyboard remote */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // `code` is layout-independent and unambiguous for the space bar; `key`
      // is " " on real hardware but varies across remotes and HID adapters.
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
        return;
      }
      switch (e.key.toLowerCase()) {
        case "arrowright":
          go(1);
          break;
        case "arrowleft":
          go(-1);
          break;
        // Browsers report the space bar as " ", but remotes and automation
        // drivers often send the key name instead. Accept both.
        case " ":
        case "space":
        case "spacebar":
          e.preventDefault();
          setPaused((p) => !p);
          break;
        case "r":
          void pull(true);
          break;
        case "f":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen().catch(() => {});
          break;
        default:
          if (/^[1-3]$/.test(e.key)) {
            setIndex(Number(e.key) - 1);
            setCycle((c) => c + 1);
          }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, pull]);

  /* ----------------------------------------------------------------- view */

  const Active = SCENES[index].Component;
  const status = useMemo(() => dashboardStatus(snapshot, stale), [snapshot, stale]);
  const statusDiagnostics = useMemo(
    () => snapshot.diagnostics.filter((item) => item.severity !== "info"),
    [snapshot.diagnostics],
  );
  const statusTitle = statusDiagnostics.map((item) => item.message).join("\n\n");

  return (
    <MotionConfig reducedMotion={still ? "always" : "user"}>
    <main className="shell">
      <div className="bg" />

      <header className="header">
        <div className="brand" aria-label="42 Warsaw Highlights">
          <img
            className="brand__logo"
            src="/brand/42-warsaw.png"
            alt="42 Warsaw"
            width="376"
            height="245"
          />
          <span className="brand__divider" aria-hidden="true" />
          <span className="brand__word">Highlights</span>
        </div>

        <nav className="rail" aria-label="Scenes">
          {SCENES.map((scene, i) => (
            <button
              key={scene.id}
              className="rail__item"
              data-active={i === index}
              onClick={(e) => {
                setIndex(i);
                setCycle((c) => c + 1);
                // Otherwise the rail button keeps focus and swallows Space.
                e.currentTarget.blur();
              }}
            >
              {i === index && !paused && !prefersReducedMotion && (
                <motion.span
                  key={cycle}
                  className="rail__fill"
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: scene.durationSeconds, ease: "linear" }}
                />
              )}
              <span className="rail__dot" />
              <span className="rail__label">{scene.label}</span>
            </button>
          ))}
        </nav>

        <div className="status">
          {paused && <span className="pill">Paused</span>}

          {status === "ERROR" ? (
            <span className="pill pill--warn" title={statusTitle}>
              <span className="beacon" />
              API error
            </span>
          ) : status === "PARTIAL" ? (
            <span className="pill pill--warn" title={statusTitle}>
              <span className="beacon" />
              Partial · {statusDiagnostics.length}
            </span>
          ) : status === "STALE" ? (
            <span className="pill pill--warn" title={statusTitle}>
              <span className="beacon" />
              Stale · last good
            </span>
          ) : (
            <span className="pill pill--live">
              <span className="beacon" />
              Live
            </span>
          )}

          <SnapshotTime
            generatedAt={snapshot.generatedAt}
            timeZone={snapshot.campus.timeZone}
          />

          <button
            className="refresh"
            data-busy={busy}
            onClick={() => void pull(true)}
            aria-label="Refresh data"
            title="Operator refresh from the 42 API (keyboard: R)"
          >
            <RefreshIcon />
          </button>
        </div>
      </header>

      <HighlightsStrip snapshot={snapshot} />

      <div className="stage">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={SCENES[index].id}
            className="scene"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -18 }}
            // MotionConfig's reducedMotion drops transforms but keeps opacity,
            // which still leaves a cross-fade. Still mode means still.
            transition={{
              duration: still || prefersReducedMotion ? 0 : 0.5,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Active
              snapshot={snapshot}
              refreshSeconds={refreshSeconds}
              paused={paused}
              still={still}
            />
          </motion.div>
        </AnimatePresence>
      </div>

    </main>
    </MotionConfig>
  );
}

function RefreshIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
