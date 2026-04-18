import { useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/hooks/useAuth";
import HwpMkAntragDialog from "./HwpMkAntragDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Euro,
  FileText,
  User,
  Calendar,
  Wrench,
  Zap,
  AlertTriangle,
  Info,
  CheckSquare,
  MessageSquare,
  PlusCircle,
} from "lucide-react";

function formatCurrency(value: number | undefined | null): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | undefined | null): string {
  if (!value) return "–";
  return new Date(value).toLocaleDateString("de-DE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(value: string | undefined | null): string {
  if (!value) return "–";
  return new Date(value).toLocaleString("de-DE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground sm:w-56 shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground">{value ?? "–"}</span>
    </div>
  );
}

function FreigabeIcon({ status }: { status: string | undefined }) {
  if (!status) return <Clock className="h-4 w-4 text-slate-400" />;
  if (status.includes("Freigegeben")) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status.includes("Abgelehnt")) return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
}

function RisikoBadge({ risiko }: { risiko: string | undefined }) {
  if (!risiko) return <span className="text-muted-foreground text-sm">–</span>;
  const lower = risiko.toLowerCase();
  if (lower.includes("hoch") || lower.includes("high")) {
    return <Badge className="bg-red-100 text-red-700 border-red-200 border">{risiko}</Badge>;
  }
  if (lower.includes("mittel") || lower.includes("medium")) {
    return <Badge className="bg-amber-100 text-amber-700 border-amber-200 border">{risiko}</Badge>;
  }
  if (lower.includes("gering") || lower.includes("low") || lower.includes("no risk")) {
    return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">{risiko}</Badge>;
  }
  return <Badge variant="outline">{risiko}</Badge>;
}

