import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthGate";
import { Controls } from "./Controls";
import { ErrorBoundary } from "./ErrorBoundary";
import { FreshnessBanner } from "./FreshnessBanner";

const NAV: [string, string][] = [
  ["/", "Overview"], ["/money", "Money"], ["/register", "Register"], ["/chama", "Chama"], ["/pms", "Plot Yangu"],
  ["/cyber", "Cyber"], ["/cross", "Cross-project"], ["/health", "Data health"], ["/catalogue", "Catalogue"],
];

export function Layout() {
  const [open, setOpen] = useState(false);
  const { user, role, signOut } = useAuth();
  const loc = useLocation();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-row">
          <button className="btn menu-btn" aria-expanded={open} aria-label="Menu" onClick={() => setOpen(!open)}>☰ Menu</button>
          <strong className="brand">Cogvana KPIs</strong>
          <details className="user">
            <summary className="btn" title={user.email ?? user.uid}>{(user.email ?? "Account").split("@")[0]}</summary>
            <div className="menu"><div className="small muted">{user.email}<br />role: {role}</div><button className="btn block" onClick={signOut}>Sign out</button></div>
          </details>
        </div>
        <Controls />
      </header>
      <nav className={`nav${open ? " open" : ""}`} aria-label="Pages">
        {NAV.map(([to, label]) => <NavLink key={to} to={{ pathname: to, search: loc.search }} end={to === "/"} onClick={() => setOpen(false)}>{label}</NavLink>)}
      </nav>
      <main className="main">
        <FreshnessBanner />
        <ErrorBoundary key={loc.pathname}><Outlet /></ErrorBoundary>
      </main>
    </div>
  );
}
