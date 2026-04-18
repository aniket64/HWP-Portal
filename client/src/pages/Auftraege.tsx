import { useState, useCallback, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ExternalLink,
  Loader2,
  RefreshCw,
  Filter,
  Calendar,
  X,
  Users,
  UsersRound,
  ChevronDown,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

// ─── Hilfsfunktionen ─────────────────────────────────────────────────────────

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

/** ISO-Kalenderwoche aus einem Datum berechnen */
function getISOWeek(date: Date): { kw: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const kw = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { kw, year: d.getUTCFullYear() };
}

/** Montag einer ISO-KW berechnen */
function getKWMonday(kw: number, year: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  return monday;
}

/** Maximale KW eines Jahres */
function getMaxKW(year: number): number {
  const dec28 = new Date(year, 11, 28);
  return getISOWeek(dec28).kw;
}

/** KW um n Wochen verschieben */
function shiftKW(kw: number, year: number, delta: number): { kw: number; year: number } {
  const monday = getKWMonday(kw, year);
  monday.setDate(monday.getDate() + delta * 7);
  return getISOWeek(monday);
}

// ─── Konstanten ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Completed", label: "Abgeschlossen" },
  { value: "Scheduled", label: "Geplant" },
  { value: "In Progress", label: "In Bearbeitung" },
  { value: "Cannot Complete", label: "Nicht abgeschlossen" },
  { value: "Canceled", label: "Storniert" },
];

const SORT_OPTIONS = [
  { value: "Created Date", label: "Erstellungsdatum" },
  { value: "Target End", label: "Zieldatum" },
  { value: "Mehrkosten", label: "Mehrkosten" },
  { value: "Pauschale", label: "Pauschale" },
  { value: "Opportunity Name", label: "Kundenname" },
];

const STATUS_COLORS: Record<string, string> = {
  Completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Canceled: "bg-red-100 text-red-700 border-red-200",
  Scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  "In Progress": "bg-amber-100 text-amber-700 border-amber-200",
  "Cannot Complete": "bg-orange-100 text-orange-700 border-orange-200",
};

// ─── Komponente ───────────────────────────────────────────────────────────────

export default function Auftraege() {
  return (
    <DashboardLayout>
      <AuftraegeContent />
    </DashboardLayout>
  );
}

