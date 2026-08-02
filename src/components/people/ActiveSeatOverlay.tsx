import type { CSSProperties } from "react";
import type { ActiveSeatIdentity } from "@/lib/contract";
import {
  layoutActiveSeats,
  pixelPointFromNormalized,
  type NormalizedPoint,
  type PixelPoint,
} from "./helpers";
import { PersonAvatar } from "./PersonAvatar";
import styles from "./people.module.css";

interface ActiveSeatOverlayProps {
  activeSeats: readonly ActiveSeatIdentity[];
  /** Pixel width of the map coordinate space. */
  width: number;
  /** Pixel height of the map coordinate space. */
  height: number;
  /** Takes precedence over `normalizedPositions` and returns map-space pixels. */
  positionForHost?: (host: string) => PixelPoint | null | undefined;
  /** Host positions in a 0..1 coordinate space, scaled by width and height. */
  normalizedPositions?: Readonly<Record<string, NormalizedPoint>>;
  avatarSize?: number | string;
  paused?: boolean;
  still?: boolean;
  className?: string;
}

export function ActiveSeatOverlay({
  activeSeats,
  width,
  height,
  positionForHost,
  normalizedPositions,
  avatarSize = 20,
  paused = false,
  still = false,
  className,
}: ActiveSeatOverlayProps) {
  if (width <= 0 || height <= 0) return null;

  const resolveAnchor = (host: string): PixelPoint | null | undefined => {
    const direct = positionForHost?.(host);
    if (direct) return direct;
    const normalized = normalizedPositions?.[host] ?? normalizedPositions?.[host.toLowerCase()];
    return normalized ? pixelPointFromNormalized(normalized, width, height) : null;
  };
  const seats = layoutActiveSeats(activeSeats, resolveAnchor, width, height);

  return (
    <div
      className={`${styles.seatOverlay}${className ? ` ${className}` : ""}`}
      data-paused={paused || undefined}
      data-still={still || undefined}
      aria-label={`${seats.length} active student avatars on the campus map`}
    >
      {seats.map((entry) => (
        <span
          className={styles.seatAvatar}
          key={entry.seat.host}
          data-host={entry.seat.host.toLowerCase()}
          style={
            {
              left: `${(entry.x / width) * 100}%`,
              top: `${(entry.y / height) * 100}%`,
            } as CSSProperties
          }
        >
          <PersonAvatar student={entry.seat.student} size={avatarSize} decorative />
        </span>
      ))}
    </div>
  );
}
