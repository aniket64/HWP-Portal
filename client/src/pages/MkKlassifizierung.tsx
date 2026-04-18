import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Calculator, ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  entwurf:       { label: "Entwurf",       color: "bg-yellow-100 text-yellow-800" },
  eingereicht:   { label: "Eingereicht",   color: "bg-blue-100 text-blue-800" },
  terminiert:    { label: "Terminiert",    color: "bg-purple-100 text-purple-800" },
  nachtrag:      { label: "Nachtrag",      color: "bg-orange-100 text-orange-800" },
  freigegeben:   { label: "Freigegeben",   color: "bg-green-100 text-green-800" },
  abgelehnt:     { label: "Abgelehnt",     color: "bg-red-100 text-red-800" },
  abgeschlossen: { label: "Abgeschlossen", color: "bg-gray-100 text-gray-700" },
};

type SortField = "orderNumber" | "opportunityName" | "caseNumber" | "quelle" | "createdTime" | "status";
type SortDir = "asc" | "desc";

function SortIcon({ field, active, dir }: { field: string; active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="w-3 h-3 ml-1 text-primary" />
    : <ArrowDown className="w-3 h-3 ml-1 text-primary" />;
}

export default function MkKlassifizierung() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [quelle, setQuelle] = useState<"alle" | "tbk" | "ntbk">("alle");
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [page, setPage] = useState(1);
  const [sortField, setSortField] = useState<SortField>("createdTime");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [deleteTarget, setDeleteTarget] = useState<{ rechnungId: number; orderNumber: string } | null>(null);

  const utils = trpc.useUtils();
  const deleteMutation = trpc.mkKlassifizierung.deleteRechnung.useMutation({
    onSuccess: () => {
      utils.mkKlassifizierung.listKunden.invalidate();
      setDeleteTarget(null);
    },
  });

  const PAGE_SIZE = 25;

  // Alle Daten laden (ohne serverseitige Pagination, damit clientseitige Sortierung funktioniert)
  const { data, isLoading } = trpc.mkKlassifizierung.listKunden.useQuery({
    search,
    quelle,
    page: 1,
    pageSize: 500, // Alle auf einmal laden für clientseitige Sortierung
  });

  const allKunden = data?.kunden ?? [];

  // Clientseitiger Status-Filter
  const filtered = useMemo(() => {
    if (statusFilter === "alle") return allKunden;
    if (statusFilter === "offen") return allKunden.filter(k => !k.rechnung);
    return allKunden.filter(k => k.rechnung?.status === statusFilter);
  }, [allKunden, statusFilter]);

  // Clientseitige Sortierung
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";

      switch (sortField) {
        case "orderNumber":
          av = a.orderNumber ?? "";
          bv = b.orderNumber ?? "";
          break;
        case "opportunityName":
          av = a.opportunityName ?? "";
          bv = b.opportunityName ?? "";
          break;
        case "caseNumber":
          av = a.caseNumber ?? "";
          bv = b.caseNumber ?? "";
          break;
        case "quelle":
          av = a.quelle;
          bv = b.quelle;
          break;
        case "createdTime":
          av = new Date(a.createdTime).getTime();
          bv = new Date(b.createdTime).getTime();
          break;
        case "status":
          av = a.rechnung?.status ?? "zzz"; // Nicht bearbeitet ans Ende
          bv = b.rechnung?.status ?? "zzz";
          break;
      }

      const dir = sortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), "de") * dir;
    });
  }, [filtered, sortField, sortDir]);

  // Clientseitige Pagination
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("asc");
    }
    setPage(1);
  }

  function ThHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <th
        className="text-left px-4 py-3 font-medium cursor-pointer select-none hover:bg-muted/60 transition-colors"
        onClick={() => handleSort(field)}
      >
        <span className="inline-flex items-center">
          {label}
          <SortIcon field={field} active={active} dir={sortDir} />
        </span>
      </th>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">MK Klassifizierung</h1>
          <p className="text-muted-foreground mt-1">
            Mehrkosten-Einschätzung für Kunden aus den Klassifizierungstabellen
          </p>
        </div>

        {/* Filter-Zeile */}
        <div className="flex flex-wrap gap-3">
          {/* Freitextsuche */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Kunde, Bestellnummer, Fallnummer suchen..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="pl-9"
            />
          </div>

          {/* Quelle-Filter */}
          <Select value={quelle} onValueChange={v => { setQuelle(v as typeof quelle); setPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Tabellen</SelectItem>
              <SelectItem value="tbk">TBK</SelectItem>
              <SelectItem value="ntbk">nTBK</SelectItem>
            </SelectContent>
          </Select>

          {/* Status-Filter */}
          <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Status</SelectItem>
              <SelectItem value="offen">Noch nicht bearbeitet</SelectItem>
              <SelectItem value="entwurf">Entwurf</SelectItem>
              <SelectItem value="eingereicht">Eingereicht</SelectItem>
              <SelectItem value="nachtrag">Nachtrag</SelectItem>
              <SelectItem value="freigegeben">Freigegeben</SelectItem>
              <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
              <SelectItem value="terminiert">Terminiert</SelectItem>
              <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Ergebnis-Info */}
        {!isLoading && (
          <p className="text-sm text-muted-foreground -mt-2">
            {sorted.length} Einträge
            {statusFilter !== "alle" && ` · Filter: ${statusFilter === "offen" ? "Noch nicht bearbeitet" : STATUS_LABELS[statusFilter]?.label ?? statusFilter}`}
            {quelle !== "alle" && ` · ${quelle.toUpperCase()}`}
          </p>
        )}

        {/* Tabelle: Cards auf Mobile, Tabelle auf Desktop */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground">Lade Kunden...</div>
            ) : paged.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Keine Kunden gefunden</div>
            ) : (
              <>
                {/* Mobile Card-Liste */}
                <div className="block md:hidden divide-y">
                  {paged.map(k => {
                    const statusInfo = k.rechnung?.status ? STATUS_LABELS[k.rechnung.status] : null;
                    return (
                      <div
                        key={`${k.quelle}-${k.airtableId}`}
                        className="p-4 cursor-pointer hover:bg-muted/20 active:bg-muted/40 transition-colors"
                        onClick={() => navigate(`/mk/rechner/${encodeURIComponent(k.orderNumber)}?quelle=${k.quelle}&airtableId=${k.airtableId}`)}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div>
                            <div className="font-medium text-sm">{k.opportunityName || "–"}</div>
                            <div className="text-xs text-muted-foreground font-mono mt-0.5">{k.orderNumber || "–"}</div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Badge variant="outline" className="text-xs">{k.quelle === "tbk" ? "TBK" : "nTBK"}</Badge>
                            {statusInfo ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Offen</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{new Date(k.createdTime).toLocaleDateString("de-DE")}</span>
                          <div className="flex gap-2">
                            {k.rechnung?.status === "entwurf" && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={e => { e.stopPropagation(); setDeleteTarget({ rechnungId: k.rechnung!.id, orderNumber: k.orderNumber }); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            <Button size="sm" variant={k.rechnung ? "outline" : "default"} className="h-8"
                              onClick={e => { e.stopPropagation(); navigate(`/mk/rechner/${encodeURIComponent(k.orderNumber)}?quelle=${k.quelle}&airtableId=${k.airtableId}`); }}>
                              <Calculator className="w-3 h-3 mr-1" />
                              {k.rechnung ? "Öffnen" : "Klassifizieren"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Tabelle */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <ThHeader field="orderNumber" label="Bestellnummer" />
                        <ThHeader field="opportunityName" label="Opportunity" />
                        <ThHeader field="caseNumber" label="Fallnummer" />
                        <ThHeader field="quelle" label="Tabelle" />
                        <ThHeader field="createdTime" label="Erstellt" />
                        <ThHeader field="status" label="MK-Status" />
                        <th className="px-4 py-3" colSpan={2}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {paged.map(k => {
                        const statusInfo = k.rechnung?.status ? STATUS_LABELS[k.rechnung.status] : null;
                        return (
                          <tr key={`${k.quelle}-${k.airtableId}`} className="border-b hover:bg-muted/20 cursor-pointer"
                            onClick={() => navigate(`/mk/rechner/${encodeURIComponent(k.orderNumber)}?quelle=${k.quelle}&airtableId=${k.airtableId}`)}
                          >
                            <td className="px-4 py-3 font-mono text-xs">{k.orderNumber || "–"}</td>
                            <td className="px-4 py-3 font-medium max-w-[200px] truncate">{k.opportunityName || "–"}</td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{k.caseNumber || "–"}</td>
                            <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{k.quelle === "tbk" ? "TBK" : "nTBK"}</Badge></td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(k.createdTime).toLocaleDateString("de-DE")}</td>
                            <td className="px-4 py-3">
                              {statusInfo ? (
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground">Noch nicht bearbeitet</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Button size="sm" variant={k.rechnung ? "outline" : "default"}
                                onClick={e => { e.stopPropagation(); navigate(`/mk/rechner/${encodeURIComponent(k.orderNumber)}?quelle=${k.quelle}&airtableId=${k.airtableId}`); }}>
                                <Calculator className="w-3 h-3 mr-1" />{k.rechnung ? "Öffnen" : "Klassifizieren"}
                              </Button>
                            </td>
                            <td className="px-4 py-3">
                              {k.rechnung?.status === "entwurf" && (
                                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={e => { e.stopPropagation(); setDeleteTarget({ rechnungId: k.rechnung!.id, orderNumber: k.orderNumber }); }}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

      {/* Bestätigungs-Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Entwurf löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Entwurf für Auftrag <strong>{deleteTarget?.orderNumber}</strong> wird unwiderruflich gelöscht.
              Alle eingegebenen Positionen gehen verloren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate({ rechnungId: deleteTarget.rechnungId })}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Seite {safePage} von {totalPages} · {sorted.length} Einträge
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
                Zurück
              </Button>
              <Button variant="outline" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                Weiter
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
