import type { CSSProperties } from "react";
import type { StudentRef } from "@/lib/contract";
import styles from "./people.module.css";

type AvatarStudent = Pick<StudentRef, "login" | "displayName" | "image">;

const AVATAR_TINTS = [
  "#4f84ae",
  "#37886e",
  "#c84d2f",
  "#a97a22",
  "#745fa6",
  "#a8505a",
  "#458f86",
  "#aa6680",
] as const;

function tintFor(login: string): string {
  let hash = 0;
  for (let index = 0; index < login.length; index += 1) {
    hash = (hash * 31 + login.charCodeAt(index)) | 0;
  }
  return AVATAR_TINTS[Math.abs(hash) % AVATAR_TINTS.length];
}

function initials(student: AvatarStudent): string {
  const parts = student.displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return student.login.slice(0, 2).toUpperCase();
}

export function PersonAvatar({
  student,
  size,
  className,
  decorative = false,
}: {
  student: AvatarStudent;
  size: number | string;
  className?: string;
  decorative?: boolean;
}) {
  const title = `${student.displayName} (${student.login})`;
  const style = {
    "--avatar-size": typeof size === "number" ? `${size}px` : size,
    "--avatar-tint": tintFor(student.login),
  } as CSSProperties;

  return (
    <span
      className={`${styles.avatar}${className ? ` ${className}` : ""}`}
      style={style}
      title={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
    >
      {student.image ? (
        <img src={student.image} alt="" loading="lazy" referrerPolicy="no-referrer" />
      ) : (
        initials(student)
      )}
    </span>
  );
}
