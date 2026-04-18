import { useState, useMemo, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import {
  Card, CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft, ChevronRight, Calendar, ExternalLink, FileText,
  Printer, AlertTriangle, CheckCircle2, Clock, Zap, Wrench,
  ClipboardList, Info, StickyNote, EyeOff, Eye, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function getCurrentKW(): { kw: number; year: number } {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const diff = now.getTime() - kw1Monday.getTime();
  const kw = Math.floor(diff / (7 * 24 * 60 * 60 * 1000)) + 1;
  return { kw: Math.max(1, Math.min(53, kw)), year: now.getFullYear() };
}

function getKWDateRange(kw: number, year: number) {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const kw1Monday = new Date(jan4);
  kw1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
  const monday = new Date(kw1Monday);
  monday.setDate(kw1Monday.getDate() + (kw - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday, sunday };
}

function formatDate(dateStr: string) {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  return d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function formatCurrency(val?: number) {
  if (val == null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(val);
}

function RisikoBadge({ risiko }: { risiko?: string }) {
  if (!risiko) return null;
  const r = risiko.toLowerCase();
  if (r.includes("hoch") || r.includes("high"))
    return <Badge variant="destructive" className="text-xs print:border print:border-red-600 print:text-red-700 print:bg-transparent">{risiko}</Badge>;
  if (r.includes("mittel") || r.includes("medium"))
    return <Badge className="bg-orange-500 text-white text-xs print:border print:border-orange-500 print:text-orange-700 print:bg-transparent">{risiko}</Badge>;
  return <Badge className="bg-green-600 text-white text-xs print:border print:border-green-600 print:text-green-700 print:bg-transparent">{risiko}</Badge>;
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("complet") || s.includes("abgeschlossen"))
    return <Badge className="bg-green-600 text-white text-xs">{status}</Badge>;
  if (s.includes("cancel") || s.includes("abgesagt"))
    return <Badge variant="destructive" className="text-xs">{status}</Badge>;
  if (s.includes("scheduled") || s.includes("geplant"))
    return <Badge className="bg-blue-600 text-white text-xs">{status}</Badge>;
  return <Badge variant="secondary" className="text-xs">{status}</Badge>;
}

// ─── Typen ────────────────────────────────────────────────────────────────────

type AuftragItem = {
  airtableId: string;
  orderNumber: string;
  appointmentNumber: string;
  opportunityName: string;
  hwpName: string;
  status: string;
  targetEnd: string;
  sfLink?: string;
  mvtLink?: string;
  ipaLink?: string;
  skill: string;
  module: number;
  pauschale: number;
  klassi: {
    klassifizierungAbgeschlossen?: boolean;
    status?: string;
    risikobewertung?: string;
    komplex?: boolean;
    bauzeit?: string;
    mehrkostenabschaetzung?: number;
    zaehlerSchrank?: string;
    tabHinweise?: string;
    wichtigeNotizen?: string;
    uvDetails?: Array<{ nr: number; todo?: string; montage?: string; zuleitung?: string }>;
    hak?: string[];
    achGrund?: string[];
    absprachen?: string;
    okf?: boolean;
    tbk?: string;
  } | null;
};

// Ausblend-Einstellungen pro Auftrag
type AuftragVisibility = {
  hidden: boolean;          // Auftrag komplett ausblenden
  hideMeta: boolean;        // Meta-Infos (Nrn., Skill, Module, Pauschale) ausblenden
  hideKlassi: boolean;      // ACH-Klassifizierung ausblenden
};

const DEFAULT_VISIBILITY: AuftragVisibility = {
  hidden: false,
  hideMeta: false,
  hideKlassi: false,
};

// ─── Toggle-Button Hilfkomponente ─────────────────────────────────────────────

function ToggleBtn({
  active,
  onClick,
  label,
  activeLabel,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  activeLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors print:hidden
        ${active
          ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
        }`}
    >
      {active ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
      {active ? activeLabel : label}
    </button>
  );
}

// ─── Auftragskarte ────────────────────────────────────────────────────────────

function AuftragKarte({
  auftrag,
  index,
  hinweis,
  onHinweisChange,
  visibility,
  onVisibilityChange,
}: {
  auftrag: AuftragItem;
  index: number;
  hinweis: string;
  onHinweisChange: (val: string) => void;
  visibility: AuftragVisibility;
  onVisibilityChange: (v: Partial<AuftragVisibility>) => void;
}) {
  const { klassi } = auftrag;
  const hasKlassi = klassi != null;

  // Komplett ausgeblendet: nur Platzhalter auf dem Bildschirm, gar nichts im Druck
  if (visibility.hidden) {
    return (
      <div className="border border-dashed rounded-lg p-3 mb-4 bg-muted/20 flex items-center justify-between gap-2 print:hidden">
        <span className="text-sm text-muted-foreground line-through">
          #{index + 1} – {auftrag.opportunityName || auftrag.orderNumber}
        </span>
        <ToggleBtn
          active={true}
          onClick={() => onVisibilityChange({ hidden: false })}
          label=""
          activeLabel="Einblenden"
        />
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 mb-4 bg-card shadow-sm print:shadow-none print:border-gray-300 print:rounded-none print:mb-3 print:p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-base font-bold text-foreground print:text-black">
            #{index + 1} – {auftrag.opportunityName || auftrag.orderNumber}
          </span>
          <StatusBadge status={auftrag.status} />
          {klassi?.komplex && <Badge className="bg-purple-600 text-white text-xs print:border print:border-purple-600 print:text-purple-700 print:bg-transparent">Komplex</Badge>}
          {klassi?.okf && <Badge className="bg-orange-500 text-white text-xs print:border print:border-orange-500 print:text-orange-700 print:bg-transparent">OKF</Badge>}
          {klassi?.tbk && <Badge variant="outline" className="text-xs">{klassi.tbk}</Badge>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-muted-foreground font-medium print:text-gray-600">{formatDate(auftrag.targetEnd)}</span>
          {/* Ausblend-Toggles – nur auf dem Bildschirm */}
          <div className="flex items-center gap-1 print:hidden">
            <ToggleBtn
              active={visibility.hideMeta}
              onClick={() => onVisibilityChange({ hideMeta: !visibility.hideMeta })}
              label="Meta"
              activeLabel="Meta ausgeblendet"
            />
            <ToggleBtn
              active={visibility.hideKlassi}
              onClick={() => onVisibilityChange({ hideKlassi: !visibility.hideKlassi })}
              label="Klassi"
              activeLabel="Klassi ausgeblendet"
            />
            <ToggleBtn
              active={false}
              onClick={() => onVisibilityChange({ hidden: true })}
              label="Auftrag ausblenden"
              activeLabel=""
            />
          </div>
        </div>
      </div>

      {/* Meta-Infos */}
      {!visibility.hideMeta && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm mb-3 print:text-xs print:text-gray-700">
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32 shrink-0 print:text-gray-500">Auftragsnr.</span>
            <span className="font-medium">{auftrag.orderNumber || "–"}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-muted-foreground w-32 shrink-0 print:text-gray-500">SA-Nr.</span>
            <span className="font-medium">{auftrag.appointmentNumber || "–"}</span>
          </div>
          {auftrag.skill && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-32 shrink-0 print:text-gray-500">Skill</span>
              <span className="font-medium">{auftrag.skill}</span>
            </div>
          )}
          {auftrag.module > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-32 shrink-0 print:text-gray-500">Module</span>
              <span className="font-medium">{auftrag.module}</span>
            </div>
          )}
          {auftrag.pauschale > 0 && (
            <div className="flex gap-2">
              <span className="text-muted-foreground w-32 shrink-0 print:text-gray-500">Pauschale</span>
              <span className="font-medium">{formatCurrency(auftrag.pauschale)}</span>
            </div>
          )}
        </div>
      )}
      {visibility.hideMeta && (
        <p className="text-xs text-muted-foreground italic mb-3 print:hidden">Meta-Infos ausgeblendet</p>
      )}

      {/* Links – NUR auf dem Bildschirm, NICHT im Druck */}
      <div className="flex flex-wrap gap-2 mb-3 print:hidden">
        {auftrag.sfLink && (
          <a href={auftrag.sfLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <ExternalLink className="h-3 w-3" /> Salesforce
          </a>
        )}
        {auftrag.mvtLink && (
          <a href={auftrag.mvtLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <FileText className="h-3 w-3" /> MVT-Protokoll
          </a>
        )}
        {auftrag.ipaLink && (
          <a href={auftrag.ipaLink} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:underline">
            <ExternalLink className="h-3 w-3" /> IPA-Protokoll
          </a>
        )}
      </div>

      {/* Klassifizierungsblock */}
      {!visibility.hideKlassi && (
        <>
          {hasKlassi ? (
            <div className="bg-muted/40 rounded-md p-3 border border-border/60 mt-2 print:bg-gray-50 print:border-gray-200 print:rounded-none">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-3.5 w-3.5 text-muted-foreground print:hidden" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide print:text-gray-600">ACH-Klassifizierung</span>
                {klassi.klassifizierungAbgeschlossen
                  ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 print:hidden" />
                  : <Clock className="h-3.5 w-3.5 text-yellow-500 print:hidden" />}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm print:text-xs print:text-gray-700">
                {klassi.risikobewertung && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground w-36 shrink-0 print:text-gray-500">Risiko</span>
                    <RisikoBadge risiko={klassi.risikobewertung} />
                  </div>
                )}
                {klassi.bauzeit && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-36 shrink-0 print:text-gray-500">Bauzeit</span>
                    <span className="font-medium">{klassi.bauzeit}</span>
                  </div>
                )}
                {klassi.mehrkostenabschaetzung != null && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-36 shrink-0 print:text-gray-500">MK-Schätzung</span>
                    <span className="font-medium">{formatCurrency(klassi.mehrkostenabschaetzung)}</span>
                  </div>
                )}
                {klassi.zaehlerSchrank && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-36 shrink-0 print:text-gray-500">Zählerschrank</span>
                    <span className="font-medium">{klassi.zaehlerSchrank}</span>
                  </div>
                )}
                {klassi.hak && klassi.hak.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-36 shrink-0 print:text-gray-500">HAK</span>
                    <span className="font-medium">{klassi.hak.join(", ")}</span>
                  </div>
                )}
                {klassi.achGrund && klassi.achGrund.length > 0 && (
                  <div className="flex gap-2">
                    <span className="text-muted-foreground w-36 shrink-0 print:text-gray-500">ACH-Grund</span>
                    <span className="font-medium">{klassi.achGrund.join(", ")}</span>
                  </div>
                )}
              </div>

              {/* UV-Details */}
              {klassi.uvDetails && klassi.uvDetails.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/40 print:border-gray-200">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 print:text-gray-600">UV-Details</p>
                  <div className="space-y-1">
                    {klassi.uvDetails.map((uv) => (
                      <div key={uv.nr} className="text-xs print:text-gray-700">
                        <span className="font-medium text-foreground print:text-black">UV{uv.nr}: </span>
                        {[uv.todo, uv.montage, uv.zuleitung ? `Zuleitung ${uv.zuleitung} m` : ""].filter(Boolean).join(" · ")}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB-Hinweise */}
              {klassi.tabHinweise && klassi.tabHinweise !== "/" && klassi.tabHinweise !== "-" && (
                <div className="mt-2 pt-2 border-t border-border/40 print:border-gray-200">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1 print:text-gray-600">
                    <AlertTriangle className="h-3 w-3 text-yellow-500 print:hidden" /> TAB-Hinweise
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap print:text-gray-700">{klassi.tabHinweise}</p>
                </div>
              )}

              {/* Wichtige Notizen */}
              {klassi.wichtigeNotizen && klassi.wichtigeNotizen !== "-" && (
                <div className="mt-2 pt-2 border-t border-border/40 print:border-gray-200">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 flex items-center gap-1 print:text-gray-600">
                    <Info className="h-3 w-3 text-blue-500 print:hidden" /> Wichtige Notizen
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap print:text-gray-700">{klassi.wichtigeNotizen}</p>
                </div>
              )}

              {/* Absprachen */}
              {klassi.absprachen && (
                <div className="mt-2 pt-2 border-t border-border/40 print:border-gray-200">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 print:text-gray-600">Absprachen</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap print:text-gray-700">{klassi.absprachen}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground italic print:hidden">
              <Clock className="h-3 w-3" />
              Keine Klassifizierungsdaten verfügbar
            </div>
          )}
        </>
      )}
      {visibility.hideKlassi && (
        <p className="text-xs text-muted-foreground italic mt-2 print:hidden">Klassifizierung ausgeblendet</p>
      )}

      {/* ── Hinweis pro Auftrag ─────────────────────────────────── */}
      {/* Bildschirm: editierbares Textfeld */}
      <div className="mt-3 print:hidden">
        <div className="flex items-start gap-2">
          <StickyNote className="h-3.5 w-3.5 text-yellow-500 mt-2 shrink-0" />
          <Textarea
            placeholder="Hinweis zu diesem Auftrag hinzufügen..."
            value={hinweis}
            onChange={(e) => onHinweisChange(e.target.value)}
            className="min-h-[60px] text-xs resize-none border-yellow-200 focus:border-yellow-400 bg-yellow-50/50 placeholder:text-yellow-400"
          />
        </div>
      </div>
      {/* Druck: Hinweis nur wenn vorhanden */}
      {hinweis && (
        <div className="hidden print:block mt-3 p-2 border border-yellow-300 bg-yellow-50 rounded">
          <p className="text-xs font-semibold text-gray-700 mb-1">Hinweis</p>
          <p className="text-xs text-gray-800 whitespace-pre-wrap">{hinweis}</p>
        </div>
      )}
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function Wochenplanung() {
  const { user } = useAuth();
  const currentKW = useMemo(() => getCurrentKW(), []);
  const [kw, setKw] = useState(currentKW.kw);
  const [year, setYear] = useState(currentKW.year);
  const [selectedHwpId, setSelectedHwpId] = useState<string>("");
  // Hinweise pro Auftrag: key = airtableId
  const [hinweise, setHinweise] = useState<Record<string, string>>({});
  // Ausblend-Einstellungen pro Auftrag: key = airtableId
  const [visibilities, setVisibilities] = useState<Record<string, AuftragVisibility>>({});

  function setHinweisForAuftrag(id: string, val: string) {
    setHinweise(prev => ({ ...prev, [id]: val }));
  }

  function setVisibilityForAuftrag(id: string, patch: Partial<AuftragVisibility>) {
    setVisibilities(prev => ({
      ...prev,
      [id]: { ...(prev[id] ?? DEFAULT_VISIBILITY), ...patch },
    }));
  }

  // HWPs für diese KW laden
  const { data: hwps, isLoading: hwpsLoading } = trpc.wochenplanung.getHwpsForKW.useQuery(
    { kw, year },
    { enabled: !!(user && ["admin", "tom", "kam", "tl"].includes((user as any).role)) }
  );

  const [bypassCache, setBypassCache] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Wochenplanung laden wenn HWP ausgewählt
  const { data: plan, isLoading: planLoading, refetch: refetchPlan } = trpc.wochenplanung.getByHwpAndKW.useQuery(
    { hwpAccountId: selectedHwpId, kw, year, bypassCache },
    { enabled: !!selectedHwpId }
  );
  async function handleRefresh() {
    if (!selectedHwpId) return;
    setIsRefreshing(true);
    setBypassCache(true);
    try {
      await refetchPlan();
      toast.success('Daten aktualisiert – direkt aus Airtable geladen');
    } catch {
      toast.error('Aktualisierung fehlgeschlagen');
    } finally {
      setBypassCache(false);
      setIsRefreshing(false);
    }
  }

  const { monday, sunday } = useMemo(() => getKWDateRange(kw, year), [kw, year]);

  // Hinweise + Sichtbarkeit zurücksetzen wenn HWP oder KW wechselt
  useEffect(() => {
    setHinweise({});
    setVisibilities({});
  }, [selectedHwpId, kw, year]);

  function prevKW() {
    if (kw === 1) { setKw(52); setYear(y => y - 1); }
    else setKw(k => k - 1);
    setSelectedHwpId("");
  }
  function nextKW() {
    if (kw === 52) { setKw(1); setYear(y => y + 1); }
    else setKw(k => k + 1);
    setSelectedHwpId("");
  }
  function goToCurrentKW() {
    setKw(currentKW.kw);
    setYear(currentKW.year);
    setSelectedHwpId("");
  }

  function handlePrint() {
    if (!plan || plan.auftraege.length === 0) {
      toast.error("Keine Aufträge zum Drucken vorhanden");
      return;
    }
    const visible = plan.auftraege.filter(a => !(visibilities[a.airtableId]?.hidden));
    if (visible.length === 0) {
      toast.error("Alle Aufträge sind ausgeblendet – nichts zum Drucken");
      return;
    }
    window.print();
  }

  // Alle ausblenden / alle einblenden
  function hideAll() {
    if (!plan) return;
    const patch: Record<string, AuftragVisibility> = {};
    plan.auftraege.forEach(a => { patch[a.airtableId] = { ...DEFAULT_VISIBILITY, hidden: true }; });
    setVisibilities(patch);
  }
  function showAll() {
    setVisibilities({});
  }

  const isCurrentKW = kw === currentKW.kw && year === currentKW.year;
  const hiddenCount = plan ? plan.auftraege.filter(a => visibilities[a.airtableId]?.hidden).length : 0;

  return (
    <DashboardLayout>
      {/* Print-only Styles */}
      <style>{`
        @media print {
          [data-sidebar], nav, header, aside,
          .print\\:hidden { display: none !important; }
          body { margin: 0; padding: 0; }
          #wochenplanung-print {
            display: block !important;
            position: static !important;
            width: 100% !important;
            padding: 16px !important;
          }
          .print-header { display: block !important; }
        }
      `}</style>

      <div className="space-y-6">
        {/* Seitentitel */}
        <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Wrench className="h-6 w-6 text-primary" />
              Wochenplanung
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Baustellenvorbereitung mit Klassi-Daten und MVT-Links
            </p>
          </div>
          <div className="flex items-center gap-2">
            {plan && plan.auftraege.length > 0 && (
              <>
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={showAll}>
                  <Eye className="h-3.5 w-3.5" /> Alle einblenden
                </Button>
                <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={hideAll}>
                  <EyeOff className="h-3.5 w-3.5" /> Alle ausblenden
                </Button>
              </>
            )}
            {selectedHwpId && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={handleRefresh}
                disabled={isRefreshing || planLoading}
                title="Daten direkt aus Airtable neu laden (Cache umgehen)"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Aktualisiere...' : 'Jetzt aktualisieren'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handlePrint}
              disabled={!plan || plan.auftraege.length === 0}
            >
              <Printer className="h-4 w-4" />
              Drucken / Exportieren
              {hiddenCount > 0 && (
                <Badge variant="secondary" className="text-xs ml-1">{plan!.auftraege.length - hiddenCount} sichtbar</Badge>
              )}
            </Button>
          </div>
        </div>

        {/* KW-Navigation */}
        <Card className="print:hidden">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* KW-Steuerung */}
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={prevKW}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="text-center min-w-[120px]">
                  <div className="text-lg font-bold">KW {kw} / {year}</div>
                  <div className="text-xs text-muted-foreground">
                    {monday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} –{" "}
                    {sunday.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </div>
                </div>
                <Button variant="outline" size="icon" onClick={nextKW}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {!isCurrentKW && (
                  <Button variant="ghost" size="sm" onClick={goToCurrentKW} className="text-xs gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Aktuelle KW
                  </Button>
                )}
              </div>

              {/* HWP-Auswahl */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm text-muted-foreground shrink-0">HWP:</span>
                {hwpsLoading ? (
                  <div className="text-sm text-muted-foreground animate-pulse">Lade HWPs...</div>
                ) : (
                  <Select value={selectedHwpId} onValueChange={setSelectedHwpId}>
                    <SelectTrigger className="max-w-xs">
                      <SelectValue placeholder="HWP auswählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {hwps && hwps.length > 0 ? (
                        hwps.map((hwp) => (
                          <SelectItem key={hwp.id} value={hwp.id}>
                            {hwp.name} ({hwp.count} Aufträge)
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="_none" disabled>
                          Keine HWPs mit Aufträgen in dieser KW
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Druckbarer Bereich */}
        <div id="wochenplanung-print">
          {/* Druckkopf */}
          <div className="print-header hidden print:block mb-4">
            <h1 className="text-xl font-bold text-black">Baustellenvorbereitung – KW {kw}/{year}</h1>
            {plan && (
              <p className="text-sm text-gray-600 mt-1">
                HWP: <strong>{plan.hwpName}</strong> &nbsp;|&nbsp;
                Zeitraum: {monday.toLocaleDateString("de-DE")} – {sunday.toLocaleDateString("de-DE")} &nbsp;|&nbsp;
                {plan.auftraege.filter(a => !visibilities[a.airtableId]?.hidden).length} Aufträge
              </p>
            )}
            <hr className="mt-3 mb-4 border-gray-300" />
          </div>

          {/* Kein HWP ausgewählt */}
          {!selectedHwpId && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground print:hidden">
              <Zap className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">HWP auswählen</p>
              <p className="text-sm mt-1">Wähle einen Handwerkspartner, um die Wochenplanung zu laden.</p>
            </div>
          )}

          {/* Laden */}
          {selectedHwpId && planLoading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground print:hidden">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3" />
              Lade Wochenplanung...
            </div>
          )}

          {/* Keine Aufträge */}
          {selectedHwpId && !planLoading && plan && plan.auftraege.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground print:hidden">
              <Calendar className="h-12 w-12 mb-4 opacity-30" />
              <p className="text-lg font-medium">Keine Aufträge in KW {kw}</p>
              <p className="text-sm mt-1">Für diesen HWP gibt es in dieser Woche keine Aufträge.</p>
            </div>
          )}

          {/* Auftrags-Liste */}
          {plan && plan.auftraege.length > 0 && (
            <div>
              {/* Zusammenfassung (nur Bildschirm) */}
              <div className="mb-4 flex flex-wrap gap-3 items-center print:hidden">
                <Badge variant="secondary" className="text-sm px-3 py-1">
                  {plan.total} Aufträge gesamt
                </Badge>
                {hiddenCount > 0 && (
                  <Badge variant="outline" className="text-sm px-3 py-1 border-red-300 text-red-600">
                    {hiddenCount} ausgeblendet
                  </Badge>
                )}
                <Badge variant="outline" className="text-sm px-3 py-1">
                  {plan.hwpName}
                </Badge>
                {plan.auftraege.filter(a => a.klassi?.klassifizierungAbgeschlossen).length > 0 && (
                  <Badge className="bg-green-600 text-white text-sm px-3 py-1">
                    {plan.auftraege.filter(a => a.klassi?.klassifizierungAbgeschlossen).length} mit Klassi
                  </Badge>
                )}
                {plan.auftraege.filter(a => a.klassi?.komplex).length > 0 && (
                  <Badge className="bg-purple-600 text-white text-sm px-3 py-1">
                    {plan.auftraege.filter(a => a.klassi?.komplex).length} Komplex
                  </Badge>
                )}
              </div>

              {/* Karten */}
              {plan.auftraege.map((auftrag, i) => (
                <AuftragKarte
                  key={auftrag.airtableId}
                  auftrag={auftrag}
                  index={i}
                  hinweis={hinweise[auftrag.airtableId] ?? ""}
                  onHinweisChange={(val) => setHinweisForAuftrag(auftrag.airtableId, val)}
                  visibility={visibilities[auftrag.airtableId] ?? DEFAULT_VISIBILITY}
                  onVisibilityChange={(patch) => setVisibilityForAuftrag(auftrag.airtableId, patch)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
