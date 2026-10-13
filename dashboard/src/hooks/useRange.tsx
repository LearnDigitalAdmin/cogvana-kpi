import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import type { Grain } from "../lib/types";
import { defaultPreset, isIsoDay, presetsFor, previousRange, todayNairobi, validateRange, type Preset } from "../lib/nairobi";

interface RangeState {
  grain: Grain; from: string; to: string; today: string;
  prevFrom: string; prevTo: string;
  presets: Preset[]; activePreset: string;
  setGrain: (g: Grain) => void;
  setRange: (from: string, to: string) => void;
}
const Ctx = createContext<RangeState | null>(null);
const GRAINS: Grain[] = ["daily", "weekly", "monthly"];

export function RangeProvider({ children }: { children: ReactNode }) {
  const [sp, setSp] = useSearchParams();
  const today = todayNairobi();
  const value = useMemo<RangeState>(() => {
    const g = sp.get("grain") as Grain | null;
    const grain: Grain = g && GRAINS.includes(g) ? g : "daily";
    const f = sp.get("from"), t = sp.get("to");
    const fallback = defaultPreset(grain, today);
    const ok = isIsoDay(f) && isIsoDay(t) && validateRange(f, t, today) === null;
    const from = ok ? (f as string) : fallback.from;
    const to = ok ? (t as string) : fallback.to;
    const presets = presetsFor(grain, today);
    const prev = previousRange(from, to);
    const write = (g2: Grain, f2: string, t2: string) => {
      const next = new URLSearchParams(sp);
      next.set("grain", g2); next.set("from", f2); next.set("to", t2);
      setSp(next, { replace: false });
    };
    return {
      grain, from, to, today, prevFrom: prev.from, prevTo: prev.to, presets,
      activePreset: presets.find((p) => p.from === from && p.to === to)?.id ?? "custom",
      setGrain: (g2) => { const p = defaultPreset(g2, today); write(g2, p.from, p.to); },
      setRange: (f2, t2) => write(grain, f2, t2),
    };
  }, [sp, setSp, today]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRange(): RangeState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useRange outside RangeProvider");
  return v;
}
