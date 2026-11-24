import { createContext, useCallback, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { GoogleAuthProvider, createUserWithEmailAndPassword, getIdTokenResult, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut as fbSignOut, type User } from "firebase/auth";
import { auth, configured, DENIED_EVENT } from "../lib/firebase";
import { copyText } from "../lib/csv";

export const ROLES = ["admin", "analyst", "finance"];
export interface AuthInfo { user: User; role: string; signOut: () => void }
const Ctx = createContext<AuthInfo | null>(null);
export function useAuth(): AuthInfo {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthGate");
  return v;
}

type State = { s: "loading" } | { s: "out" } | { s: "denied"; user: User } | { s: "ok"; user: User; role: string };

function SetupScreen() {
  return (
    <div className="center-screen"><div className="card narrow">
      <h1>Samuhia KPIs</h1>
      <p>Firebase is not configured. Copy <code>.env.example</code> to <code>.env</code> and fill in <code>VITE_FIREBASE_API_KEY</code>, <code>VITE_FIREBASE_AUTH_DOMAIN</code>, <code>VITE_FIREBASE_PROJECT_ID</code> and <code>VITE_FIREBASE_APP_ID</code>, then rebuild.</p>
    </div></div>
  );
}

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [create, setCreate] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e) { setErr((e as { code?: string; message?: string }).code ?? (e as Error).message); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => (create ? createUserWithEmailAndPassword(auth, email, password) : signInWithEmailAndPassword(auth, email, password)));
  };
  return (
    <div className="center-screen"><div className="card narrow">
      <h1>Samuhia KPIs</h1>
      <p className="muted">Sign in to see how the company is doing.</p>
      <button className="btn btn-primary block" disabled={busy} onClick={() => void run(() => signInWithPopup(auth, new GoogleAuthProvider()))}>Continue with Google</button>
      <div className="or">or</div>
      <form onSubmit={submit} className="stack">
        <label className="field">Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="field">Password<input type="password" autoComplete={create ? "new-password" : "current-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn block" disabled={busy} type="submit">{create ? "Create account" : "Sign in"}</button>
      </form>
      <button className="link" onClick={() => setCreate(!create)}>{create ? "I already have an account" : "Create an account"}</button>
      {err && <p className="error-text" role="alert">{err}</p>}
    </div></div>
  );
}

function Denied({ user, onCheck, onSignOut, checking }: { user: User; onCheck: () => void; onSignOut: () => void; checking: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="center-screen"><div className="card narrow">
      <h1>Access not granted</h1>
      <p>Signed in as <strong>{user.email ?? "(no email)"}</strong></p>
      <p className="small">UID: <code>{user.uid}</code></p>
      <button className="btn" onClick={async () => { setCopied(await copyText(user.uid)); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy UID"}</button>
      <p>Ask the owner to grant access.</p>
      <div className="row">
        <button className="btn btn-primary" disabled={checking} onClick={onCheck}>{checking ? "Checking…" : "Check again"}</button>
        <button className="btn" onClick={onSignOut}>Sign out</button>
      </div>
    </div></div>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ s: "loading" });
  const [checking, setChecking] = useState(false);

  const evaluate = useCallback(async (user: User) => {
    const t = await getIdTokenResult(user, true);
    const role = t.claims.role;
    setState(typeof role === "string" && ROLES.includes(role) ? { s: "ok", user, role } : { s: "denied", user });
  }, []);

  useEffect(() => {
    if (!configured) return;
    return onAuthStateChanged(auth, (u) => {
      if (!u) setState({ s: "out" });
      else evaluate(u).catch(() => setState({ s: "denied", user: u }));
    });
  }, [evaluate]);

  useEffect(() => {
    const onDenied = () => setState((st) => (st.s === "ok" ? { s: "denied", user: st.user } : st));
    window.addEventListener(DENIED_EVENT, onDenied);
    return () => window.removeEventListener(DENIED_EVENT, onDenied);
  }, []);

  if (!configured) return <SetupScreen />;
  if (state.s === "loading") return <div className="center-screen"><div className="muted">Loading…</div></div>;
  if (state.s === "out") return <Login />;
  const signOut = () => { void fbSignOut(auth); };
  if (state.s === "denied") {
    const user = state.user;
    return <Denied user={user} checking={checking} onSignOut={signOut} onCheck={async () => { setChecking(true); try { await evaluate(user); } finally { setChecking(false); } }} />;
  }
  return <Ctx.Provider value={{ user: state.user, role: state.role, signOut }}>{children}</Ctx.Provider>;
}
