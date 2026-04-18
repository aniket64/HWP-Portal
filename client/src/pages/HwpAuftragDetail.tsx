import { useState, useMemo } from "react";
import HwpMkAntragDialog from "./HwpMkAntragDialog";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Loader2,
  Euro,
  Package,
  CalendarDays,
  User,
  FileText,
  CheckCircle2,
  AlertCircle,
  Info,
  PlusCircle,
  Pencil,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { MK_KATALOG, berechnePauschaleAbzug } from "@shared/mk-positionen-katalog";

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

function formatDate(value: string | Date | undefined | null): string {
  if (!value) return "–";
  return new Date(value as string).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

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
  entwurf: "bg-slate-100 text-slate-600",
  abgeschlossen: "bg-blue-100 text-blue-700",
  terminiert: "bg-violet-100 text-violet-700",
  nachtrag: "bg-amber-100 text-amber-700",
  freigegeben: "bg-emerald-100 text-emerald-700",
  abgelehnt: "bg-red-100 text-red-700",
};

const MK_STATUS_DE: Record<string, string> = {
  entwurf: "Entwurf (in Bearbeitung)",
  abgeschlossen: "Klassifiziert",
  terminiert: "Terminiert",
  nachtrag: "Antrag eingereicht",
  freigegeben: "Freigegeben",
  abgelehnt: "Abgelehnt",
};

const KATEGORIE_LABELS: Record<string, string> = {
  kabel: "Kabel",
  zaehler: "Zähler",
  uv: "Unterverteilungen",
  sonstiges: "Sonstiges",
};

// ─── Nachtrag-Dialog ──────────────────────────────────────────────────────────

type NachtragDialogProps = {
  open: boolean;
  onClose: () => void;
  rechnungId: number;
  uvAnzahl: number;
  pauschaleBetrag: number;
  onSuccess: () => void;
};

