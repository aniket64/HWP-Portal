import { useState, useCallback, useMemo, Fragment } from "react";
import { useSearch, useLocation } from "wouter";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Search, ArrowUpDown, Loader2, RefreshCw, X, ChevronDown, ChevronRight, FileText } from "lucide-react";

// ─── Typen ────────────────────────────────────────────────────────────────────

type PauschalenRecord = {
  id: string;
  fields: {
    Pauschalen_ID?: string;
    HWP_Select?: string;
    start_date?: string;
    end_date?: string;
    "1_uv"?: number;
    "2_uv"?: number;
    "3_uv"?: number;
    "4_uv"?: number;
    okf?: number;
    storno?: number;
    max_distance?: number;
    sondertouren?: number;
    "Sondertour-Ausfall"?: number;
    zusatzvereinbarungen?: string;
    [key: string]: unknown;
  };
  createdTime: string;
};

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

// ─── Sortieroptionen ──────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { value: "1_uv", label: "1 UV (Pauschale)" },
  { value: "2_uv", label: "2 UVs (Pauschale)" },
  { value: "3_uv", label: "3 UVs (Pauschale)" },
  { value: "4_uv", label: "4 UVs (Pauschale)" },
  { value: "HWP_Select", label: "HWP-Name (A–Z)" },
  { value: "max_distance", label: "Max. Distanz" },
];

// ─── Haupt-Komponente ─────────────────────────────────────────────────────────

export default function Pauschalen() {
  return (
    <DashboardLayout>
      <KonditionenContent />
    </DashboardLayout>
  );
}