export default function AuftragDetail({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const isHwp = user?.role === "hwp";
  const [showAntragDialog, setShowAntragDialog] = useState(false);
  const utils = trpc.useUtils();

  const { data: record, isLoading, error } = trpc.mehrkosten.getById.useQuery(
    { id },
    { staleTime: 2 * 60 * 1000 }
  );

  const orderNumber = record?.fields?.["Order Number"] as string | undefined;

  const { data: klassi, isLoading: klassiLoading } = trpc.mehrkosten.getKlassifizierung.useQuery(
    { orderNumber: orderNumber ?? "" },
    {
      enabled: !!orderNumber,
      staleTime: 5 * 60 * 1000,
    }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Auftrag wird geladen...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !record) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center py-24">
          <XCircle className="h-10 w-10 text-red-400 mb-3" />
          <p className="text-base font-medium">Auftrag nicht gefunden</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error?.message ?? "Der Datensatz konnte nicht geladen werden."}
          </p>
          <Button variant="outline" className="mt-4 gap-2" onClick={() => setLocation("/auftraege")}>
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Übersicht
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const f = record.fields;
  const freigabeStatus = f["Status - Freigabe"] as string | undefined;
  const mehrkosten = f["Mehrkosten"] as number | undefined;
  const pauschale = f["Pauschale"] as number | undefined;
  const sfLink = f["SF-Link SA"] as string | undefined;
  const mvtLink = orderNumber
    ? `https://fulfilment.craftos.enpal.io/workorders/protocol/${orderNumber}/MVT`
    : undefined;
  const moduleCount = f["Module"] as number | undefined;
  const ipaLink = orderNumber && (moduleCount ?? 0) > 0
    ? `https://buildability.craftos.enpal.tech/pv/${orderNumber}`
    : undefined;
  const prufer1 = f["1. Prüfer"] as { name: string; email: string } | undefined;
  const freigabeTimestamp = f["Timestamp: 1. Freigabe"] as string | undefined;
  const prufer2 = f["2. Prüfer"] as { name: string; email: string } | undefined;
  const freigabe2Status = f["2. Freigabe"] as string | undefined;
  const freigabe2Timestamp = f["Timestamp: 2. Freigabe"] as string | undefined;
  const prufer2Kommentar = f["2. Prüfer - Kommentar"] as string | undefined;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              className="mt-0.5 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {(f["Opportunity Name"] as string) ?? "Unbekannter Auftrag"}
              </h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <span className="text-sm text-muted-foreground">
                  {(f["Appointment Number"] as string) ?? ""}
                </span>
                {f["Order Number"] && (
                  <span className="text-sm text-muted-foreground">
                    · Bestellnr.: {f["Order Number"] as string}
                  </span>
                )}
                {f["Status"] && (
                  <Badge variant="outline" className="text-xs">
                    {f["Status"] as string}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 flex-wrap justify-end">
            {/* Externe Links nur für interne Rollen */}
            {!isHwp && sfLink && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(sfLink, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Salesforce
              </Button>
            )}
            {!isHwp && mvtLink && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(mvtLink, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                MVT
              </Button>
            )}
            {!isHwp && ipaLink && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(ipaLink, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                IPA
              </Button>
            )}
            {!isHwp && klassi?.caseLink && (
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => window.open(klassi.caseLink, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                SF Case
              </Button>
            )}
            {/* Mehrkosten beantragen – nur für HWP */}
            {isHwp && orderNumber && (
              <Button
                size="sm"
                className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                onClick={() => setShowAntragDialog(true)}
              >
                <PlusCircle className="h-4 w-4" />
                Mehrkosten beantragen
              </Button>
            )}
          </div>
        </div>

        {/* ─── Mehrkosten-Sektion (prominent oben) ─── */}
        <Card className="border-2 border-blue-200 bg-blue-50/40 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Euro className="h-4 w-4 text-blue-600" />
              Mehrkosten & Freigabe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {/* Freigabe-Status Banner */}
            <div className={`flex items-center gap-3 p-3 rounded-lg mb-4 ${
              freigabeStatus?.includes("Freigegeben")
                ? "bg-emerald-100 border border-emerald-200"
                : freigabeStatus?.includes("Abgelehnt")
                ? "bg-red-100 border border-red-200"
                : "bg-amber-50 border border-amber-200"
            }`}>
              <FreigabeIcon status={freigabeStatus} />
              <div>
                <p className="text-sm font-semibold">
                  {freigabeStatus ?? "Freigabe ausstehend"}
                </p>
                {f["Antrag erfolgreich"] && (
                  <p className="text-xs text-muted-foreground">
                    Antrag: {f["Antrag erfolgreich"] as string}
                  </p>
                )}
              </div>
            </div>

            {/* Kosten-Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Mehrkosten</p>
                <p className="text-lg font-bold text-blue-700 mt-0.5">
                  {formatCurrency(mehrkosten)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Pauschale</p>
                <p className="text-lg font-bold mt-0.5">
                  {formatCurrency(pauschale)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Freigegebene MK</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">
                  {formatCurrency(f["Freigegebene Mehrkosten"] as number)}
                </p>
              </div>
              <div className="bg-white rounded-lg p-3 border">
                <p className="text-xs text-muted-foreground">Sondertour</p>
                <p className="text-lg font-bold mt-0.5">
                  {formatCurrency(f["Sondertour Kosten"] as number)}
                </p>
              </div>
            </div>

            {/* Freigabe-Details – nur für interne Rollen */}
            {!isHwp && (
              <div className="space-y-3 mb-2">
                {/* 1. Freigabe */}
                <div className="rounded-lg border bg-white/60 p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">1. Freigabe</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    <FieldRow label="Status" value={f["1. Freigabe"] as string} />
                    {prufer1 && (
                      <FieldRow
                        label="Prüfer"
                        value={
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {prufer1.name}
                            <span className="text-xs text-muted-foreground">({prufer1.email})</span>
                          </span>
                        }
                      />
                    )}
                    {freigabeTimestamp && (
                      <FieldRow label="Zeitpunkt" value={formatDate(freigabeTimestamp)} />
                    )}
                    {f["1. Prüfer - Kommentar"] && (
                      <FieldRow label="Kommentar" value={f["1. Prüfer - Kommentar"] as string} />
                    )}
                  </div>
                </div>
                {/* 2. Freigabe */}
                <div className={`rounded-lg border p-3 ${
                  prufer2 ? "bg-white/60" : "bg-muted/30"
                }`}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">2. Freigabe</p>
                  {prufer2 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                      <FieldRow label="Status" value={freigabe2Status} />
                      <FieldRow
                        label="Prüfer"
                        value={
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {prufer2.name}
                            <span className="text-xs text-muted-foreground">({prufer2.email})</span>
                          </span>
                        }
                      />
                      {freigabe2Timestamp && (
                        <FieldRow label="Zeitpunkt" value={formatDate(freigabe2Timestamp)} />
                      )}
                      {prufer2Kommentar && (
                        <FieldRow label="Kommentar" value={prufer2Kommentar} />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">Noch nicht freigegeben</p>
                  )}
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
              {f["Grund"] && (
                <FieldRow
                  label="Grund"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {(f["Grund"] as string[]).map((g) => (
                        <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>
                      ))}
                    </div>
                  }
                />
              )}
              <FieldRow label="Ausfallpauschale" value={f["Ausfallpauschale"] ? "Ja" : "Nein"} />
              <FieldRow label="Sondertour" value={f["Sondertour"] as string} />
              <FieldRow label="Zählerzusammenlegung (ZZL)" value={
                f["Baustelle mit ZZL"] != null
                  ? (f["Baustelle mit ZZL"] ? "Ja" : "Nein")
                  : undefined
              } />
            </div>
          </CardContent>
        </Card>

        {/* ─── Klassifizierung (ACH Klassi Overview) – nur für interne Rollen ─── */}
        {!isHwp && orderNumber && (
          <Card className={`border-2 shadow-sm ${
            klassi?.klassifizierungAbgeschlossen
              ? "border-violet-200 bg-violet-50/30"
              : "border-slate-200"
          }`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Zap className="h-4 w-4 text-violet-600" />
                ACH-Klassifizierung
                {klassiLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground ml-1" />}
                {klassi?.klassifizierungAbgeschlossen && (
                  <Badge className="ml-2 bg-violet-100 text-violet-700 border-violet-200 border text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Abgeschlossen
                  </Badge>
                )}
                {klassi && !klassi.klassifizierungAbgeschlossen && (
                  <Badge className="ml-2 bg-amber-100 text-amber-700 border-amber-200 border text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    Offen
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!klassi && !klassiLoading ? (
                <p className="text-sm text-muted-foreground italic py-2">
                  Keine Klassifizierungsdaten für diese Bestellnummer vorhanden.
                </p>
              ) : klassiLoading ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Klassifizierungsdaten werden geladen...</span>
                </div>
              ) : klassi ? (
                <div className="space-y-5">

                  {/* Status-Übersicht */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">MK-Schätzung</p>
                      <p className="text-lg font-bold text-violet-700 mt-0.5">
                        {klassi.mehrkostenabschaetzung != null
                          ? formatCurrency(klassi.mehrkostenabschaetzung)
                          : "–"}
                      </p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">Bauzeit</p>
                      <p className="text-base font-bold mt-0.5">{klassi.bauzeit ?? "–"}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">Erbrachte Leistung</p>
                      <p className="text-sm font-bold mt-0.5">{klassi.erbrachteLeistungEstimate ?? "–"}</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border">
                      <p className="text-xs text-muted-foreground">Abgeschlossen am</p>
                      <p className="text-sm font-bold mt-0.5">{formatDateTime(klassi.completedDateTime)}</p>
                    </div>
                  </div>

                  {/* Risikobewertung */}
                  {(klassi.risikobewertung || klassi.risikobewertungBau || klassi.risiko) && (
                    <div className="rounded-lg border bg-white/60 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Risikobewertung
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        {klassi.risikobewertung && (
                          <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b last:border-0">
                            <span className="text-sm text-muted-foreground sm:w-56 shrink-0">Risiko (Klassifizierung)</span>
                            <RisikoBadge risiko={klassi.risikobewertung} />
                          </div>
                        )}
                        {klassi.risikobewertungBau && (
                          <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b last:border-0">
                            <span className="text-sm text-muted-foreground sm:w-56 shrink-0">Risiko (Bau)</span>
                            <RisikoBadge risiko={klassi.risikobewertungBau} />
                          </div>
                        )}
                        {klassi.risiko && (
                          <div className="flex flex-col sm:flex-row sm:items-start gap-1 py-2.5 border-b last:border-0 md:col-span-2">
                            <span className="text-sm text-muted-foreground sm:w-56 shrink-0">Risiko-Details</span>
                            <span className="text-sm font-medium">{klassi.risiko}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Zählerschrank & HAK */}
                  <div className="rounded-lg border bg-white/60 p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5" />
                      Zählerschrank & HAK
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                      <FieldRow label="Zählerschrank" value={klassi.zaehlerSchrank} />
                      <FieldRow label="Aufstellort" value={klassi.aufstellort} />
                      {klassi.aufstellortDetails && klassi.aufstellortDetails !== "-" && (
                        <FieldRow label="Aufstellort Details" value={klassi.aufstellortDetails} />
                      )}
                      <FieldRow label="Anzahl Zähler" value={klassi.anzahlZaehler} />
                      <FieldRow label="Anzahl UV" value={klassi.anzahlUv} />
                      {klassi.hak && klassi.hak.length > 0 && (
                        <FieldRow label="HAK" value={
                          <div className="flex flex-wrap gap-1">
                            {klassi.hak.map(h => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
                          </div>
                        } />
                      )}
                      <FieldRow label="HAK verschlossen?" value={klassi.hakVerschlossen} />
                      {klassi.kabelwegZsHak != null && (
                        <FieldRow label="Kabelweg ZS → HAK" value={`${klassi.kabelwegZsHak} m`} />
                      )}
                      {klassi.tsg && klassi.tsg !== "-" && (
                        <FieldRow label="TSG" value={klassi.tsg} />
                      )}
                      {klassi.zzl && klassi.zzl !== "-" && (
                        <FieldRow label="ZZL" value={klassi.zzl} />
                      )}
                      {klassi.sondermaterial && klassi.sondermaterial !== "-" && (
                        <FieldRow label="Sondermaterial" value={klassi.sondermaterial} />
                      )}
                    </div>
                  </div>

                  {/* UV-Details */}
                  {klassi.uvDetails && klassi.uvDetails.length > 0 && (
                    <div className="rounded-lg border bg-white/60 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        UV-Details
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {klassi.uvDetails.map((uv) => (
                          <div key={uv.nr} className="rounded-md border bg-white p-3">
                            <p className="text-xs font-semibold text-violet-700 mb-1.5">UV {uv.nr}</p>
                            {uv.todo && (
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Maßnahme</span>
                                <span className="font-medium">{uv.todo}</span>
                              </div>
                            )}
                            {uv.montage && (
                              <div className="flex justify-between text-xs mb-1">
                                <span className="text-muted-foreground">Montage</span>
                                <span className="font-medium">{uv.montage}</span>
                              </div>
                            )}
                            {uv.zuleitung && (
                              <div className="flex justify-between text-xs">
                                <span className="text-muted-foreground">Zuleitung</span>
                                <span className="font-medium">{uv.zuleitung} m</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ACH-Infos */}
                  {(klassi.achGrund?.length || klassi.achVerantwortlich || klassi.inflow || klassi.tbk) && (
                    <div className="rounded-lg border bg-white/60 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5" />
                        ACH & Inflow
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                        {klassi.achGrund && klassi.achGrund.length > 0 && (
                          <FieldRow label="ACH Grund" value={
                            <div className="flex flex-wrap gap-1">
                              {klassi.achGrund.map(g => <Badge key={g} variant="secondary" className="text-xs">{g}</Badge>)}
                            </div>
                          } />
                        )}
                        {klassi.achVerantwortlich && (
                          <FieldRow label="ACH Verantwortlich" value={klassi.achVerantwortlich} />
                        )}
                        {klassi.inflow && (
                          <FieldRow label="Inflow" value={klassi.inflow} />
                        )}
                        {klassi.inflowgrund && (
                          <FieldRow label="Inflowgrund" value={klassi.inflowgrund} />
                        )}
                        {klassi.tbk && (
                          <FieldRow label="TBK/nTBK" value={klassi.tbk} />
                        )}
                        {klassi.terminierung && (
                          <FieldRow label="Terminierung" value={klassi.terminierung} />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Flags */}
                  {(klassi.komplex || klassi.okf || klassi.absprachenGetroffen) && (
                    <div className="rounded-lg border bg-white/60 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <CheckSquare className="h-3.5 w-3.5" />
                        Kennzeichnungen
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {klassi.komplex && (
                          <Badge className="bg-orange-100 text-orange-700 border-orange-200 border">Komplex</Badge>
                        )}
                        {klassi.okf && (
                          <Badge className="bg-blue-100 text-blue-700 border-blue-200 border">OKF</Badge>
                        )}
                        {klassi.absprachenGetroffen && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 border">Absprachen getroffen</Badge>
                        )}
                      </div>
                      {klassi.okfBegruendung && (
                        <div className="mt-3">
                          <FieldRow label="OKF Begründung" value={klassi.okfBegruendung} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB Hinweise */}
                  {klassi.tabHinweise && klassi.tabHinweise !== "/" && klassi.tabHinweise !== "-" && (
                    <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-3">
                      <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        TAB-Hinweise
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{klassi.tabHinweise}</p>
                    </div>
                  )}

                  {/* Wichtige Notizen */}
                  {klassi.wichtigeNotizen && klassi.wichtigeNotizen !== "-" && (
                    <div className="rounded-lg border bg-blue-50/60 border-blue-200 p-3">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Wichtige Notizen
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{klassi.wichtigeNotizen}</p>
                    </div>
                  )}

                  {/* Absprachen */}
                  {klassi.absprachen && (
                    <div className="rounded-lg border bg-white/60 p-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Absprachen
                      </p>
                      <p className="text-sm whitespace-pre-wrap text-foreground">{klassi.absprachen}</p>
                    </div>
                  )}

                  {/* Zugewiesen an / Case */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                    {klassi.assignedTo && (
                      <FieldRow label="Zugewiesen an" value={klassi.assignedTo} />
                    )}
                    {klassi.caseNumber && (
                      <FieldRow label="Case-Nummer" value={klassi.caseNumber} />
                    )}
                    {klassi.caseSubject && (
                      <FieldRow label="Case-Betreff" value={klassi.caseSubject} />
                    )}
                  </div>

                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {/* ─── Auftragsinformationen ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Auftrag */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Auftragsdaten
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <FieldRow label="Opportunity Name" value={f["Opportunity Name"] as string} />
              <FieldRow label="Appointment Number" value={f["Appointment Number"] as string} />
              <FieldRow label="Order Number" value={f["Order Number"] as string} />
              <FieldRow label="Service Appointment ID" value={f["Service Appointment ID"] as string} />
              <FieldRow label="Status" value={f["Status"] as string} />
              <FieldRow label="Skill" value={
                f["Skill"] ? (
                  <div className="flex flex-wrap gap-1">
                    {(f["Skill"] as string[]).map((s) => (
                      <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                ) : undefined
              } />
              <FieldRow label="PV oder HP" value={f["PV or HP"] as string} />
              <FieldRow label="Assigned PL" value={f["Assigned PL"] as string} />
            </CardContent>
          </Card>

          {/* Techniker */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                Techniker & HWP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <FieldRow label="Techniker" value={f["Technician: Name"] as string} />
              <FieldRow label="HWP (Account)" value={f["Technician: Account: Account Name"] as string} />
              <FieldRow label="Account ID" value={f["Technician: Account: Account ID"] as string} />
            </CardContent>
          </Card>

          {/* Termine */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Termine & Zeitplan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <FieldRow label="Zieldatum (Target End)" value={formatDate(f["Target End"] as string)} />
              <FieldRow label="Letztes geplantes Ende" value={formatDate(f["Last Scheduled End"] as string)} />
              <FieldRow label="Erstellungsdatum" value={formatDate(f["Created Date"] as string)} />
              <FieldRow label="Zuletzt geändert" value={formatDate(f["Zuletzt geändert"] as string)} />
            </CardContent>
          </Card>

          {/* Technische Details */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                Technische Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-0">
              <FieldRow label="Batteriekapazität (kWh)" value={
                f["Battery Capacity kwh"] != null ? `${f["Battery Capacity kwh"]} kWh` : undefined
              } />
              <FieldRow label="Anzahl Wallboxen" value={f["Number of Wallboxes"] as number} />
              <FieldRow label="Anzahl Module" value={
                f["Number Of Module Components"] != null
                  ? Math.round((f["Number Of Module Components"] as number) / 100)
                  : undefined
              } />
              <FieldRow label="Anlagenwert" value={formatCurrency(f["Amount"] as number)} />
            </CardContent>
          </Card>
        </div>

        {/* ─── Rechnungsdaten ─── */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Euro className="h-4 w-4 text-muted-foreground" />
              Rechnungsdaten
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!f["Rechnungs-Nr."] && !f["Rechnungsbetrag"] && !f["Erwartete Kosten"] ? (
              <p className="text-sm text-muted-foreground italic py-2">
                Keine Rechnungsdaten in Airtable hinterlegt.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
                <FieldRow label="Rechnungsnummer" value={f["Rechnungs-Nr."] as string} />
                <FieldRow label="Rechnungsbetrag" value={formatCurrency(f["Rechnungsbetrag"] as number)} />
                <FieldRow label="Erwartete Kosten" value={formatCurrency(f["Erwartete Kosten"] as number)} />
                <FieldRow label="Differenz" value={formatCurrency(f["Differenz"] as number)} />
                <FieldRow label="MK-Status Freigegeben %" value={
                  f["MK-Status = Freigegeben, %"] != null
                    ? `${((f["MK-Status = Freigegeben, %"] as number) * 100).toFixed(0)} %`
                    : undefined
                } />
                <FieldRow label="Mehrkosten (Indikator)" value={formatCurrency(f["Mehrkosten (Indikator)"] as number)} />
                <FieldRow label="Sondertour (Indikator)" value={formatCurrency(f["Sondertour (Indikator)"] as number)} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* HWP-Antragsdialog */}
      {isHwp && orderNumber && (
        <HwpMkAntragDialog
          open={showAntragDialog}
          onClose={() => setShowAntragDialog(false)}
          onSuccess={() => {
            setShowAntragDialog(false);
            utils.mehrkosten.getById.invalidate({ id });
          }}
          airtableId={id}
          orderNumber={orderNumber}
          kundenName={(f["Opportunity Name"] as string) ?? ""}
          hwpName={(f["Technician: Account: Account Name"] as string) ?? ""}
        />
      )}
    </DashboardLayout>
  );
}
