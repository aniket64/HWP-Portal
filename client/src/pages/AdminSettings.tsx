import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Settings,
  RefreshCw,
  Database,
  Clock,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  Zap,
  ChevronUp,
  ChevronDown,
  Users,
  X,
  Plus,
  Search,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const SETTINGS_KEYS = {
  AIRTABLE_SYNC_INTERVAL: "airtable_sync_interval_minutes",
  AIRTABLE_LAST_SYNC: "airtable_last_sync",
  APP_NAME: "app_name",
  ITEMS_PER_PAGE: "items_per_page",
  ENABLE_NOTIFICATIONS: "enable_notifications",
  MAINTENANCE_MODE: "maintenance_mode",
};

export default function AdminSettings() {
  return (
    <DashboardLayout>
      <AdminSettingsContent />
    </DashboardLayout>
  );
}

function AdminSettingsContent() {
  const utils = trpc.useUtils();

  const { data: settings, isLoading: settingsLoading, refetch: refetchSettings } =
    trpc.settings.getAll.useQuery();
  const { data: cacheStats, isLoading: cacheLoading, refetch: refetchCache } =
    trpc.settings.cacheStats.useQuery();

  const setMany = trpc.settings.setMany.useMutation({
    onSuccess: () => {
      toast.success("Einstellungen gespeichert");
      refetchSettings();
      utils.settings.cacheStats.invalidate();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const clearCache = trpc.settings.clearCache.useMutation({
    onSuccess: (data) => {
      toast.success(`Cache geleert (${data.deletedEntries} Einträge gelöscht)`);
      refetchCache();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const forceSync = trpc.settings.forceSync.useMutation({
    onSuccess: (data) => {
      toast.success(data.message);
      refetchCache();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  // Lokale State-Werte
  const [syncInterval, setSyncInterval] = useState("60");
  const [appName, setAppName] = useState("HWP Partner Portal");
  const [itemsPerPage, setItemsPerPage] = useState("50");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  // Settings aus DB laden
  useEffect(() => {
    if (!settings) return;
    if (settings[SETTINGS_KEYS.AIRTABLE_SYNC_INTERVAL]) {
      setSyncInterval(settings[SETTINGS_KEYS.AIRTABLE_SYNC_INTERVAL]);
    }
    if (settings[SETTINGS_KEYS.APP_NAME]) {
      setAppName(settings[SETTINGS_KEYS.APP_NAME]);
    }
    if (settings[SETTINGS_KEYS.ITEMS_PER_PAGE]) {
      setItemsPerPage(settings[SETTINGS_KEYS.ITEMS_PER_PAGE]);
    }
    if (settings[SETTINGS_KEYS.ENABLE_NOTIFICATIONS]) {
      setNotificationsEnabled(settings[SETTINGS_KEYS.ENABLE_NOTIFICATIONS] === "true");
    }
    if (settings[SETTINGS_KEYS.MAINTENANCE_MODE]) {
      setMaintenanceMode(settings[SETTINGS_KEYS.MAINTENANCE_MODE] === "true");
    }
  }, [settings]);

  const handleSaveGeneral = () => {
    setMany.mutate([
      { key: SETTINGS_KEYS.APP_NAME, value: appName },
      { key: SETTINGS_KEYS.ITEMS_PER_PAGE, value: itemsPerPage },
      { key: SETTINGS_KEYS.ENABLE_NOTIFICATIONS, value: String(notificationsEnabled) },
      { key: SETTINGS_KEYS.MAINTENANCE_MODE, value: String(maintenanceMode) },
    ]);
  };

  const handleSaveSync = () => {
    const val = parseInt(syncInterval, 10);
    if (isNaN(val) || val < 1) {
      toast.error("Bitte geben Sie einen gültigen Wert (≥ 1 Minute) ein");
      return;
    }
    setMany.mutate([
      { key: SETTINGS_KEYS.AIRTABLE_SYNC_INTERVAL, value: String(val) },
    ]);
  };

  const formatLastSync = (iso: string | null | undefined) => {
    if (!iso) return "Noch nie";
    return new Date(iso).toLocaleString("de-DE");
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings className="h-6 w-6" />
          Admin-Einstellungen
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Systemkonfiguration und Airtable-Synchronisierung verwalten
        </p>
      </div>

      {/* ─── Allgemeine Einstellungen ─── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Allgemeine Einstellungen</CardTitle>
          <CardDescription className="text-sm">
            Grundlegende Konfiguration der Anwendung
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {settingsLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Einstellungen werden geladen...</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="app-name">Anwendungsname</Label>
                <Input
                  id="app-name"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="HWP Partner Portal"
                  className="max-w-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Wird in der Sidebar und im Browser-Tab angezeigt
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="items-per-page">Einträge pro Seite (Standard)</Label>
                <Input
                  id="items-per-page"
                  type="number"
                  min={10}
                  max={100}
                  value={itemsPerPage}
                  onChange={(e) => setItemsPerPage(e.target.value)}
                  className="max-w-[120px]"
                />
                <p className="text-xs text-muted-foreground">
                  Standard-Seitengröße für Auftrags-Listen (10–100)
                </p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Benachrichtigungen</Label>
                  <p className="text-xs text-muted-foreground">
                    E-Mail-Benachrichtigungen bei neuen Freigabe-Anfragen
                  </p>
                </div>
                <Switch
                  checked={notificationsEnabled}
                  onCheckedChange={setNotificationsEnabled}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Wartungsmodus</Label>
                  <p className="text-xs text-muted-foreground">
                    Nur Admins können sich einloggen
                  </p>
                </div>
                <Switch
                  checked={maintenanceMode}
                  onCheckedChange={setMaintenanceMode}
                />
              </div>

              {maintenanceMode && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  Wartungsmodus ist aktiv – nur Admins können sich anmelden
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveGeneral}
                  disabled={setMany.isPending}
                  className="gap-2"
                >
                  {setMany.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Speichern
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── Airtable Synchronisierung ─── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-600" />
            Airtable-Synchronisierung
          </CardTitle>
          <CardDescription className="text-sm">
            Steuern Sie, wie häufig Daten aus Airtable aktualisiert werden
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="sync-interval">Synchronisierungsintervall (Minuten)</Label>
            <div className="flex items-center gap-3">
              <Input
                id="sync-interval"
                type="number"
                min={1}
                max={1440}
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                className="max-w-[120px]"
              />
              <Button
                onClick={handleSaveSync}
                disabled={setMany.isPending}
                variant="outline"
                className="gap-2"
              >
                {setMany.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Speichern
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Airtable-Daten werden für diese Dauer im Cache gespeichert.
              Empfehlung: 30–60 Minuten für normale Nutzung, 5–15 Minuten für häufige Änderungen.
            </p>
          </div>

          {/* Schnellauswahl */}
          <div className="flex flex-wrap gap-2">
            {[5, 15, 30, 60, 120, 240].map((min) => (
              <Button
                key={min}
                variant={syncInterval === String(min) ? "default" : "outline"}
                size="sm"
                onClick={() => setSyncInterval(String(min))}
                className="text-xs"
              >
                {min < 60 ? `${min} Min` : `${min / 60} Std`}
              </Button>
            ))}
          </div>

          <Separator />

          {/* Letzter Sync + Sync-Buttons */}
          <div className="p-3 bg-muted/30 rounded-lg space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">Letzte Synchronisierung</p>
                <p className="text-xs text-muted-foreground">
                  {formatLastSync(settings?.[SETTINGS_KEYS.AIRTABLE_LAST_SYNC])}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                className="gap-2"
                onClick={() => forceSync.mutate({ deltaOnly: false })}
                disabled={forceSync.isPending}
                title="Lädt alle Datensätze neu von Airtable"
              >
                {forceSync.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Vollständiger Sync
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => forceSync.mutate({ deltaOnly: true })}
                disabled={forceSync.isPending}
                title="Lädt nur Einträge die seit dem letzten Sync geändert wurden"
              >
                {forceSync.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Delta-Sync (nur Änderungen)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              <strong>Vollständiger Sync:</strong> Lädt alle Aufträge neu (dauert länger). &nbsp;
              <strong>Delta-Sync:</strong> Nur geänderte Einträge seit dem letzten Sync (schneller).
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ─── Cache-Verwaltung ─── */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Database className="h-4 w-4 text-slate-600" />
            Cache-Verwaltung
          </CardTitle>
          <CardDescription className="text-sm">
            Übersicht und Verwaltung des Airtable-Daten-Caches
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {cacheLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Cache-Statistiken werden geladen...</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold">{cacheStats?.totalEntries ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Einträge gesamt</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-amber-600">{cacheStats?.expiredEntries ?? 0}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Abgelaufen</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{cacheStats?.ttlMinutes ?? 60}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">TTL (Minuten)</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-600">
                    {(cacheStats?.totalEntries ?? 0) - (cacheStats?.expiredEntries ?? 0)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Aktiv</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => refetchCache()}
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Aktualisieren
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  onClick={() => clearCache.mutate({ pattern: "mehrkosten" })}
                  disabled={clearCache.isPending}
                >
                  {clearCache.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Auftrags-Cache leeren
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => clearCache.mutate({})}
                  disabled={clearCache.isPending}
                >
                  {clearCache.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  Gesamten Cache leeren
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">
                Nach dem Leeren des Caches werden Daten beim nächsten Aufruf direkt von Airtable geladen.
                Dies kann einige Sekunden dauern.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {/* ─── HWP-Zuordnungen ─── */}
      <HwpZuordnungen />

      {/* ─── Dashboard-Widget-Konfiguration ─── */}
      <DashboardWidgetConfig />
    </div>
  );
}// ─── HWP-Zuordnungen (KAM/TOM → HWP-Partner) ──────────────────────────────────────

function HwpZuordnungen() {
  const utils = trpc.useUtils();

  // Alle KAM/TOM-Nutzer laden
  const { data: allUsers, isLoading: usersLoading } = trpc.users.list.useQuery();
  // Alle verfügbaren HWP-Accounts laden
  const { data: hwpAccounts, isLoading: accountsLoading } = trpc.users.listAirtableAccounts.useQuery();
  // Alle bestehenden Zuordnungen laden
  const { data: allAssignments, refetch: refetchAssignments } = trpc.users.getAllHwpAssignments.useQuery();

  const setAssignments = trpc.users.setHwpAssignments.useMutation({
    onSuccess: () => {
      toast.success("HWP-Zuordnungen gespeichert");
      refetchAssignments();
      utils.users.getAllHwpAssignments.invalidate();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  // Ausgewählter Nutzer für Bearbeitung
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  // Lokale Zuordnungen für den ausgewählten Nutzer
  const [localAssignments, setLocalAssignments] = useState<Array<{ hwpAccountId: string; hwpName: string }>>([]);
  // Suchfilter für HWP-Accounts
  const [hwpSearch, setHwpSearch] = useState("");

  // Nur KAM/TOM/TL-Nutzer anzeigen
  const relevantUsers = (allUsers ?? []).filter((u) => ['kam', 'tom', 'tl'].includes(u.role));

  // Wenn Nutzer ausgewählt wird, bestehende Zuordnungen laden
  const handleSelectUser = (userId: number) => {
    setSelectedUserId(userId);
    const existing = (allAssignments ?? []).filter((a) => a.userId === userId);
    setLocalAssignments(existing.map((a) => ({ hwpAccountId: a.hwpAccountId, hwpName: a.hwpName })));
    setHwpSearch("");
  };

  const toggleHwp = (accountId: string, accountName: string) => {
    setLocalAssignments((prev) => {
      const exists = prev.some((a) => a.hwpAccountId === accountId);
      if (exists) return prev.filter((a) => a.hwpAccountId !== accountId);
      return [...prev, { hwpAccountId: accountId, hwpName: accountName }];
    });
  };

  const handleSave = () => {
    if (selectedUserId === null) return;
    setAssignments.mutate({ userId: selectedUserId, assignments: localAssignments });
  };

  const filteredHwpAccounts = (hwpAccounts ?? []).filter((a) =>
    !hwpSearch || a.name.toLowerCase().includes(hwpSearch.toLowerCase())
  );

  const selectedUser = relevantUsers.find((u) => u.id === selectedUserId);

  const ROLE_LABELS: Record<string, string> = { kam: 'KAM', tom: 'TOM', tl: 'TL' };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="h-4 w-4 text-indigo-600" />
          HWP-Zuordnungen
        </CardTitle>
        <CardDescription className="text-sm">
          Legen Sie fest, welche HWP-Partner einem KAM, TOM oder TL zugeordnet sind.
          Eingeloggte KAM/TOM/TL sehen nur Aufträge ihrer zugeordneten HWPs.
          Ohne Zuordnung werden alle Aufträge angezeigt.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {usersLoading || accountsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Nutzer und HWP-Accounts...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Linke Spalte: Nutzer-Liste */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">KAM / TOM / TL</p>
              {relevantUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">Keine KAM/TOM/TL-Nutzer vorhanden</p>
              ) : (
                <div className="space-y-1">
                  {relevantUsers.map((u) => {
                    const count = (allAssignments ?? []).filter((a) => a.userId === u.id).length;
                    return (
                      <button
                        key={u.id}
                        onClick={() => handleSelectUser(u.id)}
                        className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                          selectedUserId === u.id
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'hover:bg-muted/40 border-transparent'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium truncate">{u.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Badge variant="outline" className="text-xs px-1.5 py-0">
                              {ROLE_LABELS[u.role] ?? u.role.toUpperCase()}
                            </Badge>
                            {count > 0 && (
                              <Badge className="text-xs px-1.5 py-0 bg-indigo-100 text-indigo-700 border-0">
                                {count}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-xs opacity-70 truncate mt-0.5">{u.email}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mittlere Spalte: HWP-Auswahl */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Verfügbare HWPs
                {selectedUser && <span className="normal-case font-normal ml-1">für {selectedUser.name}</span>}
              </p>
              {!selectedUser ? (
                <p className="text-sm text-muted-foreground py-4">Bitte links einen Nutzer auswählen</p>
              ) : (
                <>
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
                  <ScrollArea className="h-64 border rounded-md">
                    <div className="p-1 space-y-0.5">
                      {filteredHwpAccounts.length === 0 ? (
                        <p className="text-sm text-muted-foreground p-3">Keine HWPs gefunden</p>
                      ) : (
                        filteredHwpAccounts.map((a) => {
                          const isSelected = localAssignments.some((la) => la.hwpAccountId === a.accountId);
                          return (
                            <button
                              key={a.accountId}
                              onClick={() => toggleHwp(a.accountId, a.accountName)}
                              className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center justify-between ${
                                isSelected ? 'bg-indigo-50 text-indigo-800' : 'hover:bg-muted/40'
                              }`}
                            >
                              <span className="truncate">{a.name}</span>
                              {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-600 shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </ScrollArea>
                </>
              )}
            </div>

            {/* Rechte Spalte: Ausgewählte HWPs + Speichern */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Zugeordnete HWPs
                {localAssignments.length > 0 && (
                  <span className="ml-1 normal-case font-normal">({localAssignments.length})</span>
                )}
              </p>
              {!selectedUser ? (
                <p className="text-sm text-muted-foreground py-4">–</p>
              ) : localAssignments.length === 0 ? (
                <div className="border rounded-md p-4 text-center">
                  <p className="text-sm text-muted-foreground">Keine HWPs zugeordnet</p>
                  <p className="text-xs text-muted-foreground mt-1">Alle Aufträge werden angezeigt</p>
                </div>
              ) : (
                <ScrollArea className="h-52 border rounded-md">
                  <div className="p-1 space-y-0.5">
                    {localAssignments.map((a) => (
                      <div
                        key={a.hwpAccountId}
                        className="flex items-center justify-between px-3 py-2 rounded text-sm bg-indigo-50"
                      >
                        <span className="truncate text-indigo-800">{a.hwpName}</span>
                        <button
                          onClick={() => toggleHwp(a.hwpAccountId, a.hwpName)}
                          className="ml-2 text-indigo-400 hover:text-red-500 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {selectedUser && (
                <Button
                  onClick={handleSave}
                  disabled={setAssignments.isPending}
                  className="w-full gap-2"
                  size="sm"
                >
                  {setAssignments.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Zuordnung speichern
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Dashboard Widget-Konfiguration ────────────────────────────────────────────

function DashboardWidgetConfig() {
  const { data: widgetConfig, isLoading, refetch } = trpc.dashboard.getWidgetConfig.useQuery();
  const saveConfig = trpc.dashboard.saveWidgetConfig.useMutation({
    onSuccess: () => {
      toast.success("Dashboard-Konfiguration gespeichert");
      refetch();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const [localConfig, setLocalConfig] = useState<Array<{
    id: string; label: string; enabled: boolean; order: number;
  }>>([]);

  useEffect(() => {
    if (widgetConfig) setLocalConfig([...widgetConfig].sort((a, b) => a.order - b.order));
  }, [widgetConfig]);

  const toggleWidget = (id: string) => {
    setLocalConfig((prev) =>
      prev.map((w) => (w.id === id ? { ...w, enabled: !w.enabled } : w))
    );
  };

  const moveWidget = (id: string, dir: -1 | 1) => {
    setLocalConfig((prev) => {
      const sorted = [...prev].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((w) => w.id === id);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= sorted.length) return prev;
      const updated = sorted.map((w, i) => {
        if (i === idx) return { ...w, order: sorted[newIdx].order };
        if (i === newIdx) return { ...w, order: sorted[idx].order };
        return w;
      });
      return updated;
    });
  };

  const handleSave = () => {
    saveConfig.mutate(localConfig);
  };

  const widgetLabels: Record<string, string> = {
    kpi_total: "KPI: Gesamt Aufträge",
    kpi_freigegeben: "KPI: Freigegeben",
    kpi_abgelehnt: "KPI: Abgelehnt",
    kpi_ausstehend: "KPI: Ausstehend",
    kpi_mehrkosten: "KPI: Gesamt Mehrkosten",
    kpi_pauschalen: "KPI: Gesamt Pauschalen",
    weekly_orders: "Wochenansicht",
    status_chart: "Status-Verteilung",
    top_hwp: "Top HWP-Partner",
    recent_activity: "Letzte Aktivitäten",
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-blue-600" />
          Dashboard-Widgets anpassen
        </CardTitle>
        <CardDescription className="text-sm">
          Aktivieren oder deaktivieren Sie einzelne Widgets und ändern Sie deren Reihenfolge.
          Die Einstellungen gelten für alle Benutzer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Lade Widget-Konfiguration...</span>
          </div>
        ) : (
          <div className="space-y-2">
            {[...localConfig].sort((a, b) => a.order - b.order).map((widget, idx) => (
              <div
                key={widget.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-background hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Switch
                    checked={widget.enabled}
                    onCheckedChange={() => toggleWidget(widget.id)}
                  />
                  <div>
                    <p className={`text-sm font-medium ${!widget.enabled ? "text-muted-foreground line-through" : ""}`}>
                      {widgetLabels[widget.id] ?? widget.label}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveWidget(widget.id, -1)}
                    disabled={idx === 0}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveWidget(widget.id, 1)}
                    disabled={idx === localConfig.length - 1}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={saveConfig.isPending}
                className="gap-2"
              >
                {saveConfig.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Konfiguration speichern
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
