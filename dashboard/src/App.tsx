import { HashRouter, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { Layout } from "./components/Layout";
import { RangeProvider } from "./hooks/useRange";
import Catalogue from "./pages/Catalogue";
import Cross from "./pages/Cross";
import DeskPage from "./pages/DeskPage";
import Health from "./pages/Health";
import Money from "./pages/Money";
import Overview from "./pages/Overview";
import PlatformPage from "./pages/PlatformPage";

export default function App() {
  return (
    <AuthGate>
      <HashRouter>
        <RangeProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Overview />} />
              <Route path="money" element={<Money />} />
              <Route path="register" element={<PlatformPage layoutKey="register" />} />
              <Route path="chama" element={<PlatformPage layoutKey="chama" />} />
              <Route path="pms" element={<PlatformPage layoutKey="pms" />} />
              <Route path="desk" element={<DeskPage />} />
              <Route path="cyber" element={<DeskPage />} />
              <Route path="cross" element={<Cross />} />
              <Route path="health" element={<Health />} />
              <Route path="catalogue" element={<Catalogue />} />
              <Route path="*" element={<Overview />} />
            </Route>
          </Routes>
        </RangeProvider>
      </HashRouter>
    </AuthGate>
  );
}
