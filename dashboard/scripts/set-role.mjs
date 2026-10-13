// Usage: node scripts/set-role.mjs <uid> <admin|analyst|finance>
// Uses Application Default Credentials (gcloud auth application-default login, or GOOGLE_APPLICATION_CREDENTIALS).
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const ROLES = ["admin", "analyst", "finance"];
const [uid, role] = process.argv.slice(2);

if (!uid || !ROLES.includes(role)) {
  console.error("Usage: node scripts/set-role.mjs <uid> <admin|analyst|finance>");
  process.exit(1);
}

try {
  initializeApp({ credential: applicationDefault(), projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT });
  await getAuth().setCustomUserClaims(uid, { role });
  console.log(`Set role "${role}" on user ${uid}.`);
  console.log("The user must sign in again, or press \"Check again\" on the Access screen, to pick it up.");
} catch (e) {
  console.error("Failed:", e.message);
  process.exit(1);
}
