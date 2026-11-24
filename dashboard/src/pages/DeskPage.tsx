import { GroupedChart } from "../components/GroupedChart";
import { KpiSection } from "../components/KpiSection";
import { useKpiValues } from "../hooks/useKpiValues";
import { PAY_SECTION_TITLE, PAY_TILES, STREAM_ORDER } from "../lib/layouts";

/**
 * Samuhia Desk: the agent network (desk.*) and the WhatsApp bot (cyber.*). Both are stored under platform "cyber".
 * Self-contained: it does not need an entry in lib/layouts.ts.
 */
const NETWORK = ["desk.agents_active", "desk.agents_working", "desk.customers_served"];
const GROUPS: { title: string; ids: string[] }[] = [
  { title: "Agents and customers", ids: ["desk.agents", "desk.agents_applied", "desk.customers_owned", "desk.customers_first_purchase_done"] },
  { title: "Work sessions", ids: ["desk.sessions_started", "desk.sessions_verified", "desk.session_verify_rate"] },
  { title: "Paid services", ids: ["desk.tickets_created", "desk.tickets_paid", "desk.ticket_conversion", "desk.tickets_paid_not_committed", "desk.tickets_failed", "desk.service_sales", "desk.service_platform_revenue"] },
  { title: "Sales through desk-owned customers", ids: ["desk.attributed_sales", "desk.attributed_gmv", "desk.agent_share_paid", "desk.net_kept_by_samuhia", "desk.refunds", "desk.sms_credits_sold"] },
  { title: "Agent earnings and payouts", ids: ["desk.agent_earnings", "desk.reversals", "desk.payable_outstanding", "desk.payouts_processing"] },
  { title: "Support", ids: ["desk.support_visits_logged", "desk.support_visits_confirmed", "desk.support_confirm_rate", "desk.requests_new", "desk.requests_answered", "desk.requests_open"] },
  { title: "Rent collection by desks", ids: ["desk.rent_batches", "desk.rent_stk_sent", "desk.rent_stk_failed"] },
  { title: "WhatsApp bot", ids: ["cyber.wa_users_active", "cyber.wa_messages_in", "cyber.wa_messages_out", "cyber.wa_messages_out_failed", "cyber.wa_delivery_success_rate", "cyber.wa_sessions_started", "cyber.wa_users_seen", "cyber.wa_known_users"] },
  { title: "Not collected yet", ids: ["cyber.shops_total", "cyber.shops_new", "cyber.sales_recorded", "cyber.sales_value", "cyber.expenses_recorded", "cyber.reports_generated", "cyber.report_jobs_failed"] },
];
/** Which dimension each tile's breakdown chart uses. */
const BREAKDOWNS: Record<string, string> = {
  "desk.agents": "status", "desk.customers_owned": "product", "desk.sessions_started": "product",
  "desk.tickets_created": "serviceType", "desk.tickets_paid": "serviceType", "desk.service_sales": "serviceType",
  "desk.attributed_sales": "product", "desk.attributed_gmv": "product", "desk.agent_share_paid": "product", "desk.net_kept_by_samuhia": "product",
  "desk.agent_earnings": "kind", "desk.support_visits_logged": "category", "desk.requests_new": "source", "desk.requests_open": "status",
};

function PaySection() {
  const data = useKpiValues(PAY_TILES, { platform: "cyber" });
  return (
    <KpiSection title={PAY_SECTION_TITLE} ids={PAY_TILES} platform="cyber" data={data}>
      <GroupedChart data={data} kpiId="pay.net_revenue" platform="cyber" by={{ dim: "stream" }} order={STREAM_ORDER} title="Net revenue by stream" emptyText="No stream breakdown in this range" />
    </KpiSection>
  );
}

export default function DeskPage() {
  return (
    <>
      <h1>Samuhia Desk</h1>
      <div className="box box-info">
        Agent network and WhatsApp bot. Desk charges for paid services are the same money as the Cyber charges in the PAY section below, and
        desk-attributed sales are a subset of PAY's sales: do not add them. Agents' automatic split is not subtracted from the PAY net revenue; see "Paid to agents by split".
      </div>
      <KpiSection ids={NETWORK} hero breakdowns={BREAKDOWNS} />
      {GROUPS.map((g, i) => (
        <KpiSection key={g.title} title={g.title} ids={g.ids} planned={i === GROUPS.length - 1} breakdowns={BREAKDOWNS} />
      ))}
      <PaySection />
    </>
  );
}
