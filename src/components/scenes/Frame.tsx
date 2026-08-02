import type { ReactNode } from "react";

/** Shared chrome for the three public TV scenes. */
export function Frame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="scene__head">
        <h2 className="scene__title">{title}</h2>
      </div>
      <div className="scene__body">{children}</div>
    </>
  );
}

/** A single fact in a hero panel's stat strip. Three of these fill the dead
 *  space between a hero headline and the person it belongs to. */
export function HeroFact({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="hero-fact">
      <span className="kicker">{label}</span>
      <span className="hero-fact__value num">{value}</span>
      <span className="hero-fact__unit">{unit}</span>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      <p className="label" style={{ maxWidth: "32rem", lineHeight: 1.6 }}>
        {hint}
      </p>
    </div>
  );
}
