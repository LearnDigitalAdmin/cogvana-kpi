import type { MouseEvent } from "react";

/** Small "i" badge; the caveat opens on hover, focus or tap. */
export function CaveatBadge({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <span className="badge" tabIndex={0} role="note" aria-label={`Caveat: ${text}`} onClick={(e: MouseEvent) => e.stopPropagation()}>
      i<span className="pop">{text}</span>
    </span>
  );
}
