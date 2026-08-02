import type {
  DashboardStatus,
  DataDiagnostic,
  DiagnosticScope,
  DiagnosticSeverity,
  Snapshot,
} from "@/lib/contract";

export function diagnostic(
  code: string,
  scope: DiagnosticScope,
  severity: DiagnosticSeverity,
  message: string,
  fallbackActive: boolean,
  observedAt: Date | string,
): DataDiagnostic {
  return {
    code,
    scope,
    severity,
    message,
    fallbackActive,
    observedAt: typeof observedAt === "string" ? observedAt : observedAt.toISOString(),
  };
}

export function validDiagnostic(value: unknown): value is DataDiagnostic {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DataDiagnostic>;
  return (
    typeof item.code === "string" &&
    typeof item.scope === "string" &&
    ["info", "warning", "error"].includes(item.severity ?? "") &&
    typeof item.message === "string" &&
    typeof item.fallbackActive === "boolean" &&
    typeof item.observedAt === "string" &&
    Number.isFinite(Date.parse(item.observedAt))
  );
}

export function dashboardStatus(snapshot: Snapshot | null, stale = false): DashboardStatus {
  if (!snapshot) return "ERROR";
  const diagnostics = snapshot.diagnostics ?? [];
  if (stale || diagnostics.some((item) => item.code === "refresh_failed")) return "STALE";
  if (diagnostics.some((item) => item.severity === "error")) return "ERROR";
  if (diagnostics.some((item) => item.severity === "warning")) return "PARTIAL";
  return "LIVE";
}
