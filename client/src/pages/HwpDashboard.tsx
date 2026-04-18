import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Loader2,
  Euro,
  ClipboardList,
  CalendarDays,
  TrendingUp,
  X,
  ExternalLink,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatCurrency(value: number | undefined | null): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | undefined | null): string {
  if (!value) return "–";
  return new Date(value).toLocaleDateString("de-DE");
}

function getISOWeek(date: Date): { kw: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { kw, year: d.getUTCFullYear() };
}

function shiftKW(kw: number, year: number, delta: number): { kw: number; year: number } {
  // Montag der KW berechnen
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  monday.setDate(monday.getDate() + delta * 7);
  return getISOWeek(monday);
}

// Status-Badge für Auftrags-Status
const STATUS_COLORS: Record<string, string> = {
  Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Canceled: "bg-red-100 text-red-700 border-red-200",
  Scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  "In Progress": "bg-amber-100 text-amber-700 border-amber-200",
  "Cannot Complete": "bg-orange-100 text-orange-700 border-orange-200",
};

const STATUS_DE: Record<string, string> = {
  Completed: "Abgeschlossen",
  Canceled: "Storniert",
  Scheduled: "Geplant",
  "In Progress": "In Bearbeitung",
  "Cannot Complete": "Nicht abgeschlossen",
};

const MK_STATUS_COLORS: Record<string, string> = {
  entwurf: "bg-slate-100 text-slate-600 border-slate-200",
  abgeschlossen: "bg-blue-100 text-blue-700 border-blue-200",
  terminiert: "bg-violet-100 text-violet-700 border-violet-200",
  nachtrag: "bg-amber-100 text-amber-700 border-amber-200",
  freigegeben: "bg-emerald-100 text-emerald-700 border-emerald-200",
  abgelehnt: "bg-red-100 text-red-700 border-red-200",
};

const MK_STATUS_DE: Record<string, string> = {
  entwurf: "Entwurf",
  abgeschlossen: "Klassifiziert",
  terminiert: "Terminiert",
  nachtrag: "Nachtrag eingereicht",
  freigegeben: "Freigegeben",
  abgelehnt: "Abgelehnt",
};

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function HwpDashboard() {
  return (
    <DashboardLayout>
      <HwpDashboardContent />
    </DashboardLayout>
  );
}

