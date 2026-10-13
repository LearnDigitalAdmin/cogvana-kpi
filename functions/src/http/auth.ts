import { HttpsError, CallableRequest } from "firebase-functions/v2/https";

export type KpiRole = "admin" | "analyst" | "finance";

/**
 * Seam 4 guard. Roles are Firebase custom claims (`role`), set once by a trusted
 * script. v1 only needs `admin`; the other roles exist so the later RBAC design
 * extends this instead of replacing it.
 */
export function assertRole(request: CallableRequest<unknown>, allowed: KpiRole[]): void {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
  const role = request.auth.token.role;
  if (typeof role !== "string" || !(allowed as string[]).includes(role)) {
    throw new HttpsError("permission-denied", "Not allowed.");
  }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertDay(value: unknown, field: string): string {
  if (typeof value !== "string" || !DAY_RE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new HttpsError("invalid-argument", `${field} must be a YYYY-MM-DD date.`);
  }
  return value;
}
