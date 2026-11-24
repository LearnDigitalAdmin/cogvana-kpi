import { initializeApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getFunctions, type Functions } from "firebase/functions";

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/** False until the VITE_FIREBASE_* variables are set; AuthGate shows a setup screen instead of crashing. */
export const configured = Boolean(cfg.apiKey && cfg.projectId && cfg.appId);

const app = configured ? initializeApp(cfg) : null;
export const auth = (app ? getAuth(app) : null) as Auth;
export const db = (app ? getFirestore(app) : null) as Firestore;
export const functions = (app ? getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || "us-central1") : null) as Functions;

export const DENIED_EVENT = "kpi:access-denied";
