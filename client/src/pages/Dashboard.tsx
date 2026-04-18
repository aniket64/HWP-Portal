import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth, ROLE_LABELS, ROLE_COLORS } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  TrendingUp,
  CheckCircle2,
  XCircle,
  Clock,
  Euro,
  FileText,
  ArrowRight,
  Building2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  X,
  CalendarDays,
  Users,
  Activity,
  BarChart3,
} from "lucide-react";
import { useLocation } from "wouter";

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

function getISOWeek(date: Date): { kw: number; year: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const kw =
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7
    );
  return { kw, year: d.getFullYear() };
}

function navigateWeek(kw: number, year: number, delta: number): { kw: number; year: number } {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7 + delta * 7);
  return getISOWeek(monday);
}

function navigateMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  if (m < 0) { m = 11; y--; }
  if (m > 11) { m = 0; y++; }
  return { year: y, month: m };
}

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Completed: "bg-emerald-100 text-emerald-700",
    Canceled: "bg-red-100 text-red-700",
    Scheduled: "bg-blue-100 text-blue-700",
    "In Progress": "bg-amber-100 text-amber-700",
    "Cannot Complete": "bg-orange-100 text-orange-700",
  };
  const cls = map[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

// ─── Haupt-Export ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  return (
    <DashboardLayout>
      <DashboardContent />
    </DashboardLayout>
  );
}

// ─── Dashboard-Inhalt ─────────────────────────────────────────────────────────

type Period = "week" | "month" | "all";

