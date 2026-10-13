import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { DENIED_EVENT } from "./lib/firebase";
import { isAuthError } from "./hooks/useKpiValues";
import "./styles.css";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // permission-denied / unauthenticated from the callable or Firestore → "Access not granted" screen
    onError: (e) => { if (isAuthError(e)) window.dispatchEvent(new Event(DENIED_EVENT)); },
  }),
  defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 60_000, retry: 1 } },
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></StrictMode>,
);
