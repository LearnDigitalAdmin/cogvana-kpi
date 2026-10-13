import { DocRecord } from "../../core/reader";
import { Metric } from "../../core/values";
import { num, pct } from "../../core/money";

/**
 * Class registers (`registers`, one record per class per school day).
 *
 * Two kinds of record exist and they must not be confused:
 *  - teacher-saved:  locked = true, savedBy = the teacher's name
 *  - system placeholder (noon job): locked = false, autoUnmarked = true, savedBy = "system"
 * Only teacher-saved registers count as activity.
 */
export const REGISTER_SELECT = ["schoolId", "locked", "autoUnmarked", "present", "late", "absent", "excused"];

export interface RegisterRow {
  schoolId: string | null;
  marked: boolean;
  autoUnmarked: boolean;
  present: number;
  late: number;
  absent: number;
  excused: number;
}

export function toRegisterRow(rec: DocRecord): RegisterRow {
  const d = rec.data;
  const autoUnmarked = d.autoUnmarked === true;
  return {
    schoolId: typeof d.schoolId === "string" && d.schoolId ? d.schoolId : null,
    // A teacher's save overwrites the placeholder without the flag, but guard anyway.
    marked: d.locked === true && !autoUnmarked,
    autoUnmarked,
    present: num(d.present) ?? 0,
    late: num(d.late) ?? 0,
    absent: num(d.absent) ?? 0,
    excused: num(d.excused) ?? 0,
  };
}

export function registerMetrics(rows: RegisterRow[]): Record<string, Metric> {
  const marked = rows.filter((r) => r.marked);
  const attended = marked.reduce((t, r) => t + r.present + r.late, 0);
  const absent = marked.reduce((t, r) => t + r.absent, 0);
  const excused = marked.reduce((t, r) => t + r.excused, 0);
  const pupils = attended + absent + excused;
  return {
    "register.registers_marked": { value: marked.length },
    "register.registers_auto_unmarked": { value: rows.filter((r) => !r.marked && r.autoUnmarked).length },
    "register.register_marking_rate": { value: pct(marked.length, rows.length), numerator: marked.length, denominator: rows.length },
    "register.students_attended": { value: attended },
    "register.students_absent": { value: absent },
    "register.students_excused": { value: excused },
    "register.attendance_rate": { value: pct(attended, pupils), numerator: attended, denominator: pupils },
  };
}

/** Schools with at least one teacher-marked register. */
export function markingSchools(rows: RegisterRow[]): Set<string> {
  const out = new Set<string>();
  for (const r of rows) if (r.marked && r.schoolId) out.add(r.schoolId);
  return out;
}