function KonditionenContent() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = useCallback((id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
      setLocation(`/pauschalen?${params.toString()}`, { replace: true });
    },
    [setLocation]
  );

  const search = urlParams.get("q") ?? "";
  const sortField = urlParams.get("sort") ?? "1_uv";
  const sortDirection = (urlParams.get("dir") ?? "desc") as "asc" | "desc";

  const [searchInput, setSearchInput] = useState(search);

  const { data, isLoading, isFetching, refetch } = trpc.pauschalen.list.useQuery(
    { search: search || undefined, sortField, sortDirection },
    { staleTime: 0, retry: 2 }
  );

  const records = (data?.records ?? []) as PauschalenRecord[];

  const handleSearch = useCallback(() => {
    setParam("q", searchInput);
  }, [searchInput, setParam]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // Spaltenüberschrift mit Sortier-Toggle
  const SortHeader = ({
    field,
    label,
    className = "",
  }: {
    field: string;
    label: string;
    className?: string;
  }) => (
    <TableHead
      className={`cursor-pointer hover:text-foreground whitespace-nowrap select-none ${className}`}
      onClick={() => {
        if (sortField === field) {
          setParam("dir", sortDirection === "asc" ? "desc" : "asc");
        } else {
          const params = new URLSearchParams(window.location.search);
          params.set("sort", field);
          params.set("dir", "desc");
          setLocation(`/pauschalen?${params.toString()}`, { replace: true });
        }
      }}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown
          className={`h-3 w-3 ${
            sortField === field ? "opacity-100 text-primary" : "opacity-40"
          }`}
        />
      </div>
    </TableHead>
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Konditionen</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Aktuelle Vergütungskonditionen je HWP-Partner nach UV-Anzahl
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2"
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {isFetching ? "Lädt..." : "Aktualisieren"}
        </Button>
      </div>

      {/* Filter-Leiste */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Suche */}
            <div className="flex gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="HWP-Partner suchen..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSearch} variant="default">
                Suchen
              </Button>
              {search && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSearchInput("");
                    setParam("q", null);
                  }}
                  title="Suche zurücksetzen"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* Sortierung */}
            <Select
              value={sortField}
              onValueChange={(v) => {
                const params = new URLSearchParams(window.location.search);
                params.set("sort", v);
                params.set("dir", "desc");
                setLocation(`/pauschalen?${params.toString()}`, { replace: true });
              }}
            >
              <SelectTrigger className="w-[200px]">
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
        </CardContent>
      </Card>

      {/* Tabelle */}
      <Card className="border shadow-sm overflow-hidden">
        {!isLoading && records.length > 0 && (
          <div className="px-4 py-2.5 border-b bg-muted/20 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{records.length}</span> HWP-Partner
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-8" />
                <SortHeader field="HWP_Select" label="HWP-Partner" />
                <SortHeader field="1_uv" label="1 UV" className="text-right" />
                <SortHeader field="2_uv" label="2 UVs" className="text-right" />
                <SortHeader field="3_uv" label="3 UVs" className="text-right" />
                <SortHeader field="4_uv" label="4 UVs" className="text-right" />
                <SortHeader field="okf" label="OKF" className="text-right" />
                <SortHeader field="storno" label="Storno" className="text-right" />
                <SortHeader field="sondertouren" label="Sondertour" className="text-right" />
                <SortHeader field="Sondertour-Ausfall" label="ST-Ausfall" className="text-right" />
                <SortHeader field="max_distance" label="Max. km" className="text-right" />
                <TableHead className="whitespace-nowrap">Gültig von</TableHead>
                <TableHead className="whitespace-nowrap">Gültig bis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={13} className="text-center py-16">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mt-2">
                      Lade Konditionen aus Airtable...
                    </p>
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={13}
                    className="text-center py-16 text-muted-foreground"
                  >
                    <p className="text-sm font-medium">Keine Konditionen gefunden</p>
                    {search && (
                      <p className="text-xs mt-1">Suche anpassen oder zurücksetzen</p>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => {
                  const f = record.fields;
                  const isExpanded = expandedRows.has(record.id);
                  // Airtable befüllt leere Felder mit "-" als Platzhalter – das als leer behandeln
                  const zusatzText = f.zusatzvereinbarungen?.trim() ?? "";
                  const hasZusatz = zusatzText.length > 0 && zusatzText !== "-" && zusatzText !== "–";
                  return (
                    <Fragment key={record.id}>
                      <TableRow
                        className={`hover:bg-muted/20 ${isExpanded ? "bg-muted/10" : ""}`}
                      >
                        {/* Expand-Toggle */}
                        <TableCell className="w-8 pr-0">
                          {hasZusatz ? (
                            <button
                              onClick={() => toggleRow(record.id)}
                              className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                              title={isExpanded ? "Zusatzvereinbarungen ausblenden" : "Zusatzvereinbarungen anzeigen"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronRight className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : (
                            <span className="w-6 h-6 block" />
                          )}
                        </TableCell>

                        {/* HWP-Name */}
                        <TableCell className="font-medium whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {f.HWP_Select ?? "–"}
                            {hasZusatz && (
                              <span title="Hat Zusatzvereinbarungen">
                                <FileText className="h-3 w-3 text-blue-500 shrink-0" />
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* UV-Pauschalen */}
                        {(["1_uv", "2_uv", "3_uv", "4_uv"] as const).map((uvKey) => (
                          <TableCell key={uvKey} className="text-right tabular-nums">
                            <span className="font-medium text-blue-700">
                              {formatCurrency(f[uvKey])}
                            </span>
                          </TableCell>
                        ))}

                        {/* OKF */}
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(f.okf)}
                        </TableCell>

                        {/* Storno */}
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(f.storno)}
                        </TableCell>

                        {/* Sondertouren */}
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(f.sondertouren)}
                        </TableCell>

                        {/* Sondertour-Ausfall */}
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(f["Sondertour-Ausfall"])}
                        </TableCell>

                        {/* Max. Distanz */}
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {f.max_distance != null ? `${f.max_distance} km` : "–"}
                        </TableCell>

                        {/* Gültig von */}
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(f.start_date)}
                        </TableCell>

                        {/* Gültig bis */}
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(f.end_date)}
                        </TableCell>
                      </TableRow>

                      {/* Zusatzvereinbarungen-Zeile (ausklappbar) */}
                      {isExpanded && hasZusatz && (
                        <TableRow className="bg-blue-50/40 hover:bg-blue-50/60">
                          <TableCell />
                          <TableCell colSpan={12} className="py-3 pr-6">
                            <div className="flex items-start gap-2">
                              <FileText className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-xs font-semibold text-blue-700 mb-1">Zusatzvereinbarungen</p>
                                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                                  {f.zusatzvereinbarungen}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
