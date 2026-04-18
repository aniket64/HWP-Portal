import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
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
  if (status === "Freigegeben") return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (status === "Abgelehnt") return <XCircle className="h-4 w-4 text-red-500" />;
  return <Clock className="h-4 w-4 text-slate-400" />;
}

export default function MehrkostenDetail({ id }: { id: string }) {
  const [, setLocation] = useLocation();

  const { data: record, isLoading, error } = trpc.mehrkosten.getById.useQuery(
    { id },
    { staleTime: 2 * 60 * 1000 }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !record) {
    return (
      <DashboardLayout>
        <div className="text-center py-24">
          <p className="text-muted-foreground">Datensatz nicht gefunden</p>
          <Button variant="outline" onClick={() => setLocation("/mehrkosten")} className="mt-4">
            Zurück zur Liste
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const f = record.fields;
  const status = f["Status"] as string | undefined;
  const freigabe1 = f["1. Freigabe"] as string | undefined;
  const freigabe2 = f["2. Freigabe"] as string | undefined;
  const skills = f["Skill"] as string[] | undefined;
  const grund = f["Grund"] as string[] | undefined;

  const STATUS_COLORS: Record<string, string> = {
    Completed: "bg-emerald-100 text-emerald-700",
    Canceled: "bg-red-100 text-red-700",
    Scheduled: "bg-blue-100 text-blue-700",
    "In Progress": "bg-amber-100 text-amber-700",
    "Cannot Complete": "bg-orange-100 text-orange-700",
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-4xl">
        {/* Back button + Title */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/mehrkosten")}
            className="gap-2 -ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück
          </Button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">
              {(f["Opportunity Name"] as string) ?? "Unbekannter Kunde"}
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-muted-foreground text-sm">
                {(f["Appointment Number"] as string) ?? "–"}
              </span>
              {status && (
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? "bg-slate-100 text-slate-600"}`}>
                  {status}
                </span>
              )}
            </div>
          </div>
          {f["SF-Link SA"] && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(f["SF-Link SA"] as string, "_blank")}
              className="gap-2 shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Salesforce
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Linke Spalte: Hauptdaten */}
          <div className="lg:col-span-2 space-y-5">
            {/* Auftragsdaten */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Auftragsdaten</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <FieldRow label="Kundenname" value={f["Opportunity Name"] as string} />
                <FieldRow label="Auftragsnummer" value={f["Appointment Number"] as string} />
                <FieldRow label="Bestellnummer" value={f["Order Number"] as string} />
                <FieldRow label="Service Appointment ID" value={f["Service Appointment ID"] as string} />
                <FieldRow label="Handwerkspartner" value={f["Technician: Account: Account Name"] as string} />
                <FieldRow label="Techniker" value={f["Technician: Name"] as string} />
                <FieldRow label="Zugewiesener PL" value={f["Assigned PL"] as string} />
                <FieldRow
                  label="Skill"
                  value={skills?.length ? (
                    <div className="flex flex-wrap gap-1">
                      {skills.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  ) : "–"}
                />
                <FieldRow label="PV oder HP" value={f["PV or HP"] as string} />
                <FieldRow label="Zieldatum" value={formatDate(f["Target End"] as string)} />
                <FieldRow label="Letztes Enddatum" value={formatDate(f["Last Scheduled End"] as string)} />
                <FieldRow label="Erstellungsdatum" value={formatDate(f["Created Date"] as string)} />
              </CardContent>
            </Card>

            {/* Mehrkosten-Details */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Mehrkosten & Finanzen</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <FieldRow label="Mehrkosten" value={<span className="font-semibold text-blue-700">{formatCurrency(f["Mehrkosten"] as number)}</span>} />
                <FieldRow label="Pauschale" value={formatCurrency(f["Pauschale"] as number)} />
                <FieldRow label="Erwartete Kosten" value={formatCurrency(f["Erwartete Kosten"] as number)} />
                <FieldRow label="Rechnungsbetrag" value={formatCurrency(f["Rechnungsbetrag"] as number)} />
                <FieldRow label="Rechnungs-Nr." value={f["Rechnungs-Nr."] as string} />
                <FieldRow label="Differenz" value={formatCurrency(f["Differenz"] as number)} />
                <FieldRow label="Sondertour" value={f["Sondertour"] as string} />
                <FieldRow label="Sondertour Kosten" value={formatCurrency(f["Sondertour Kosten"] as number)} />
                <FieldRow label="Freigegebene Mehrkosten" value={formatCurrency(f["Freigegebene Mehrkosten"] as number)} />
                {grund?.length && (
                  <FieldRow
                    label="Grund"
                    value={
                      <div className="flex flex-wrap gap-1">
                        {grund.map((g) => (
                          <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
                        ))}
                      </div>
                    }
                  />
                )}
              </CardContent>
            </Card>

            {/* Technische Daten */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Technische Daten</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <FieldRow label="Batteriekapazität (kWh)" value={f["Battery Capacity kwh"] as number} />
                <FieldRow label="Anzahl Wallboxen" value={f["Number of Wallboxes"] as number} />
                <FieldRow label="Anzahl Module" value={f["Number Of Module Components"] as number} />
                <FieldRow label="Baustelle mit ZZL" value={(f["Baustelle mit ZZL"] as number) ? "Ja" : "Nein"} />
                <FieldRow label="Ausfallpauschale" value={(f["Ausfallpauschale"] as boolean) ? "Ja" : "Nein"} />
              </CardContent>
            </Card>
          </div>

          {/* Rechte Spalte: Freigabe-Status */}
          <div className="space-y-5">
            {/* Freigabe-Status */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Freigabe-Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-2">
                {/* 1. Freigabe */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FreigabeIcon status={freigabe1} />
                    <span className="text-sm font-medium">1. Freigabe</span>
                    {freigabe1 && (
                      <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${freigabe1 === "Freigegeben" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {freigabe1}
                      </span>
                    )}
                  </div>
                  {f["1. Prüfer - Kommentar"] && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 ml-6">
                      {f["1. Prüfer - Kommentar"] as string}
                    </p>
                  )}
                </div>

                <Separator />

                {/* 2. Freigabe */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <FreigabeIcon status={freigabe2} />
                    <span className="text-sm font-medium">2. Freigabe</span>
                    {freigabe2 && (
                      <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${freigabe2 === "Freigegeben" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                        {freigabe2}
                      </span>
                    )}
                  </div>
                  {f["2. Prüfer - Kommentar"] && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 ml-6">
                      {f["2. Prüfer - Kommentar"] as string}
                    </p>
                  )}
                </div>

                <Separator />

                {/* Gesamt-Status */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Antrag-Status</p>
                  <p className="text-sm font-medium">
                    {(f["Status - Freigabe"] as string) ?? "Ausstehend"}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Zeitstempel */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Zeitstempel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 pt-2">
                {[
                  ["1. Freigabe", f["Timestamp: 1. Freigabe"]],
                  ["2. Freigabe", f["Timestamp: 2. Freigabe"]],
                  ["MK-Eintrag", f["Timestamp: Mehrkosteneintrag"]],
                  ["Sondertour", f["Timestamp: Sondertour"]],
                  ["Zuletzt geändert", f["Zuletzt geändert"]],
                ].map(([label, val]) =>
                  val ? (
                    <div key={label as string} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label as string}</span>
                      <span className="font-medium">
                        {new Date(val as string).toLocaleDateString("de-DE")}
                      </span>
                    </div>
                  ) : null
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
