import type { ReactNode } from "react";
import { CaveatBadge } from "./CaveatBadge";

export function ChartCard({ title, subtitle, caveat, onDetails, children }: { title: string; subtitle?: string; caveat?: string; onDetails?: () => void; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <div>
          <h3>{title} <CaveatBadge text={caveat} /></h3>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        {onDetails && <button className="btn btn-ghost" onClick={onDetails}>Details</button>}
      </header>
      {children}
    </section>
  );
}
