import { Link } from "react-router-dom";
import { useFreshness } from "../hooks/useFreshness";
import { formatHours } from "../lib/format";

/** Red if any collector > 26 h or a required collector has no reading; amber 12–26 h; hidden when fresh. */
export function FreshnessBanner() {
  const f = useFreshness();
  if (f.isLoading || f.isError || f.level === "ok") return null;
  const missing = f.rows.filter((r) => r.hours === null && ["pay", "register", "chama", "pms", "cyber", "rollups"].includes(r.collector)).map((r) => r.collector);
  const old = f.rows.filter((r) => r.hours !== null && r.hours >= 12).map((r) => `${r.collector} ${formatHours(r.hours as number)}`);
  const parts = [old.length ? `Behind: ${old.join(", ")}` : "", missing.length ? `No reading: ${missing.join(", ")}` : ""].filter(Boolean).join(". ");
  return (
    <Link to="/health" className={`banner banner-${f.level}`}>
      <strong>{f.level === "red" ? "Data may be out of date." : "Data is getting stale."}</strong> {parts} <span className="underline">Open Data health</span>
    </Link>
  );
}