function AuftraegeContent() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // URL-Parameter lesen
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);

  // Hilfsfunktion: URL-Parameter setzen
  const setParam = useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(window.location.search);
    if (value === null || value === "") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Seite zurücksetzen wenn Filter geändert wird (außer bei page selbst)
    if (key !== "page") params.set("page", "1");
    setLocation(`/auftraege?${params.toString()}`, { replace: true });
  }, [setLocation]);

  const setMultiParam = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.set("page", "1");
    setLocation(`/auftraege?${params.toString()}`, { replace: true });
  }, [setLocation]);

  // State aus URL lesen
  const search = urlParams.get("q") ?? "";
  const statusFilterRaw = urlParams.get("status") ?? "";
  const statusFilter: string[] = statusFilterRaw ? statusFilterRaw.split(",").filter(Boolean) : [];
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const sortField = urlParams.get("sort") ?? "Target End";
  const sortDirection = (urlParams.get("dir") ?? "desc") as "asc" | "desc";
  const page = parseInt(urlParams.get("page") ?? "1", 10);
  const kwActive = urlParams.get("kwActive") === "1";
  const kw = parseInt(urlParams.get("kw") ?? "0", 10);
  const kwYear = parseInt(urlParams.get("kwYear") ?? "0", 10);

  // Lokaler Suchfeld-State (wird erst bei Enter/Klick übernommen)
  const [searchInput, setSearchInput] = useState(search);

  // HWP-Mehrfachfilter
  const hwpFilterRaw = urlParams.get("hwp") ?? "";
  const hwpFilter: string[] = hwpFilterRaw ? hwpFilterRaw.split(",").filter(Boolean) : [];
  const [hwpPopoverOpen, setHwpPopoverOpen] = useState(false);
  const [hwpSearch, setHwpSearch] = useState("");

  // Team-Filter
  const teamFilterRaw = urlParams.get("team") ?? "";
  const teamFilterId = teamFilterRaw ? parseInt(teamFilterRaw, 10) : undefined;
  const [teamPopoverOpen, setTeamPopoverOpen] = useState(false);

  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  // Teams laden (für Team-Filter)
  const { data: teamsData } = trpc.teams.list.useQuery(undefined, {
    enabled: ["admin", "kam", "tom", "tl"].includes(user?.role ?? ""),
  });
  const availableTeams = teamsData ?? [];
  const selectedTeam = availableTeams.find(t => t?.id === teamFilterId) ?? null;

  const toggleTeamFilter = (teamId: number) => {
    if (teamFilterId === teamId) {
      setParam("team", null);
    } else {
      setParam("team", String(teamId));
    }
  };

  // Eigene HWP-Zuordnungen laden (für KAM/TOM/TL)
  const { data: myAssignments } = trpc.users.myHwpAssignments.useQuery();
  // Alle HWP-Accounts laden (nur für Admin – adminProcedure)
  const { data: allHwpAccounts } = trpc.users.listAirtableAccounts.useQuery(undefined, {
    enabled: isAdmin,
  });

  // Verfügbare HWPs für Filter: eigene Zuordnungen (wenn vorhanden) oder alle
  const availableHwps = useMemo(() => {
    const own = myAssignments ?? [];
    if (own.length > 0) {
      return own.map((a) => ({ id: a.hwpAccountId, name: a.hwpName }));
    }
    return (allHwpAccounts ?? []).map((a) => ({ id: a.accountId, name: a.accountName }));
  }, [myAssignments, allHwpAccounts]);

  const filteredAvailableHwps = useMemo(() => {
    if (!hwpSearch) return availableHwps;
    const s = hwpSearch.toLowerCase();
    return availableHwps.filter((h) => h.name.toLowerCase().includes(s));
  }, [availableHwps, hwpSearch]);

  const toggleHwpFilter = (hwpId: string) => {
    const current = hwpFilter;
    const next = current.includes(hwpId)
      ? current.filter((id) => id !== hwpId)
      : [...current, hwpId];
    setParam("hwp", next.length > 0 ? next.join(",") : null);
  };

  // KW-Hilfswerte
  const today = useMemo(() => new Date(), []);
  const currentKW = useMemo(() => getISOWeek(today), [today]);
  const effectiveKW = kwActive && kw > 0 ? kw : currentKW.kw;
  const effectiveKWYear = kwActive && kwYear > 0 ? kwYear : currentKW.year;

  // KW navigieren
  const goToCurrentKW = useCallback(() => {
    setMultiParam({ kwActive: "1", kw: String(currentKW.kw), kwYear: String(currentKW.year) });
  }, [currentKW, setMultiParam]);

  const prevKW = useCallback(() => {
    const prev = shiftKW(effectiveKW, effectiveKWYear, -1);
    setMultiParam({ kwActive: "1", kw: String(prev.kw), kwYear: String(prev.year) });
  }, [effectiveKW, effectiveKWYear, setMultiParam]);

  const nextKW = useCallback(() => {
    const next = shiftKW(effectiveKW, effectiveKWYear, 1);
    setMultiParam({ kwActive: "1", kw: String(next.kw), kwYear: String(next.year) });
  }, [effectiveKW, effectiveKWYear, setMultiParam]);

  const clearKW = useCallback(() => {
    setMultiParam({ kwActive: null, kw: null, kwYear: null });
  }, [setMultiParam]);

  const handleSearch = useCallback(() => {
    setParam("q", searchInput);
  }, [searchInput, setParam]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setMultiParam({ sort: field, dir: sortDirection === "asc" ? "desc" : "asc" });
    } else {
      setMultiParam({ sort: field, dir: "desc" });
    }
  };

  // Hilfsfunktion: Sortierpfeil-Icon rendern
  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDirection === "asc"
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const { data, isLoading, isFetching, refetch } = trpc.mehrkosten.list.useQuery(
    {
      pageSize: 50,
      page,
      search: search || undefined,
      statusFilters: statusFilter.length > 0 ? statusFilter : undefined,
      hwpFilters: hwpFilter.length > 0 ? hwpFilter : undefined,
      teamFilter: teamFilterId,
      sortField,
      sortDirection,
      kwFilter: kwActive ? effectiveKW : undefined,
      yearFilter: kwActive ? effectiveKWYear : undefined,
    },
    { staleTime: 0, retry: 2 }
  );

  const records = data?.records ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  // Klassi-Status Batch-Query: Order Numbers der aktuellen Seite
  const orderNumbers = useMemo(
    () => records.map(r => r.fields["Order Number"] as string).filter(Boolean),
    [records]
  );
  const { data: klassiStatus } = trpc.mehrkosten.getKlassifizierungBatch.useQuery(
    { orderNumbers },
    { enabled: orderNumbers.length > 0, staleTime: 5 * 60 * 1000 }
  );

  // KW-Label
  const isCurrentKW = effectiveKW === currentKW.kw && effectiveKWYear === currentKW.year;
  const kwMonday = useMemo(() => getKWMonday(effectiveKW, effectiveKWYear), [effectiveKW, effectiveKWYear]);
  const kwSunday = useMemo(() => {
    const d = new Date(kwMonday);
    d.setDate(d.getDate() + 6);
    return d;
  }, [kwMonday]);
  const kwRangeLabel = `${kwMonday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} – ${kwSunday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}`;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Aufträge</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {total > 0 ? `${total} Aufträge gefunden` : "Alle eingebuchten Aufträge aus Airtable"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2" disabled={isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Lädt..." : "Aktualisieren"}
        </Button>
      </div>

      {/* Filter Bar */}
      <Card className="border shadow-sm">
        <CardContent className="p-4 space-y-3">
          {/* Zeile 1: Suche + Status + Sortierung */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            {/* Suche */}
            <div className="flex gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Kunde, Auftragsnr., HWP..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch} variant="default" size="default">
                Suchen
              </Button>
            </div>

            {/* Team-Filter */}
            {availableTeams.length > 0 && (
              <Popover open={teamPopoverOpen} onOpenChange={setTeamPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="default"
                    className={`gap-2 min-w-[150px] justify-between ${
                      teamFilterId ? 'border-violet-500 text-violet-700 bg-violet-50' : ''
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <UsersRound className="h-3.5 w-3.5" />
                      {selectedTeam ? selectedTeam.name : 'Alle Teams'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="space-y-0.5">
                    {teamFilterId && (
                      <button
                        onClick={() => setParam('team', null)}
                        className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-2 py-1 mb-1"
                      >
                        Filter aufheben
                      </button>
                    )}
                    {availableTeams.map((t) => t && (
                      <label
                        key={t.id}
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer text-sm"
                      >
                        <Checkbox
                          checked={teamFilterId === t.id}
                          onCheckedChange={() => toggleTeamFilter(t.id)}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{t.name}</p>
                          {t.hwpZuordnungen && t.hwpZuordnungen.length > 0 && (
                            <p className="text-xs text-muted-foreground">{t.hwpZuordnungen.length} HWP{t.hwpZuordnungen.length !== 1 ? 's' : ''}</p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            {/* HWP-Mehrfachfilter */}
            <Popover open={hwpPopoverOpen} onOpenChange={setHwpPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  className={`gap-2 min-w-[160px] justify-between ${
                    hwpFilter.length > 0 ? 'border-primary text-primary' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5" />
                    {hwpFilter.length === 0
                      ? 'Alle HWPs'
                      : `${hwpFilter.length} HWP${hwpFilter.length > 1 ? 's' : ''}`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-2" align="start">
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="HWP suchen..."
                      value={hwpSearch}
                      onChange={(e) => setHwpSearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                  {hwpFilter.length > 0 && (
                    <button
                      onClick={() => setParam('hwp', null)}
                      className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-1"
                    >
                      Alle abwählen ({hwpFilter.length} aktiv)
                    </button>
                  )}
                  <ScrollArea className="h-56">
                    <div className="space-y-0.5">
                      {filteredAvailableHwps.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-2">Keine HWPs gefunden</p>
                      ) : (
                        filteredAvailableHwps.map((h) => (
                          <label
                            key={h.id}
                            className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer text-sm"
                          >
                            <Checkbox
                              checked={hwpFilter.includes(h.id)}
                              onCheckedChange={() => toggleHwpFilter(h.id)}
                            />
                            <span className="truncate">{h.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>

            {/* Status-Mehrfachfilter */}
            <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  className={`gap-2 min-w-[160px] justify-between ${
                    statusFilter.length > 0 ? 'border-primary text-primary' : ''
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Filter className="h-3.5 w-3.5" />
                    {statusFilter.length === 0
                      ? 'Alle Status'
                      : statusFilter.length === 1
                        ? (STATUS_OPTIONS.find((o) => o.value === statusFilter[0])?.label ?? statusFilter[0])
                        : `${statusFilter.length} Status`}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2" align="start">
                <div className="space-y-0.5">
                  {statusFilter.length > 0 && (
                    <button
                      onClick={() => setParam('status', null)}
                      className="text-xs text-muted-foreground hover:text-foreground w-full text-left px-2 py-1 mb-1"
                    >
                      Alle abwählen ({statusFilter.length} aktiv)
                    </button>
                  )}
                  {STATUS_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className="flex items-center gap-2.5 px-2 py-1.5 rounded hover:bg-muted/40 cursor-pointer text-sm"
                    >
                      <Checkbox
                        checked={statusFilter.includes(opt.value)}
                        onCheckedChange={() => {
                          const next = statusFilter.includes(opt.value)
                            ? statusFilter.filter((s) => s !== opt.value)
                            : [...statusFilter, opt.value];
                          setParam('status', next.length > 0 ? next.join(',') : null);
                        }}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            {/* Sortierung */}
            <Select
              value={sortField}
              onValueChange={(v) => {
                setMultiParam({ sort: v, dir: "desc" });
              }}
            >
              <SelectTrigger className="w-[170px]">
                <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Sortierung" />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Zeile 2: KW-Navigation */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              Kalenderwoche:
            </span>

            {/* Pfeil links */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={prevKW}
              title="Vorherige KW"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {/* KW-Anzeige */}
            {kwActive ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 text-sm font-medium">
                <span className="text-primary">
                  KW {kw} / {kwYear}
                  {isCurrentKW && (
                    <span className="ml-1.5 text-xs font-normal text-primary/70">(aktuell)</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline">· {kwRangeLabel}</span>
                <button
                  onClick={clearKW}
                  className="ml-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="KW-Filter entfernen"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-muted-foreground"
                onClick={goToCurrentKW}
              >
                Alle KWs
              </Button>
            )}

            {/* Pfeil rechts */}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={nextKW}
              title="Nächste KW"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Aktuelle KW Button */}
            {(!kwActive || !isCurrentKW) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={goToCurrentKW}
              >
                Aktuelle KW
              </Button>
            )}
          </div>

          {/* Aktive Suchfilter */}
          {(search || statusFilter.length > 0 || hwpFilter.length > 0 || teamFilterId) && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Filter:</span>
              {search && (
                <Badge variant="secondary" className="text-xs gap-1">
                  Suche: „{search}"
                  <button
                    onClick={() => { setSearchInput(""); setParam("q", null); }}
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {statusFilter.length > 0 && statusFilter.map((s) => (
                <Badge key={s} variant="secondary" className="text-xs gap-1">
                  {STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s}
                  <button
                    onClick={() => {
                      const next = statusFilter.filter((x) => x !== s);
                      setParam('status', next.length > 0 ? next.join(',') : null);
                    }}
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
              {hwpFilter.length > 0 && (
                <Badge variant="secondary" className="text-xs gap-1 border-primary/30 bg-primary/10 text-primary">
                  <Users className="h-3 w-3" />
                  {hwpFilter.length === 1
                    ? (availableHwps.find((h) => h.id === hwpFilter[0])?.name ?? hwpFilter[0])
                    : `${hwpFilter.length} HWPs`}
                  <button
                    onClick={() => setParam('hwp', null)}
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
              {teamFilterId && selectedTeam && (
                <Badge variant="secondary" className="text-xs gap-1 border-violet-300 bg-violet-50 text-violet-700">
                  <UsersRound className="h-3 w-3" />
                  Team: {selectedTeam.name}
                  <button
                    onClick={() => setParam('team', null)}
                    className="ml-1 hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auftrags-Liste: Cards auf Mobile, Tabelle auf Desktop */}
      <Card className="border shadow-sm overflow-hidden">
        {/* Mobile Card-Liste */}
        <div className="block md:hidden">
          {isLoading ? (
            <div className="text-center py-12">
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-2">Lade Aufträge...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm font-medium">Keine Aufträge gefunden</p>
              {(search || statusFilter.length > 0 || kwActive) && (
                <p className="text-xs mt-1">Versuchen Sie, die Filter anzupassen</p>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {records.map((record) => {
                const f = record.fields;
                const status = f["Status"] as string | undefined;
                const freigabe = f["Status - Freigabe"] as string | undefined;
                const mehrkosten = f["Mehrkosten"] as number | undefined;
                const pauschale = f["Pauschale"] as number | undefined;
                return (
                  <div
                    key={record.id}
                    className="p-4 cursor-pointer hover:bg-muted/20 active:bg-muted/40 transition-colors"
                    onClick={() => setLocation(`/auftraege/${record.id}`)}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="font-medium text-sm leading-tight">
                        {(f["Opportunity Name"] as string) ?? "–"}
                      </div>
                      {status && (
                        <Badge variant="outline" className={`text-xs shrink-0 ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"}`}>
                          {status}
                        </Badge>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Nr: {(f["Appointment Number"] as string) ?? "–"}</span>
                      <span>Datum: {formatDate(f["Target End"] as string)}</span>
                      <span className="truncate">HWP: {(f["Technician: Account: Account Name"] as string) ?? "–"}</span>
                      {mehrkosten != null && mehrkosten > 0 && (
                        <span className="text-blue-700 font-medium">MK: {formatCurrency(mehrkosten)}</span>
                      )}
                    </div>
                    {freigabe && (
                      <div className="mt-2">
                        <Badge variant="outline" className={`text-xs ${
                          freigabe.includes("Freigegeben") ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : freigabe.includes("Abgelehnt") ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                        }`}>
                          {freigabe}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Desktop Tabelle */}
        <div className="hidden md:block overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap select-none" onClick={() => handleSort("Opportunity Name")}>
                  <div className="flex items-center gap-1">Kunde<SortIcon field="Opportunity Name" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap select-none" onClick={() => handleSort("Appointment Number")}>
                  <div className="flex items-center gap-1">Auftragsnr.<SortIcon field="Appointment Number" /></div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Bestellnr.</TableHead>
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap select-none" onClick={() => handleSort("Technician: Account: Account Name")}>
                  <div className="flex items-center gap-1">HWP<SortIcon field="Technician: Account: Account Name" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap select-none" onClick={() => handleSort("Status")}>
                  <div className="flex items-center gap-1">Status<SortIcon field="Status" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap select-none" onClick={() => handleSort("Target End")}>
                  <div className="flex items-center gap-1">Zieldatum<SortIcon field="Target End" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap text-right select-none" onClick={() => handleSort("Mehrkosten")}>
                  <div className="flex items-center justify-end gap-1">Mehrkosten<SortIcon field="Mehrkosten" /></div>
                </TableHead>
                <TableHead className="cursor-pointer hover:text-foreground whitespace-nowrap text-right select-none" onClick={() => handleSort("Pauschale")}>
                  <div className="flex items-center justify-end gap-1">Pauschale<SortIcon field="Pauschale" /></div>
                </TableHead>
                <TableHead className="whitespace-nowrap">Freigabe</TableHead>
                <TableHead className="whitespace-nowrap text-center" title="Klassifizierungsstatus">Klassi</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mt-2">Lade Aufträge...</p>
                </TableCell></TableRow>
              ) : records.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-16 text-muted-foreground">
                  <p className="text-sm font-medium">Keine Aufträge gefunden</p>
                  {(search || statusFilter.length > 0 || kwActive) && (<p className="text-xs mt-1">Versuchen Sie, die Filter anzupassen</p>)}
                </TableCell></TableRow>
              ) : (
                records.map((record) => {
                  const f = record.fields;
                  const status = f["Status"] as string | undefined;
                  const freigabe = f["Status - Freigabe"] as string | undefined;
                  const mehrkosten = f["Mehrkosten"] as number | undefined;
                  const pauschale = f["Pauschale"] as number | undefined;
                  return (
                    <TableRow key={record.id} className="cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setLocation(`/auftraege/${record.id}`)}>
                      <TableCell className="font-medium max-w-[180px]"><div className="truncate" title={f["Opportunity Name"] as string}>{(f["Opportunity Name"] as string) ?? "–"}</div></TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{(f["Appointment Number"] as string) ?? "–"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{(f["Order Number"] as string) ?? "–"}</TableCell>
                      <TableCell className="text-sm max-w-[140px]"><div className="truncate" title={f["Technician: Account: Account Name"] as string}>{(f["Technician: Account: Account Name"] as string) ?? "–"}</div></TableCell>
                      <TableCell>{status ? <Badge variant="outline" className={`text-xs ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"}`}>{status}</Badge> : "–"}</TableCell>
                      <TableCell className="text-sm whitespace-nowrap">{formatDate(f["Target End"] as string)}</TableCell>
                      <TableCell className="text-sm text-right font-medium whitespace-nowrap">{mehrkosten != null ? <span className={mehrkosten > 0 ? "text-blue-700" : "text-muted-foreground"}>{formatCurrency(mehrkosten)}</span> : "–"}</TableCell>
                      <TableCell className="text-sm text-right whitespace-nowrap">{formatCurrency(pauschale)}</TableCell>
                      <TableCell>{freigabe ? <Badge variant="outline" className={`text-xs ${freigabe.includes("Freigegeben") ? "bg-emerald-100 text-emerald-700 border-emerald-200" : freigabe.includes("Abgelehnt") ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"}`}>{freigabe}</Badge> : <Badge variant="outline" className="text-xs bg-slate-100 text-slate-500">Ausstehend</Badge>}</TableCell>
                      <TableCell className="text-center">
                        {(() => {
                          const orderNum = f["Order Number"] as string | undefined;
                          const ks = orderNum ? klassiStatus?.[orderNum] : undefined;
                          if (!ks) return <span className="text-muted-foreground/30 text-xs">–</span>;
                          if (ks.klassifizierungAbgeschlossen) {
                            return (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center justify-center">
                                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    <p className="font-medium">Klassifizierung abgeschlossen</p>
                                    {ks.status && <p className="text-muted-foreground">{ks.status}</p>}
                                    {ks.risikobewertung && <p>Risiko: {ks.risikobewertung}</p>}
                                    {ks.komplex && <p className="text-amber-600">Komplex</p>}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            );
                          }
                          return (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex items-center justify-center">
                                    <Clock className="h-4 w-4 text-amber-500" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  <p>Klassifizierung ausstehend</p>
                                  {ks.status && <p className="text-muted-foreground">{ks.status}</p>}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          );
                        })()}
                      </TableCell>
                      <TableCell><ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
            <p className="text-sm text-muted-foreground">
              Seite {page} von {totalPages} · {total} Aufträge gesamt
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setParam("page", String(Math.max(1, page - 1)))}
                disabled={page <= 1}
                className="gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Zurück
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setParam("page", String(Math.min(totalPages, page + 1)))}
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
