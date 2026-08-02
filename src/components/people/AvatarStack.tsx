import type { CSSProperties } from "react";
import type { Celebration } from "@/lib/contract";
import { avatarStackEntries } from "./helpers";
import { PersonAvatar } from "./PersonAvatar";
import styles from "./people.module.css";

export function AvatarStack({
  celebration,
  maxVisible = 4,
  size = 36,
}: {
  celebration: Pick<Celebration, "teamMembers" | "teammates">;
  maxVisible?: number;
  size?: number;
}) {
  const selection = avatarStackEntries(celebration, maxVisible);
  if (selection.total === 0) return null;
  const style = { "--stack-size": `${size}px` } as CSSProperties;

  return (
    <div
      className={styles.avatarStack}
      style={style}
      aria-label={`${selection.total} teammate${selection.total === 1 ? "" : "s"}`}
    >
      {selection.visible.map((entry) =>
        entry.kind === "student" ? (
          <PersonAvatar
            className={styles.avatarStackItem}
            key={entry.key}
            size={size}
            student={entry.student}
          />
        ) : (
          <span className={styles.loginAvatar} key={entry.key} title={entry.login}>
            {entry.login.slice(0, 2)}
          </span>
        ),
      )}
      {selection.overflow > 0 && (
        <span className={styles.avatarOverflow} title={`${selection.overflow} more teammates`}>
          +{selection.overflow}
        </span>
      )}
    </div>
  );
}