function DashboardContent() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // HWP-Nutzer auf /hwp/auftraege weiterleiten
  useEffect(() => {
    if (user && user.role === "hwp") {
      setLocation("/hwp/auftraege");
    }
  }, [user, setLocation]);

  // Zeitraum-Umschalter
  const [period, setPeriod] = useState<Period>("week");

  // Aktuelle KW und Monat als Startwert
  const todayWeek = useMemo(() => getISOWeek(new Date()), []);
  const [kw, setKw] = useState(todayWeek.kw);
  const [kwYear, setKwYear] = useState(todayWeek.year);

  const todayMonth = useMemo(() => ({ year: new Date().getFullYear(), month: new Date().getMonth() }), []);
  const [month, setMonth] = useState(todayMonth.month);
  const [monthYear, setMonthYear] = useState(todayMonth.year);

  // Widget-Konfiguration laden
  const { data: widgetConfig } = trpc.dashboard.getWidgetConfig.useQuery();

  // Stats laden – mit Zeitraum-Filter
  const statsInput = useMemo(() => {
    if (period === "week") return { period: "week" as const, kw, year: kwYear };
    if (period === "month") return { period: "month" as const, year: monthYear };
    return { period: "all" as const };
  }, [period, kw, kwYear, month, monthYear]);

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } =
    trpc.dashboard.stats.useQuery(statsInput, { staleTime: 0 });

  // Wochenansicht laden
  const weekInput = useMemo(() => ({ kw, year: kwYear }), [kw, kwYear]);
  const { data: weekData, isLoading: weekLoading } =
    trpc.dashboard.weeklyOrders.useQuery(weekInput, { staleTime: 0 });

  const isEnabled = useCallback(
    (id: string) => {
      if (!widgetConfig) return true;
      const w = widgetConfig.find((c) => c.id === id);
      return w ? w.enabled : true;
    },
    [widgetConfig]
  );

  const role = user?.role;
  const isCurrentWeek = kw === todayWeek.kw && kwYear === todayWeek.year;
  const isCurrentMonth = month === todayMonth.month && monthYear === todayMonth.year;

  // KW-Navigation
  const goWeekBack = () => { const p = navigateWeek(kw, kwYear, -1); setKw(p.kw); setKwYear(p.year); };
  const goWeekForward = () => { const p = navigateWeek(kw, kwYear, 1); setKw(p.kw); setKwYear(p.year); };
  const goWeekToday = () => { setKw(todayWeek.kw); setKwYear(todayWeek.year); };

  // Monats-Navigation
  const goMonthBack = () => { const p = navigateMonth(monthYear, month, -1); setMonthYear(p.year); setMonth(p.month); };
  const goMonthForward = () => { const p = navigateMonth(monthYear, month, 1); setMonthYear(p.year); setMonth(p.month); };
  const goMonthToday = () => { setMonth(todayMonth.month); setMonthYear(todayMonth.year); };

  // Zeitraum-Label
  const periodLabel = period === "week"
    ? `KW ${kw} / ${kwYear}`
    : period === "month"
    ? `${MONTH_NAMES[month]} ${monthYear}`
    : "Gesamt";

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Willkommen, {user?.name?.split(" ")[0] ?? "Benutzer"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Übersicht Ihrer Aufträge und Mehrkostenfreigaben
            {user?.companyName && ` · ${user.companyName}`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {role && (
            <Badge className={ROLE_COLORS[role]}>{ROLE_LABELS[role]}</Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchStats()}
            className="gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Aktualisieren
          </Button>
        </div>
      </div>

      {/* ─── Schnellsuche ─── */}
      <QuickSearch onNavigate={setLocation} userRole={user?.role} />

      {/* ─── Zeitraum-Umschalter ─── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border overflow-hidden">
          {(["week", "month", "all"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                period === p
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {p === "week" ? "Woche" : p === "month" ? "Monat" : "Gesamt"}
            </button>
          ))}
        </div>

        {/* Zeitraum-Navigation */}
        {period === "week" && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goWeekBack}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-medium px-2 min-w-[90px] text-center">{periodLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goWeekForward}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {!isCurrentWeek && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goWeekToday}>
                Heute
              </Button>
            )}
          </div>
        )}
        {period === "month" && (
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goMonthBack}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-sm font-medium px-2 min-w-[130px] text-center">{periodLabel}</span>
            <Button variant="outline" size="icon" className="h-8 w-8" onClick={goMonthForward}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            {!isCurrentMonth && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={goMonthToday}>
                Aktueller Monat
              </Button>
            )}
          </div>
        )}
        {period !== "all" && (
          <span className="text-xs text-muted-foreground ml-1">
            {statsLoading ? "" : `${stats?.total ?? 0} Aufträge`}
          </span>
        )}
      </div>

      {/* ─── KPI-Karten ─── */}
      {(isEnabled("kpi_total") ||
        isEnabled("kpi_freigegeben") ||
        isEnabled("kpi_abgelehnt") ||
        isEnabled("kpi_ausstehend")) && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isEnabled("kpi_total") && (
            <KpiCard
              title="Gesamt Aufträge"
              value={statsLoading ? "..." : String(stats?.total ?? 0)}
              icon={FileText}
              color="text-blue-600"
              bg="bg-blue-50"
              onClick={() => setLocation("/auftraege")}
            />
          )}
          {isEnabled("kpi_freigegeben") && (
            <KpiCard
              title="Freigegeben"
              value={statsLoading ? "..." : String(stats?.freigegeben ?? 0)}
              icon={CheckCircle2}
              color="text-emerald-600"
              bg="bg-emerald-50"
            />
          )}
          {isEnabled("kpi_abgelehnt") && (
            <KpiCard
              title="Abgelehnt"
              value={statsLoading ? "..." : String(stats?.abgelehnt ?? 0)}
              icon={XCircle}
              color="text-red-600"
              bg="bg-red-50"
            />
          )}
          {isEnabled("kpi_ausstehend") && (
            <KpiCard
              title="Ausstehend"
              value={statsLoading ? "..." : String(stats?.ausstehend ?? 0)}
              icon={Clock}
              color="text-amber-600"
              bg="bg-amber-50"
            />
          )}
        </div>
      )}

      {/* ─── Finanz-KPIs ─── */}
      {(isEnabled("kpi_mehrkosten") || isEnabled("kpi_pauschalen")) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isEnabled("kpi_mehrkosten") && (
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Mehrkosten {period !== "all" && <span className="normal-case">({periodLabel})</span>}
                    </p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                      {statsLoading ? "..." : formatCurrency(stats?.gesamtMehrkosten)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
          {isEnabled("kpi_pauschalen") && (
            <Card className="border shadow-sm">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pauschalen {period !== "all" && <span className="normal-case">({periodLabel})</span>}
                    </p>
                    <p className="text-2xl font-bold mt-1 text-foreground">
                      {statsLoading ? "..." : formatCurrency(stats?.gesamtPauschale)}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50">
                    <Euro className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ─── Wochenansicht ─── */}
      {isEnabled("weekly_orders") && (
        <WeeklyOrdersWidget
          kw={kw}
          year={kwYear}
          weekData={weekData}
          weekLoading={weekLoading}
          isCurrentWeek={isCurrentWeek}
          onGoBack={goWeekBack}
          onGoForward={goWeekForward}
          onGoToday={goWeekToday}
          onNavigate={setLocation}
        />
      )}

      {/* ─── Untere Widgets ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Status-Verteilung */}
        {isEnabled("status_chart") && (
          <Card className="border shadow-sm lg:col-span-1">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-blue-600" />
                <CardTitle className="text-base font-semibold">Status-Verteilung</CardTitle>
                {period !== "all" && (
                  <Badge variant="outline" className="text-xs ml-auto">{periodLabel}</Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {statsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Lädt...</span>
                </div>
              ) : !stats?.statusDistribution.length ? (
                <p className="text-sm text-muted-foreground py-4">Keine Daten für diesen Zeitraum</p>
              ) : (
                stats.statusDistribution.slice(0, 6).map((item) => {
                  const pct = stats.total > 0 ? Math.round((item.count / stats.total) * 100) : 0;
                  const colorMap: Record<string, string> = {
                    Completed: "bg-emerald-500",
                    Canceled: "bg-red-400",
                    Scheduled: "bg-blue-500",
                    "In Progress": "bg-amber-400",
                    "Cannot Complete": "bg-orange-400",
                  };
                  const barColor = colorMap[item.status] ?? "bg-slate-400";
                  return (
                    <div key={item.status} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground truncate max-w-[140px]">{item.status}</span>
                        <span className="font-medium tabular-nums ml-2">{item.count}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${barColor} transition-all duration-500`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        )}

        {/* HWP-Auftragsverteilung */}
        {isEnabled("top_hwp") && (
          <HwpWidget stats={stats} statsLoading={statsLoading} periodLabel={period !== "all" ? periodLabel : undefined} />
        )}

        {/* Letzte Aktivitäten */}
        {isEnabled("recent_activity") && (
          <RecentActivityWidget onNavigate={setLocation} />
        )}
      </div>
    </div>
  );
}

// ─── Wochenansicht Widget ─────────────────────────────────────────────────────

type WeekRecord = {
  id: string;
  fields: Record<string, unknown>;
};

type WeekDay = {
  date: string;
  dayName: string;
  count: number;
  records: WeekRecord[];
};

type WeekData = {
  kw: number;
  year: number;
  total: number;
  records: WeekRecord[];
  grouped: WeekDay[];
  weekStart: string;
  weekEnd: string;
};

function WeeklyOrdersWidget({
  kw, year, weekData, weekLoading, isCurrentWeek,
  onGoBack, onGoForward, onGoToday, onNavigate,
}: {
  kw: number; year: number;
  weekData: WeekData | undefined;
  weekLoading: boolean;
  isCurrentWeek: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  onGoToday: () => void;
  onNavigate: (path: string) => void;
}) {
  const [groupByHwp, setGroupByHwp] = useState(false);

  // Aufträge nach HWP gruppieren
  const hwpGroups = useMemo(() => {
    if (!weekData?.records) return [];
    const groups: Record<string, WeekRecord[]> = {};
    for (const r of weekData.records) {
      const hwp = (r.fields["Technician: Account: Account Name"] as string) ?? "Unbekannt";
      if (!groups[hwp]) groups[hwp] = [];
      groups[hwp].push(r);
    }
    return Object.entries(groups)
      .sort((a, b) => b[1].length - a[1].length)
      .map(([name, records]) => ({ name, records }));
  }, [weekData]);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base font-semibold">
              Wochenansicht – KW {kw} / {year}
            </CardTitle>
            {weekData && (
              <Badge variant="secondary" className="text-xs">
                {weekData.total} Aufträge
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Gruppierung umschalten */}
            <button
              onClick={() => setGroupByHwp((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                groupByHwp
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted/50"
              }`}
            >
              Nach HWP
            </button>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={onGoBack}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            {!isCurrentWeek && (
              <Button variant="outline" size="sm" className="h-7 text-xs px-2" onClick={onGoToday}>
                Heute
              </Button>
            )}
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={onGoForward}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate(`/auftraege?kw=${kw}&year=${year}`)}
              className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7 ml-1"
            >
              Alle anzeigen
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        {weekData && (
          <p className="text-xs text-muted-foreground mt-1">
            {new Date(weekData.weekStart + "T12:00:00").toLocaleDateString("de-DE")} –{" "}
            {new Date(weekData.weekEnd + "T12:00:00").toLocaleDateString("de-DE")}
          </p>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {weekLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            <span className="text-sm">Lade Wochendaten...</span>
          </div>
        ) : !weekData?.records.length ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <CalendarDays className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Keine Aufträge in KW {kw}</p>
          </div>
        ) : groupByHwp ? (
          // ── HWP-Gruppierung ──
          <div className="divide-y max-h-96 overflow-y-auto">
            {hwpGroups.map((group) => (
              <details key={group.name} className="group">
                <summary className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-muted/20 transition-colors list-none">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{group.records.length}</Badge>
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                  </div>
                </summary>
                <div className="bg-muted/10 divide-y">
                  {group.records.map((record) => {
                    const f = record.fields;
                    const status = f["Status"] as string | undefined;
                    const targetEnd = f["Target End"] as string | undefined;
                    return (
                      <div
                        key={record.id}
                        className="flex items-center justify-between pl-10 pr-5 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => onNavigate(`/auftraege/${record.id}`)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground truncate">
                              {(f["Opportunity Name"] as string) ?? "–"}
                            </p>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {(f["Order Number"] as string) ?? ""}
                            </span>
                          </div>
                          {targetEnd && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(targetEnd).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}
                            </p>
                          )}
                        </div>
                        <div className="ml-4 shrink-0">
                          {status && <StatusBadge status={status} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        ) : (
          // ── Standard-Ansicht: Tages-Übersicht + Liste ──
          <>
            {/* Tages-Übersicht */}
            <div className="grid grid-cols-7 gap-px bg-border mx-0 border-b">
              {weekData.grouped.map((day) => {
                const isToday = day.date === new Date().toISOString().split("T")[0];
                return (
                  <div
                    key={day.date}
                    className={`bg-background p-2 text-center ${isToday ? "bg-blue-50/60" : ""}`}
                  >
                    <p className={`text-xs font-semibold ${isToday ? "text-blue-600" : "text-muted-foreground"}`}>
                      {day.dayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(day.date + "T12:00:00").toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </p>
                    <p className={`text-lg font-bold mt-0.5 ${
                      day.count > 0
                        ? isToday ? "text-blue-600" : "text-foreground"
                        : "text-muted-foreground/30"
                    }`}>
                      {day.count}
                    </p>
                  </div>
                );
              })}
            </div>
            {/* Auftrags-Liste nach Tag gruppiert */}
            <div className="divide-y max-h-80 overflow-y-auto">
              {weekData.grouped
                .filter((day) => day.count > 0)
                .map((day) => (
                  <div key={day.date}>
                    <div className="px-5 py-1.5 bg-muted/30 flex items-center gap-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {day.dayName},{" "}
                        {new Date(day.date + "T12:00:00").toLocaleDateString("de-DE", {
                          day: "2-digit", month: "2-digit",
                        })}
                      </span>
                      <Badge variant="outline" className="text-xs py-0">{day.count}</Badge>
                    </div>
                    {day.records.map((record) => {
                      const f = record.fields;
                      const status = f["Status"] as string | undefined;
                      return (
                        <div
                          key={record.id}
                          className="flex items-center justify-between px-5 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => onNavigate(`/auftraege/${record.id}`)}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {(f["Opportunity Name"] as string) ?? "–"}
                              </p>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {(f["Order Number"] as string) ?? ""}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {(f["Technician: Account: Account Name"] as string) ?? "–"}
                            </p>
                          </div>
                          <div className="ml-4 shrink-0">
                            {status && <StatusBadge status={status} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              {weekData.records.length > 30 && (
                <div
                  className="px-5 py-3 text-center text-xs text-muted-foreground hover:bg-muted/30 cursor-pointer"
                  onClick={() => onNavigate(`/auftraege?kw=${kw}&year=${year}`)}
                >
                  Alle {weekData.records.length} Aufträge in der Auftragsübersicht anzeigen →
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── HWP-Widget ───────────────────────────────────────────────────────────────

function HwpWidget({
  stats, statsLoading, periodLabel,
}: {
  stats: { allHwp?: { name: string; count: number }[]; topHwp?: { name: string; count: number }[]; total?: number } | undefined;
  statsLoading: boolean;
  periodLabel?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const hwpList = stats?.allHwp ?? stats?.topHwp ?? [];
  const displayed = showAll ? hwpList : hwpList.slice(0, 8);
  const maxCount = hwpList[0]?.count ?? 1;

  return (
    <Card className="border shadow-sm lg:col-span-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base font-semibold">Handwerkspartner</CardTitle>
            {periodLabel && (
              <Badge variant="outline" className="text-xs ml-auto">{periodLabel}</Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">{hwpList.length} Partner</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-1.5 max-h-72 overflow-y-auto">
        {statsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lädt...</span>
          </div>
        ) : !hwpList.length ? (
          <p className="text-sm text-muted-foreground py-4">Keine Daten für diesen Zeitraum</p>
        ) : (
          <>
            {displayed.map((hwp, idx) => {
              const pct = Math.round((hwp.count / maxCount) * 100);
              return (
                <div key={hwp.name} className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-5 shrink-0 tabular-nums text-right">
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="text-xs font-medium truncate">{hwp.name}</p>
                      <span className="text-xs font-semibold tabular-nums ml-2 shrink-0">{hwp.count}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
            {hwpList.length > 8 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="w-full text-xs text-muted-foreground hover:text-foreground pt-1 text-center"
              >
                {showAll ? "Weniger anzeigen ↑" : `+ ${hwpList.length - 8} weitere anzeigen`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Schnellsuche ─────────────────────────────────────────────────────────────

function QuickSearch({ onNavigate, userRole }: { onNavigate: (path: string) => void; userRole?: string }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 300);
  const { data, isLoading } = trpc.dashboard.search.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 2 }
  );
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);
  const handleSelect = (id: string) => {
    const path = userRole === "hwp" ? `/hwp/auftraege/${id}` : `/auftraege/${id}`;
    onNavigate(path);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(e.target.value.length >= 2);
          }}
          onFocus={() => query.length >= 2 && setOpen(true)}
          placeholder="Auftrag suchen – Kundenname, DE-Nummer, SA-Nummer, Handwerkspartner..."
          className="pl-9 pr-9 h-11 text-sm bg-background border-border"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setOpen(false); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 overflow-hidden">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              Suche...
            </div>
          ) : !data?.results.length ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              Keine Ergebnisse für „{debouncedQuery}"
            </div>
          ) : (
            <div className="divide-y max-h-80 overflow-y-auto">
              {data.results.map((r) => (
                <button
                  key={r.id}
                  className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                  onClick={() => handleSelect(r.id)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {r.opportunityName ?? "–"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {r.orderNumber ?? r.appointmentNumber ?? ""}
                        </span>
                        {r.hwpName && (
                          <span className="text-xs text-muted-foreground truncate">
                            · {r.hwpName}
                          </span>
                        )}
                        {r.targetEnd && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            · {new Date(r.targetEnd).toLocaleDateString("de-DE")}
                          </span>
                        )}
                      </div>
                    </div>
                    {r.status && <StatusBadge status={r.status} />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Letzte Aktivitäten ───────────────────────────────────────────────────────

function RecentActivityWidget({ onNavigate }: { onNavigate: (path: string) => void }) {
  const { data, isLoading } = trpc.mehrkosten.list.useQuery(
    { pageSize: 6, sortField: "Created Date", sortDirection: "desc" },
    { staleTime: 0 }
  );

  return (
    <Card className="border shadow-sm lg:col-span-1">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-600" />
            <CardTitle className="text-base font-semibold">Letzte Aktivitäten</CardTitle>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onNavigate("/auftraege")}
            className="gap-1 text-xs text-muted-foreground hover:text-foreground h-7"
          >
            Alle
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center gap-2 px-5 py-4 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lädt...</span>
          </div>
        ) : !data?.records.length ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Building2 className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-xs">Keine Aufträge</p>
          </div>
        ) : (
          <div className="divide-y">
            {data.records.map((record) => {
              const f = record.fields;
              const status = f["Status"] as string | undefined;
              return (
                <div
                  key={record.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => onNavigate(`/auftraege/${record.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {(f["Opportunity Name"] as string) ?? "–"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(f["Technician: Account: Account Name"] as string) ?? "–"}
                    </p>
                  </div>
                  {status && <StatusBadge status={status} />}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── KPI-Karte ────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
  bg,
  onClick,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`border shadow-sm hover:shadow-md transition-shadow ${onClick ? "cursor-pointer" : ""}`}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {title}
            </p>
            <p className="text-3xl font-bold mt-1 text-foreground">{value}</p>
          </div>
          <div className={`p-3 rounded-xl ${bg}`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Debounce-Hook ────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