function HwpDashboardContent() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  // KW-State
  const today = useMemo(() => new Date(), []);
  const currentKW = useMemo(() => getISOWeek(today), [today]);
  const [kw, setKw] = useState(currentKW.kw);
  const [year, setYear] = useState(currentKW.year);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [globalSearch, setGlobalSearch] = useState(false); // alle KWs durchsuchen
  const [page, setPage] = useState(1);

  const isCurrentKW = kw === currentKW.kw && year === currentKW.year;

  const prevKW = useCallback(() => {
    const prev = shiftKW(kw, year, -1);
    setKw(prev.kw);
    setYear(prev.year);
    setPage(1);
  }, [kw, year]);

  const nextKW = useCallback(() => {
    const next = shiftKW(kw, year, 1);
    setKw(next.kw);
    setYear(next.year);
    setPage(1);
  }, [kw, year]);

  const goToCurrentKW = useCallback(() => {
    setKw(currentKW.kw);
    setYear(currentKW.year);
    setPage(1);
  }, [currentKW]);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
    setPage(1);
    // Bei Suche automatisch Globalsuche aktivieren
    if (searchInput.trim()) setGlobalSearch(true);
  }, [searchInput]);

  // Daten laden
  const { data, isLoading } = trpc.hwp.meineAuftraege.useQuery(
    { kw, year, search: search || undefined, skipKwFilter: globalSearch || undefined, page, pageSize: 50 },
    { staleTime: 30_000 }
  );

  const { data: stats } = trpc.hwp.meineStats.useQuery(undefined, { staleTime: 60_000 });

  const auftraege = data?.auftraege ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const kwRange = data?.kwRange;

  // Anzahl Aufträge mit Mehrkosten-Rechnung
  const mitRechnung = auftraege.filter(a => a.rechnung !== null).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Meine Aufträge</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {user?.companyName ?? user?.name ?? "Handwerkspartner"} · Aufträge nach Kalenderwoche
        </p>
      </div>

      {/* KPI-Karten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-50">
                <ClipboardList className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Aufträge gesamt</p>
                <p className="text-xl font-bold">{stats?.totalAuftraege ?? "–"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-50">
                <CalendarDays className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Diesen Monat</p>
                <p className="text-xl font-bold">{stats?.auftraegeThisMonth ?? "–"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-50">
                <Euro className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Mehrkosten gesamt</p>
                <p className="text-xl font-bold">{formatCurrency(stats?.totalMehrkosten)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-50">
                <Clock className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Offene Nachträge</p>
                <p className="text-xl font-bold">{stats?.offeneNachtraege ?? "–"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter + KW-Navigation */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Suche */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={globalSearch ? "Alle Aufträge durchsuchen..." : "Kunde, Auftragsnr. in dieser KW suchen..."}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch}>Suchen</Button>
            {(search || globalSearch) && (
              <Button variant="ghost" size="icon" title="Suche zurücksetzen" onClick={() => { setSearch(""); setSearchInput(""); setGlobalSearch(false); }}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          {/* Globalsuche-Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = !globalSearch;
                setGlobalSearch(next);
                if (!next) { setSearch(""); setSearchInput(""); }
                setPage(1);
              }}
              className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                globalSearch
                  ? "bg-primary/10 border-primary/30 text-primary font-medium"
                  : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Search className="h-3 w-3" />
              {globalSearch ? "Alle Aufträge (aktiv)" : "Alle Aufträge durchsuchen"}
            </button>
          </div>

          {/* KW-Navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Kalenderwoche:</span>

            <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevKW}>
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-sm font-medium">
              <span className="text-primary">
                KW {kw} / {year}
                {isCurrentKW && (
                  <span className="ml-1.5 text-xs font-normal text-primary/70">(aktuell)</span>
                )}
              </span>
              {kwRange && (
                <span className="text-xs text-muted-foreground hidden sm:inline">· {kwRange.label}</span>
              )}
            </div>

            <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextKW}>
              <ChevronRight className="h-4 w-4" />
            </Button>

            {!isCurrentKW && (
              <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={goToCurrentKW}>
                Aktuelle KW
              </Button>
            )}

            {total > 0 && (
              <span className="text-sm text-muted-foreground ml-auto">
                {total} Aufträge · {mitRechnung} mit Mehrkosten
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auftrags-Liste */}
      <Card className="border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="text-center py-16">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-2">Lade Aufträge...</p>
          </div>
        ) : auftraege.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">Keine Aufträge in KW {kw} / {year}</p>
            <p className="text-xs mt-1">Navigieren Sie zu einer anderen Kalenderwoche</p>
          </div>
        ) : (
          <div className="divide-y">
            {auftraege.map((auftrag) => {
              const hasRechnung = auftrag.rechnung !== null;
              const mkStatus = auftrag.rechnung?.status;
              const mkBetrag = auftrag.rechnung?.summeMitPauschale;
              return (
                <div
                  key={auftrag.airtableId}
                  className="flex items-start gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                  onClick={() => setLocation(`/hwp/auftraege/${auftrag.airtableId}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{auftrag.opportunityName ?? "–"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {auftrag.appointmentNumber ?? ""}{auftrag.orderNumber ? ` · ${auftrag.orderNumber}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        {mkBetrag != null && mkBetrag > 0 && (
                          <p className="text-sm font-bold text-blue-700">{formatCurrency(mkBetrag)}</p>
                        )}
                        <p className="text-xs text-muted-foreground">{formatDate(auftrag.targetEnd ?? auftrag.lastScheduledEnd)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {auftrag.status && (
                        <Badge variant="outline" className={`text-xs ${STATUS_COLORS[auftrag.status] ?? "bg-slate-100 text-slate-600"}`}>
                          {STATUS_DE[auftrag.status] ?? auftrag.status}
                        </Badge>
                      )}
                      {hasRechnung ? (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                          <CheckCircle2 className="h-3 w-3 mr-1" />MK vorhanden
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500">
                          <AlertCircle className="h-3 w-3 mr-1" />Keine MK
                        </Badge>
                      )}
                      {mkStatus && (
                        <Badge variant="outline" className={`text-xs ${MK_STATUS_COLORS[mkStatus] ?? "bg-slate-100 text-slate-600"}`}>
                          {MK_STATUS_DE[mkStatus] ?? mkStatus}
                        </Badge>
                      )}
                      {auftrag.pauschale != null && auftrag.pauschale > 0 && (
                        <Badge variant="outline" className="text-xs bg-violet-50 text-violet-700 border-violet-200">
                          Pauschale: {formatCurrency(auftrag.pauschale)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
            <p className="text-sm text-muted-foreground">
              Seite {page} von {totalPages} · {total} Aufträge
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Zurück
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="gap-1"
              >
                Weiter
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
