import { describe, expect, it } from "vitest";
import { DAY, MemoryPayReader, NOW, T_DAY } from "./helpers";
import { createCyberCollector, snapshotCyber, toUsage, usageMetrics } from "../src/collectors/cyber";
import { dailyPeriod } from "../src/core/period";
import { KpiValue } from "../src/core/types";

const find = (v: KpiValue[], id: string, grain = "daily") => v.find((x) => x.kpiId === id && x.grain === grain);
const sec = (ms: number) => Math.floor(ms / 1000);

describe("meter parsing", () => {
  it("reads counters and counts hashed users", () => {
    const u = toUsage({ inbound: 10, outbound: 12, outboundFailed: 2, sessionsStarted: 4, users: { a: true, b: true } });
    expect(u.users.size).toBe(2);
    const m = usageMetrics(u);
    expect(m["cyber.wa_delivery_success_rate"]).toMatchObject({ value: 83.33, numerator: 10, denominator: 12 });
  });
  it("omits the success rate when nothing was sent", () => {
    expect(usageMetrics(toUsage({ inbound: 3 }))["cyber.wa_delivery_success_rate"]).toBeUndefined();
  });
});

describe("Cyber collector (WhatsApp usage only)", () => {
  it("without the meter: only the approximate KPI exists; exact KPIs are ABSENT, not zero", async () => {
    const r = new MemoryPayReader()
      .add("default", "whatsapp_sessions/s1", { lastActive: sec(T_DAY), createdAt: sec(T_DAY) })
      .add("default", "whatsapp_sessions/s2", { lastActive: sec(T_DAY + 1000), createdAt: sec(T_DAY - 50_000_000) })
      .add("default", "whatsapp_sessions/s3", { lastActive: sec(T_DAY - 3 * 86_400_000) });
    const vals = await createCyberCollector(r).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(vals).toHaveLength(1);
    expect(find(vals, "cyber.wa_users_seen")!.value).toBe(2);
    expect(vals.some((v) => v.kpiId === "cyber.wa_messages_in")).toBe(false);
  });

  it("with the meter: exact daily, weekly and monthly values", async () => {
    const r = new MemoryPayReader()
      .add("default", `whatsapp_usage/${DAY}`, { inbound: 40, outbound: 50, outboundFailed: 5, sessionsStarted: 12, users: { h1: true, h2: true, h3: true } })
      .add("default", "whatsapp_usage/2026-09-28", { inbound: 10, users: { h3: true, h4: true } }) // same week, one repeat user
      .add("default", "whatsapp_usage/2026-09-02", { inbound: 5, users: { h9: true } }); // same month, other week
    const vals = await createCyberCollector(r).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(find(vals, "cyber.wa_messages_in")!.value).toBe(40);
    expect(find(vals, "cyber.wa_messages_out")!.value).toBe(50);
    expect(find(vals, "cyber.wa_messages_out_failed")!.value).toBe(5);
    expect(find(vals, "cyber.wa_sessions_started")!.value).toBe(12);
    expect(find(vals, "cyber.wa_delivery_success_rate")).toMatchObject({ value: 90, numerator: 45, denominator: 50 });
    expect(find(vals, "cyber.wa_users_active")!.value).toBe(3);
    expect(find(vals, "cyber.wa_users_active", "weekly")).toMatchObject({ value: 4, periodStart: "2026-09-28" }); // h1,h2,h3,h4
    expect(find(vals, "cyber.wa_users_active", "monthly")!.value).toBe(5); // + h9
  });

  it("no meter documents in a week means no weekly value", async () => {
    const vals = await createCyberCollector(new MemoryPayReader()).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(find(vals, "cyber.wa_users_active", "weekly")).toBeUndefined();
  });

  it("snapshot counts session documents without reading them", async () => {
    const r = new MemoryPayReader().add("default", "whatsapp_sessions/a", { phoneNumber: "0700" }).add("default", "whatsapp_sessions/b", {});
    const [v] = await snapshotCyber(r, NOW, "snap");
    expect(v).toMatchObject({ kpiId: "cyber.wa_known_users", value: 2, complete: false });
    expect(r.queries).toHaveLength(0);
  });

  it("the meter read selects only counters and the users map", async () => {
    const r = new MemoryPayReader();
    await createCyberCollector(r).collect({ period: dailyPeriod(DAY), runId: "t", now: NOW });
    expect(r.counts.every((c) => c.collection === "whatsapp_sessions")).toBe(true);
  });
});
