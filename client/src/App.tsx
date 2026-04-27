import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Auftraege from "./pages/Auftraege";
import AuftragDetail from "./pages/AuftragDetail";
import Pauschalen from "./pages/Pauschalen";
import AdminUsers from "./pages/AdminUsers";
import AdminPermissions from "./pages/AdminPermissions";
import AdminSettings from "./pages/AdminSettings";
import MkKlassifizierung from "./pages/MkKlassifizierung";
import MkRechner from "./pages/MkRechner";
import MkNachtraege from "./pages/MkNachtraege";
import HwpDashboard from "./pages/HwpDashboard";
import HwpAuftragDetail from "./pages/HwpAuftragDetail";
import Teams from "./pages/Teams";
import Wochenplanung from "./pages/Wochenplanung";
import { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { isLoginDisabled } from "@/lib/feature-flags";

function HomeRedirect() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, { retry: false, enabled: !isLoginDisabled });
  useEffect(() => {
    if (isLoginDisabled) {
      setLocation("/dashboard");
      return;
    }

    if (!isLoading) {
      if (!user) {
        setLocation("/login");
      } else if ((user as { role?: string }).role === "hwp") {
        setLocation("/hwp/auftraege");
      } else {
        setLocation("/dashboard");
      }
    }
  }, [user, isLoading, setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/dashboard" component={Dashboard} />

      {/* Aufträge (neue Hauptroute) */}
      <Route path="/auftraege" component={Auftraege} />
      <Route path="/auftraege/:id">
        {(params: { id: string }) => <AuftragDetail id={params.id} />}
      </Route>

      {/* Mehrkosten als Alias → Aufträge weiterleiten */}
      <Route path="/mehrkosten">
        {() => { useEffect(() => { window.location.replace("/auftraege"); }, []); return null; }}
      </Route>
      <Route path="/mehrkosten/:id">
        {(params: { id: string }) => {
          useEffect(() => { window.location.replace(`/auftraege/${params.id}`); }, [params.id]);
          return null;
        }}
      </Route>

      {/* Pauschalen */}
      <Route path="/pauschalen" component={Pauschalen} />

      {/* Mehrkosten-Klassifizierung */}
      <Route path="/mk/klassifizierung" component={MkKlassifizierung} />
      <Route path="/mk/rechner/:orderNumber" component={MkRechner} />
      <Route path="/mk/nachtraege" component={MkNachtraege} />

      {/* HWP-Ansicht */}
      <Route path="/hwp/auftraege" component={HwpDashboard} />
      <Route path="/hwp/auftraege/:id">
        {(params: { id: string }) => <HwpAuftragDetail airtableId={params.id} />}
      </Route>

      {/* Teams */}
      <Route path="/teams" component={Teams} />

      {/* Wochenplanung */}
      <Route path="/wochenplanung" component={Wochenplanung} />

      {/* Admin */}
      <Route path="/admin/users" component={AdminUsers} />
      <Route path="/admin/permissions" component={AdminPermissions} />
      <Route path="/admin/settings" component={AdminSettings} />

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster richColors position="top-right" />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}

export default App;
