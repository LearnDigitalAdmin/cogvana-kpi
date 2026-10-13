import type { ReactNode } from "react";

export function EmptyState({ children = "Not measured in this range", compact }: { children?: ReactNode; compact?: boolean }) {
  return <div className={compact ? "empty empty-compact" : "empty"}>{children}</div>;
}

export function Skeleton({ h = 120 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h }} aria-busy="true" />;
}