function NachtragDialog({ open, onClose, rechnungId, uvAnzahl, pauschaleBetrag, onSuccess }: NachtragDialogProps) {
  const utils = trpc.useUtils();
  const [mengen, setMengen] = useState<Record<string, number>>({});
  const [kommentar, setKommentar] = useState("");

  const pauschaleAbzug = useMemo(() => berechnePauschaleAbzug(uvAnzahl), [uvAnzahl]);

  // Positionen nach Kategorie gruppieren
  const kategorien = useMemo(() => {
    const grouped: Record<string, typeof MK_KATALOG> = {};
    for (const pos of MK_KATALOG) {
      if (!grouped[pos.kategorie]) grouped[pos.kategorie] = [];
      grouped[pos.kategorie].push(pos);
    }
    return grouped;
  }, []);

  // Live-Berechnung
  const berechnung = useMemo(() => {
    let summeOhnePauschale = 0;
    let pauschaleSumme = 0;
    for (const pos of MK_KATALOG) {
      const menge = mengen[pos.key] ?? 0;
      if (menge <= 0) continue;
      const inklusiv = Math.min(menge, pauschaleAbzug.get(pos.key) ?? 0);
      const netto = menge - inklusiv;
      summeOhnePauschale += menge * pos.einzelpreisEuro;
      pauschaleSumme += inklusiv * pos.einzelpreisEuro;
    }
    const summeMitPauschale = summeOhnePauschale - pauschaleSumme + pauschaleBetrag;
    return { summeOhnePauschale, summeMitPauschale };
  }, [mengen, pauschaleAbzug, pauschaleBetrag]);

  const submitMutation = trpc.mkKlassifizierung.submitNachtrag.useMutation({
    onSuccess: () => {
      toast.success("Antrag erfolgreich eingereicht");
      utils.hwp.auftragDetail.invalidate();
      setMengen({});
      setKommentar("");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const handleSubmit = () => {
    const positionen = MK_KATALOG
      .filter(pos => (mengen[pos.key] ?? 0) > 0)
      .map(pos => ({ positionKey: pos.key, menge: mengen[pos.key] }));

    if (positionen.length === 0) {
      toast.error("Bitte mindestens eine Position mit Menge > 0 eingeben");
      return;
    }

    submitMutation.mutate({
      rechnungId,
      positionen,
      hwpKommentar: kommentar || undefined,
      uvAnzahl,
      pauschaleBetrag,
    });
  };

  const handleReset = () => {
    setMengen({});
    setKommentar("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            Antrag einreichen
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Info-Banner */}
          <div className="flex items-start gap-2 text-sm bg-blue-50 text-blue-700 rounded-lg p-3 border border-blue-200">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Pauschale: {uvAnzahl} UV · {formatCurrency(pauschaleBetrag)}</p>
              <p className="text-xs text-blue-600 mt-0.5">
                Inklusivmengen (SLS, Kabel, H-Automaten, Durchbrüche) werden automatisch abgezogen.
              </p>
            </div>
          </div>

          {/* Positionen nach Kategorie */}
          {Object.entries(kategorien).map(([kat, positionen]) => (
            <div key={kat}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                {KATEGORIE_LABELS[kat] ?? kat}
              </p>
              <div className="space-y-1.5">
                {positionen.map(pos => {
                  const menge = mengen[pos.key] ?? 0;
                  const inklusiv = Math.min(menge, pauschaleAbzug.get(pos.key) ?? 0);
                  const netto = menge - inklusiv;
                  const preis = netto * pos.einzelpreisEuro;
                  const hasInklusiv = pauschaleAbzug.has(pos.key);

                  return (
                    <div key={pos.key} className={`flex items-center gap-3 py-1.5 px-2 rounded-md ${menge > 0 ? "bg-primary/5 border border-primary/10" : "hover:bg-muted/30"}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium truncate">{pos.label}</span>
                          {hasInklusiv && (
                            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                              inkl. {pauschaleAbzug.get(pos.key)} {pos.einheit === "Meter" ? "m" : "×"}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency(pos.einzelpreisEuro)} / {pos.einheit === "Meter" ? "m" : "Stück"}
                          {menge > 0 && netto > 0 && (
                            <span className="ml-2 text-primary font-medium">→ {formatCurrency(preis)}</span>
                          )}
                          {menge > 0 && netto === 0 && inklusiv > 0 && (
                            <span className="ml-2 text-emerald-600 font-medium">→ inklusiv</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setMengen(m => ({ ...m, [pos.key]: Math.max(0, (m[pos.key] ?? 0) - 1) }))}
                          disabled={!menge}
                        >
                          –
                        </Button>
                        <Input
                          type="number"
                          min={0}
                          value={menge || ""}
                          placeholder="0"
                          onChange={(e) => {
                            const v = parseInt(e.target.value) || 0;
                            setMengen(m => ({ ...m, [pos.key]: Math.max(0, v) }));
                          }}
                          className="w-16 h-7 text-center text-sm px-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setMengen(m => ({ ...m, [pos.key]: (m[pos.key] ?? 0) + 1 }))}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Kommentar */}
          <div className="space-y-1.5">
            <Label>Kommentar (optional)</Label>
            <Textarea
              value={kommentar}
              onChange={(e) => setKommentar(e.target.value)}
              placeholder="Begründung oder Anmerkungen zum Antrag..."
              rows={3}
            />
          </div>

          {/* Zusammenfassung */}
          <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 border">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Materialwert (brutto)</span>
              <span>{formatCurrency(berechnung.summeOhnePauschale)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>+ Pauschale ({uvAnzahl} UV)</span>
              <span className="text-primary">+{formatCurrency(pauschaleBetrag)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-primary">
              <span>Gesamtbetrag Antrag</span>
              <span className="text-lg">{formatCurrency(berechnung.summeMitPauschale)}</span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={handleReset} className="mr-auto">
            Zurücksetzen
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitMutation.isPending || berechnung.summeOhnePauschale === 0}
          >
            {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Antrag einreichen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function HwpAuftragDetail({ airtableId }: { airtableId: string }) {
  const [, navigate] = useLocation();
  const [showNachtragDialog, setShowNachtragDialog] = useState(false);
  const [showAntragDialog, setShowAntragDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const utils = trpc.useUtils();
  const { user } = useAuth();

  const { data, isLoading, error } = trpc.hwp.auftragDetail.useQuery(
    { airtableId },
    { retry: false }
  );
  // Klassi-Daten laden
  const { data: klassiData, isLoading: klassiLoading } = trpc.mehrkosten.getKlassifizierung.useQuery(
    { orderNumber: data?.orderNumber ?? "" },
    { enabled: !!data?.orderNumber }
  );

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-2">Lade Auftrag...</p>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !data) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-destructive mb-2" />
          <p className="text-sm font-medium">Auftrag nicht gefunden</p>
          <Button variant="ghost" className="mt-4" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Zurück
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const { rechnung: rechnungData } = data;
  const rechnung = rechnungData?.rechnung;
  const positionen = rechnungData?.positionen ?? [];
  const nachtraege = rechnungData?.nachtraege ?? [];

  // Nachtrag einreichbar wenn Rechnung vorhanden und Status nicht bereits freigegeben/nachtrag
  const kannNachtragEinreichen = rechnung && !["freigegeben", "nachtrag"].includes(rechnung.status);
  // Neuen Antrag einreichen wenn noch keine Rechnung vorhanden
  const kannAntragEinreichen = !rechnung && !!data.orderNumber;
  // HWP kann Antrag bearbeiten wenn Status "nachtrag" (eingereicht, aber noch nicht freigegeben/abgelehnt)
  const kannAntragBearbeiten = rechnung && rechnung.status === "nachtrag";

  // PDF-Download
  const handlePdfDownload = async () => {
    if (!rechnung) return;
    setPdfLoading(true);
    try {
      const resp = await fetch(`/api/mk-antrag/${rechnung.id}/pdf`, { credentials: "include" });
      if (!resp.ok) throw new Error("PDF konnte nicht geladen werden");
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MK-Antrag-${data.orderNumber ?? rechnung.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("PDF-Download fehlgeschlagen");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.length > 1 ? window.history.back() : navigate("/hwp/auftraege")}
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Zurück
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">
              {data.opportunityName ?? data.appointmentNumber ?? "Auftrag"}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-sm text-muted-foreground">{data.appointmentNumber}</span>
              {data.orderNumber && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-sm text-muted-foreground">{data.orderNumber}</span>
                </>
              )}
              {data.status && (
                <Badge
                  variant="outline"
                  className={`text-xs ${STATUS_COLORS[data.status] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {STATUS_DE[data.status] ?? data.status}
                </Badge>
              )}
            </div>
          </div>

          {/* Antrag-Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {rechnung && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePdfDownload}
                disabled={pdfLoading}
                className="gap-2"
              >
                {pdfLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                PDF
              </Button>
            )}
            {kannAntragBearbeiten && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEditDialog(true)}
                className="gap-2"
              >
                <Pencil className="h-4 w-4" />
                Bearbeiten
              </Button>
            )}
            {kannNachtragEinreichen && (
              <Button
                onClick={() => setShowNachtragDialog(true)}
                className="gap-2"
                size="sm"
              >
                <PlusCircle className="h-4 w-4" />
                Antrag einreichen
              </Button>
            )}
            {kannAntragEinreichen && (
              <Button
                onClick={() => setShowAntragDialog(true)}
                className="gap-2 bg-emerald-600 hover:bg-emerald-500"
                size="sm"
              >
                <PlusCircle className="h-4 w-4" />
                Mehrkosten beantragen
              </Button>
            )}
          </div>
        </div>

        {/* Auftragsinformationen */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              Auftragsinformationen
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Zieldatum</p>
                <p className="font-medium">{formatDate(data.targetEnd ?? data.lastScheduledEnd)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Auftragsnummer</p>
                <p className="font-medium">{data.appointmentNumber ?? "–"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs mb-0.5">Bestellnummer</p>
                <p className="font-medium">{data.orderNumber ?? "–"}</p>
              </div>
              {data.fields?.["Technician: Account: Account Name"] && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">HWP</p>
                  <p className="font-medium">{String(data.fields["Technician: Account: Account Name"])}</p>
                </div>
              )}
              {data.fields?.["Mehrkosten"] != null && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Mehrkosten (Airtable)</p>
                  <p className="font-medium">{formatCurrency(Number(data.fields["Mehrkosten"]))}</p>
                </div>
              )}
              {data.fields?.["Pauschale"] != null && (
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Pauschale (Airtable)</p>
                  <p className="font-medium">{formatCurrency(Number(data.fields["Pauschale"]))}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Mehrkosten-Rechnung */}
        {!rechnung ? (
          <Card className="border shadow-sm border-dashed">
            <CardContent className="py-10 text-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Keine Mehrkosten-Rechnung vorhanden</p>
              <p className="text-xs text-muted-foreground mt-1">
                Für diesen Auftrag wurde noch keine Mehrkosten-Klassifizierung erstellt.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* MK-Zusammenfassung */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Euro className="h-4 w-4 text-muted-foreground" />
                    Mehrkosten-Rechnung
                  </CardTitle>
                  <Badge
                    className={`text-xs ${MK_STATUS_COLORS[rechnung.status] ?? "bg-slate-100 text-slate-600"}`}
                  >
                    {MK_STATUS_DE[rechnung.status] ?? rechnung.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">UV-Anzahl</p>
                    <p className="font-medium">{rechnung.uvAnzahl} UV</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Pauschalen-Betrag</p>
                    <p className="font-medium">{formatCurrency(rechnung.pauschaleBetrag)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Klassifiziert von</p>
                    <p className="font-medium">{rechnung.erstelltVonName ?? "–"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs mb-0.5">Zuletzt aktualisiert</p>
                    <p className="font-medium">{formatDate(rechnung.updatedAt)}</p>
                  </div>
                </div>

                <Separator />

                {/* Gesamtbetrag */}
                <div className="flex justify-between items-center py-2 px-3 bg-primary/5 rounded-lg border border-primary/10">
                  <span className="font-semibold text-sm">Gesamtbetrag Mehrkosten</span>
                  <span className="text-xl font-bold text-primary">
                    {formatCurrency(rechnung.summeMitPauschale)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Positionen */}
            {positionen.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    Leistungen
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableHead>Position</TableHead>
                        <TableHead className="text-right">Menge</TableHead>
                        <TableHead className="text-right">Inklusiv</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                        <TableHead className="text-right">Einzelpreis</TableHead>
                        <TableHead className="text-right">Gesamtpreis</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {positionen.map((pos) => (
                        <TableRow key={pos.id} className={pos.inPauschaleEnthalten ? "bg-emerald-50/30" : ""}>
                          <TableCell className="font-medium text-sm">
                            <div className="flex items-center gap-2">
                              {pos.positionLabel}
                              {pos.inPauschaleEnthalten && pos.nettomenge === 0 && (
                                <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                                  inklusiv
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {pos.menge} {pos.einheit === "Meter" ? "m" : "×"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-emerald-600">
                            {pos.pauschaleMenge > 0 ? `${pos.pauschaleMenge} ${pos.einheit === "Meter" ? "m" : "×"}` : "–"}
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {pos.nettomenge > 0 ? `${pos.nettomenge} ${pos.einheit === "Meter" ? "m" : "×"}` : "–"}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatCurrency(pos.einzelpreis)}
                          </TableCell>
                          <TableCell className="text-right text-sm font-semibold">
                            {pos.gesamtpreis > 0 ? formatCurrency(pos.gesamtpreis) : (
                              <span className="text-muted-foreground">–</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Summen-Footer */}
                  <div className="border-t px-4 py-3 space-y-1.5 bg-muted/10">
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Materialwert gesamt (brutto)</span>
                      <span>{formatCurrency(rechnung.summeOhnePauschale)}</span>
                    </div>
                    {rechnung.pauschaleBetrag > 0 && (
                      <div className="flex justify-between text-sm text-muted-foreground">
                        <span>+ Pauschalen-Betrag ({rechnung.uvAnzahl} UV)</span>
                        <span className="text-primary">+{formatCurrency(rechnung.pauschaleBetrag)}</span>
                      </div>
                    )}
                    <Separator />
                    <div className="flex justify-between font-bold text-primary">
                      <span>Gesamtbetrag Mehrkosten</span>
                      <span className="text-lg">{formatCurrency(rechnung.summeMitPauschale)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Anträge */}
            {nachtraege.length > 0 && (
              <Card className="border shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    Anträge ({nachtraege.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {nachtraege.map((nachtrag) => (
                    <div key={nachtrag.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{nachtrag.eingereichtVonName ?? "–"}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(nachtrag.eingereichtAt)}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            nachtrag.status === "freigegeben"
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : nachtrag.status === "abgelehnt"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : "bg-amber-100 text-amber-700 border-amber-200"
                          }`}
                        >
                          {nachtrag.status === "freigegeben" ? "Freigegeben"
                            : nachtrag.status === "abgelehnt" ? "Abgelehnt"
                            : "Offen"}
                        </Badge>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Beantragter Betrag</span>
                        <span className="font-medium">{formatCurrency(nachtrag.summeMitPauschale)}</span>
                      </div>
                      {nachtrag.freigegebenerBetrag != null && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Freigegebener Betrag</span>
                          <span className="font-medium text-emerald-700">{formatCurrency(nachtrag.freigegebenerBetrag)}</span>
                        </div>
                      )}
                      {nachtrag.hwpKommentar && (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                          <span className="font-medium">Kommentar: </span>{nachtrag.hwpKommentar}
                        </div>
                      )}
                      {nachtrag.prueferKommentar && (
                        <div className="text-xs text-muted-foreground bg-muted/40 rounded p-2">
                          <span className="font-medium">Prüfer-Kommentar: </span>{nachtrag.prueferKommentar}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Hinweis wenn noch kein Nachtrag */}
            {nachtraege.length === 0 && rechnung.status === "abgeschlossen" && (
              <Card className="border shadow-sm border-dashed">
                <CardContent className="py-6 text-center">
                  <Info className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Die Mehrkosten-Rechnung wurde klassifiziert. Sie können jetzt einen Antrag einreichen.
                  </p>
                  <Button
                    variant="outline"
                    className="mt-3 gap-2"
                    onClick={() => setShowNachtragDialog(true)}
                  >
                    <PlusCircle className="h-4 w-4" />
                    Antrag einreichen
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
         {/* ACH-Klassifizierung */}
        {data.orderNumber && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                ACH-Klassifizierung
              </CardTitle>
            </CardHeader>
            <CardContent>
              {klassiLoading ? (
                <p className="text-sm text-muted-foreground">Lade Klassifizierungsdaten...</p>
              ) : !klassiData ? (
                <p className="text-sm text-muted-foreground">Keine Klassifizierungsdaten vorhanden.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {klassiData.mehrkostenabschaetzung != null && (
                      <div><p className="text-xs text-muted-foreground">MK-Schätzung</p><p className="font-medium text-sm">{Number(klassiData.mehrkostenabschaetzung).toLocaleString("de-DE")} €</p></div>
                    )}
                    {klassiData.bauzeit && (
                      <div><p className="text-xs text-muted-foreground">Bauzeit</p><p className="font-medium text-sm">{klassiData.bauzeit}</p></div>
                    )}
                    {klassiData.risikobewertung && (
                      <div><p className="text-xs text-muted-foreground">Risiko</p>
                        <Badge variant={klassiData.risikobewertung === "Hoch" ? "destructive" : klassiData.risikobewertung === "Mittel" ? "secondary" : "outline"} className="text-xs">{klassiData.risikobewertung}</Badge>
                      </div>
                    )}
                    {klassiData.anzahlUv && (
                      <div><p className="text-xs text-muted-foreground">Anzahl UVs</p><p className="font-medium text-sm">{klassiData.anzahlUv}</p></div>
                    )}
                    {klassiData.komplex && <div><Badge variant="destructive" className="text-xs">Komplex</Badge></div>}
                    {klassiData.okf && <div><Badge variant="secondary" className="text-xs">OKF</Badge></div>}
                  </div>
                  {(klassiData.zaehlerSchrank || klassiData.hak?.length) && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Zählerschrank / HAK</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {klassiData.zaehlerSchrank && <div><span className="text-muted-foreground">Typ: </span>{klassiData.zaehlerSchrank}</div>}
                        {klassiData.hak?.length && <div><span className="text-muted-foreground">HAK: </span>{klassiData.hak.join(", ")}</div>}
                      </div>
                    </div>
                  )}
                  {klassiData.uvDetails?.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">Unterverteilungen</p>
                      <div className="space-y-1">
                        {klassiData.uvDetails.map(uv => (
                          <div key={uv.nr} className="text-sm flex gap-2">
                            <span className="text-muted-foreground">UV {uv.nr}:</span>
                            <span>{[uv.todo, uv.montage, uv.zuleitung].filter(Boolean).join(" | ") || "–"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {klassiData.tabHinweise && (
                    <div><p className="text-xs font-medium text-muted-foreground mb-1">TAB-Hinweise</p><p className="text-sm bg-muted/30 rounded p-2">{klassiData.tabHinweise}</p></div>
                  )}
                  {klassiData.wichtigeNotizen && (
                    <div><p className="text-xs font-medium text-muted-foreground mb-1">Notizen</p><p className="text-sm bg-muted/30 rounded p-2">{klassiData.wichtigeNotizen}</p></div>
                  )}
                  {klassiData.absprachen && (
                    <div><p className="text-xs font-medium text-muted-foreground mb-1">Absprachen</p><p className="text-sm bg-muted/30 rounded p-2">{klassiData.absprachen}</p></div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
      {/* Antrag-Dialog (wenn Rechnung bereits vorhanden) */}
      {rechnung && (
        <NachtragDialog
          open={showNachtragDialog}
          onClose={() => setShowNachtragDialog(false)}
          rechnungId={rechnung.id}
          uvAnzahl={rechnung.uvAnzahl}
          pauschaleBetrag={rechnung.pauschaleBetrag}
          onSuccess={() => utils.hwp.auftragDetail.invalidate()}
        />
      )}
      {/* Neuer Antrag-Dialog (wenn noch keine Rechnung vorhanden) */}
      {kannAntragEinreichen && (
        <HwpMkAntragDialog
          open={showAntragDialog}
          onClose={() => setShowAntragDialog(false)}
          onSuccess={() => utils.hwp.auftragDetail.invalidate()}
          airtableId={data.airtableId}
          orderNumber={data.orderNumber!}
          kundenName={data.opportunityName ?? data.appointmentNumber ?? ""}
          hwpName={String((data as any).hwpAccountName ?? "")}
          hwpAccountId={user?.airtableAccountId ?? undefined}
        />
      )}
      {/* Antrag bearbeiten (wenn Status nachtrag) */}
      {kannAntragBearbeiten && rechnung && (
        <HwpMkAntragDialog
          open={showEditDialog}
          onClose={() => setShowEditDialog(false)}
          onSuccess={() => utils.hwp.auftragDetail.invalidate()}
          airtableId={data.airtableId}
          orderNumber={data.orderNumber ?? ""}
          kundenName={data.opportunityName ?? data.appointmentNumber ?? ""}
          hwpName={String((data as any).hwpAccountName ?? "")}
          hwpAccountId={user?.airtableAccountId ?? undefined}
          rechnungId={rechnung.id}
          initialUvAnzahl={rechnung.uvAnzahl}
          initialMengen={Object.fromEntries(
            positionen
              .filter(p => !p.isFreitext)
              .map(p => [p.positionKey, p.menge])
          )}
          initialFreitext={positionen
            .filter(p => p.isFreitext)
            .map(p => ({
              id: String(p.id),
              bezeichnung: p.positionLabel,
              menge: p.menge,
              einzelpreis: Math.round(p.einzelpreis / 100),
            }))
          }
          initialKommentar={nachtraege[0]?.hwpKommentar ?? ""}
        />
      )}
    </DashboardLayout>
  );
}
