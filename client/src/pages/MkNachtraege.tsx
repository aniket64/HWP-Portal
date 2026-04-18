import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  CheckCircle,
  XCircle,
  Clock,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Loader2,
  Euro,
  Package,
  User,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Download,
  Pencil,
} from "lucide-react";
import HwpMkAntragDialog from "@/pages/HwpMkAntragDialog";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// ─── Typen & Konstanten ───────────────────────────────────────────────────────

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  offen: {
    label: "Ausstehend",
    color: "bg-amber-100 text-amber-800 border-amber-200",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  freigegeben: {
    label: "Freigegeben",
    color: "bg-emerald-100 text-emerald-800 border-emerald-200",
    icon: <CheckCircle className="w-3.5 h-3.5" />,
  },
  abgelehnt: {
    label: "Abgelehnt",
    color: "bg-red-100 text-red-800 border-red-200",
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
};

function formatCurrency(value: number | undefined | null): string {
  if (value == null) return "–";
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(value: string | Date | undefined | null): string {
  if (!value) return "–";
  return new Date(value as string).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Positionen-Lader (expandierter Bereich) ─────────────────────────────────

function NachtragPositionen({ orderNumber, nachtragSumme }: { orderNumber: string; nachtragSumme: number }) {
  const { data, isLoading } = trpc.mkKlassifizierung.getRechnung.useQuery({ orderNumber });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Lade Positionen...
      </div>
    );
  }

  const positionen = (data?.positionen ?? []).filter((p: any) => p.quelle === "nachtrag" && p.menge > 0);

  if (positionen.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">Keine Positionen hinterlegt</p>
    );
  }

  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/30 hover:bg-muted/30">
            <TableHead className="text-xs">Position</TableHead>
            <TableHead className="text-right text-xs">Menge</TableHead>
            <TableHead className="text-right text-xs">Inklusiv</TableHead>
            <TableHead className="text-right text-xs">Netto</TableHead>
            <TableHead className="text-right text-xs">Preis</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positionen.map((pos: any) => (
            <TableRow key={pos.id} className={pos.inPauschaleEnthalten && pos.nettomenge === 0 ? "opacity-50" : ""}>
              <TableCell className="text-sm py-2">
                <div className="flex items-center gap-1.5">
                  {pos.positionLabel}
                  {pos.inPauschaleEnthalten && pos.nettomenge === 0 && (
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                      inkl.
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right text-sm py-2">
                {pos.menge} {pos.einheit === "Meter" ? "m" : "×"}
              </TableCell>
              <TableCell className="text-right text-sm py-2 text-emerald-600">
                {pos.pauschaleMenge > 0 ? `${pos.pauschaleMenge} ${pos.einheit === "Meter" ? "m" : "×"}` : "–"}
              </TableCell>
              <TableCell className="text-right text-sm py-2 font-medium">
                {pos.nettomenge > 0 ? `${pos.nettomenge} ${pos.einheit === "Meter" ? "m" : "×"}` : "–"}
              </TableCell>
              <TableCell className="text-right text-sm py-2 font-semibold">
                {pos.gesamtpreis > 0 ? formatCurrency(pos.gesamtpreis) : <span className="text-muted-foreground">–</span>}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────

export default function MkNachtraege() {
  const { user } = useAuth();
  const isReviewer = user?.role === "admin" || user?.role === "tom" || user?.role === "kam";
  const isHwp = user?.role === "hwp";

  const [statusFilter, setStatusFilter] = useState<"offen" | "freigegeben" | "abgelehnt" | "alle">("alle");
  const [teamFilter, setTeamFilter] = useState<number | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Bearbeitungs-Dialog-State (für HWP)
  const [editDialog, setEditDialog] = useState<{
    rechnungId: number;
    orderNumber: string;
    kundenName: string;
    hwpName: string;
    airtableId: string;
    uvAnzahl: number;
    positionen: Array<{ positionKey: string; menge: number; isFreitext: boolean; freitextBezeichnung?: string; einzelpreis?: number }>;
    kommentar?: string;
  } | null>(null);

  // Teams laden (für Filter-Dropdown)
  const { data: teamsRaw } = trpc.teams.list.useQuery(
    undefined,
    { enabled: isReviewer, staleTime: 5 * 60 * 1000 }
  );
  const teamsList = (teamsRaw ?? []).filter(Boolean) as Array<{ id: number; name: string }>;  

  // Review-Dialog-State
  const [reviewDialog, setReviewDialog] = useState<{
    nachtragId: number;
    orderNumber: string;
    betrag: number;
    action: "approve" | "reject";
  } | null>(null);
  const [reviewKommentar, setReviewKommentar] = useState("");
  const [freigegebenerBetrag, setFreigegebenerBetrag] = useState<string>("");

  const utils = trpc.useUtils();

  // Rechnung-Detail laden wenn Bearbeitungs-Dialog geöffnet wird
  const { data: editRechnungData } = trpc.mkKlassifizierung.getRechnung.useQuery(
    { orderNumber: editDialog?.orderNumber ?? "" },
    { enabled: !!editDialog?.orderNumber }
  );

  const { data, isLoading } = trpc.mkKlassifizierung.listNachtraege.useQuery({
    status: statusFilter,
    pageSize: 100,
    teamFilter,
  });

  const { data: alleData } = trpc.mkKlassifizierung.listNachtraege.useQuery(
    { status: "alle", pageSize: 1000, teamFilter },
    { staleTime: 30 * 1000 }
  );

  const approveMutation = trpc.mkKlassifizierung.approveNachtrag.useMutation({
    onSuccess: () => {
      toast.success("Antrag freigegeben");
      utils.mkKlassifizierung.listNachtraege.invalidate();
      closeReviewDialog();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const rejectMutation = trpc.mkKlassifizierung.rejectNachtrag.useMutation({
    onSuccess: () => {
      toast.success("Antrag abgelehnt");
      utils.mkKlassifizierung.listNachtraege.invalidate();
      closeReviewDialog();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const closeReviewDialog = () => {
    setReviewDialog(null);
    setReviewKommentar("");
    setFreigegebenerBetrag("");
  };

  const openApproveDialog = (nachtragId: number, orderNumber: string, betrag: number) => {
    setReviewDialog({ nachtragId, orderNumber, betrag, action: "approve" });
    setFreigegebenerBetrag(String(betrag));
    setReviewKommentar("");
  };

  const openRejectDialog = (nachtragId: number, orderNumber: string, betrag: number) => {
    setReviewDialog({ nachtragId, orderNumber, betrag, action: "reject" });
    setFreigegebenerBetrag("");
    setReviewKommentar("");
  };

  const handleReview = () => {
    if (!reviewDialog) return;
    if (reviewDialog.action === "approve") {
      const betrag = parseInt(freigegebenerBetrag) || reviewDialog.betrag;
      approveMutation.mutate({
        nachtragId: reviewDialog.nachtragId,
        kommentar: reviewKommentar || undefined,
        freigegebenerBetrag: betrag,
      });
    } else {
      if (!reviewKommentar.trim()) {
        toast.error("Bitte einen Ablehnungsgrund angeben");
        return;
      }
      rejectMutation.mutate({
        nachtragId: reviewDialog.nachtragId,
        kommentar: reviewKommentar,
      });
    }
  };

  const nachtraege = data?.nachtraege ?? [];
  const counts = {
    offen:       (alleData?.nachtraege ?? []).filter(n => n.nachtrag.status === "offen").length,
    freigegeben: (alleData?.nachtraege ?? []).filter(n => n.nachtrag.status === "freigegeben").length,
    abgelehnt:   (alleData?.nachtraege ?? []).filter(n => n.nachtrag.status === "abgelehnt").length,
  };

  const deleteMutation = trpc.mkKlassifizierung.deleteRechnung.useMutation({
    onSuccess: () => {
      toast.success("Antrag gelöscht");
      utils.mkKlassifizierung.listNachtraege.invalidate();
    },
    onError: (e: { message: string }) => toast.error(`Fehler beim Löschen: ${e.message}`),
  });
  const handleDelete = (rechnungId: number, orderNumber: string) => {
    if (!confirm(`Antrag für Auftrag ${orderNumber} wirklich löschen?\nDiese Aktion kann nicht rückgängig gemacht werden.`)) return;
    deleteMutation.mutate({ rechnungId });
  };
  const isPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">MK Anträge</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {isReviewer
                ? "Eingereichte Anträge prüfen, freigeben oder ablehnen"
                : "Ihre eingereichten Anträge und deren Status"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Team-Filter (nur für Reviewer) */}
            {isReviewer && teamsList.length > 0 && (
              <Select
                value={teamFilter !== undefined ? String(teamFilter) : "alle"}
                onValueChange={v => setTeamFilter(v === "alle" ? undefined : Number(v))}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Alle Teams" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alle">Alle Teams</SelectItem>
                  {teamsList.map(t => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="alle">Alle Status</SelectItem>
                <SelectItem value="offen">Ausstehend</SelectItem>
                <SelectItem value="freigegeben">Freigegeben</SelectItem>
                <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Statistik-Karten (nur für Reviewer) */}
        {isReviewer && (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {(["offen", "freigegeben", "abgelehnt"] as const).map(s => {
              const info = STATUS_INFO[s];
              return (
                <Card
                  key={s}
                  className={`cursor-pointer transition-all hover:shadow-md ${statusFilter === s ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setStatusFilter(statusFilter === s ? "alle" : s)}
                >
                  <CardContent className="p-3 sm:p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{info.label}</p>
                      <p className="text-xl sm:text-2xl font-bold">{counts[s]}</p>
                    </div>
                    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full border ${info.color}`}>
                      {info.icon}
                    </span>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Nachtrag-Liste */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Lade Anträge...
          </div>
        ) : nachtraege.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <AlertCircle className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Keine Anträge gefunden</p>
              <p className="text-xs text-muted-foreground mt-1">
                {statusFilter !== "alle" ? `Keine Anträge mit Status „${STATUS_INFO[statusFilter]?.label}“` : "Noch keine Anträge eingereicht"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {nachtraege.map(({ nachtrag, rechnung }) => {
              const info = STATUS_INFO[nachtrag.status] ?? STATUS_INFO.offen;
              const isExpanded = expandedId === nachtrag.id;

              return (
                <Card key={nachtrag.id} className="overflow-hidden shadow-sm">
                  <CardContent className="p-0">
                    {/* Kopfzeile – klickbar zum Aufklappen */}
                    <div
                      className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 cursor-pointer hover:bg-muted/20 transition-colors"
                      onClick={() => setExpandedId(isExpanded ? null : nachtrag.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold truncate">
                            {rechnung.kundenName || rechnung.orderNumber}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono">
                            {rechnung.orderNumber}
                          </span>
                          {rechnung.hwpName && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {rechnung.hwpName}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            Eingereicht: {formatDateTime(nachtrag.eingereichtAt)}
                          </span>
                          {nachtrag.eingereichtVonName && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {nachtrag.eingereichtVonName}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0 space-y-1">
                        <div className="font-bold text-lg text-primary">
                          {formatCurrency(nachtrag.summeMitPauschale)}
                        </div>
                        {nachtrag.freigegebenerBetrag != null && nachtrag.status === "freigegeben" && (
                          <div className="text-xs text-emerald-600 font-medium">
                            Freigegeben: {formatCurrency(nachtrag.freigegebenerBetrag)}
                          </div>
                        )}
                        <Badge
                          variant="outline"
                          className={`text-xs flex items-center gap-1 ${info.color}`}
                        >
                          {info.icon}
                          {info.label}
                        </Badge>
                      </div>

                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </div>

                    {/* Aufgeklappter Bereich */}
                    {isExpanded && (
                      <div className="border-t bg-muted/5 p-4 space-y-4">

                        {/* Positionen */}
                        <div>
                          <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            Leistungen
                          </h4>
                          <NachtragPositionen
                            orderNumber={rechnung.orderNumber}
                            nachtragSumme={nachtrag.summeMitPauschale}
                          />
                        </div>

                        {/* Summen-Übersicht */}
                        <div className="bg-background rounded-lg border p-3 space-y-1.5">
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Netto-Material (exkl. enthalten)</span>
                            <span>{formatCurrency(nachtrag.summeMitPauschale - rechnung.pauschaleBetrag)}</span>
                          </div>
                          {/* Pauschalen-Zeile */}
                          {rechnung.pauschaleBetrag > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                Pauschale ({rechnung.uvAnzahl} UV)
                              </span>
                              <span className="text-emerald-600 font-medium">+ {formatCurrency(rechnung.pauschaleBetrag)}</span>
                            </div>
                          )}
                          {rechnung.pauschaleBetrag === 0 && rechnung.uvAnzahl > 0 && (
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Pauschale ({rechnung.uvAnzahl} UV)</span>
                              <span className="text-muted-foreground/60 italic text-xs">keine hinterlegt</span>
                            </div>
                          )}
                          <Separator />
                          <div className="flex justify-between font-bold text-primary">
                            <span>Beantragter Betrag</span>
                            <span>{formatCurrency(nachtrag.summeMitPauschale)}</span>
                          </div>
                          {nachtrag.freigegebenerBetrag != null && nachtrag.status === "freigegeben" && (
                            <div className="flex justify-between font-bold text-emerald-700">
                              <span>Freigegebener Betrag</span>
                              <span>{formatCurrency(nachtrag.freigegebenerBetrag)}</span>
                            </div>
                          )}
                        </div>

                        {/* HWP-Kommentar */}
                        {nachtrag.hwpKommentar && (
                          <div>
                            <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                              Kommentar (HWP)
                            </h4>
                            <p className="text-sm text-muted-foreground bg-background rounded-md p-2.5 border">
                              {nachtrag.hwpKommentar}
                            </p>
                          </div>
                        )}

                        {/* Prüfer-Kommentar */}
                        {nachtrag.prueferKommentar && (
                          <div>
                            <h4 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                              <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                              Prüfer-Kommentar
                              {nachtrag.geprueftVonName && (
                                <span className="text-muted-foreground font-normal text-xs">
                                  ({nachtrag.geprueftVonName}, {formatDateTime(nachtrag.geprueftAt)})
                                </span>
                              )}
                            </h4>
                            <p className={`text-sm rounded-md p-2.5 border ${nachtrag.status === "abgelehnt" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                              {nachtrag.prueferKommentar}
                            </p>
                          </div>
                        )}

                        {/* PDF-Download-Button (für Reviewer und HWP) */}
                        {(isReviewer || isHwp) && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  const resp = await fetch(`/api/mk-antrag/${rechnung.id}/pdf`, { credentials: "include" });
                                  if (!resp.ok) throw new Error();
                                  const blob = await resp.blob();
                                  const url = URL.createObjectURL(blob);
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = `MK-Antrag-${rechnung.orderNumber}.pdf`;
                                  document.body.appendChild(a);
                                  a.click();
                                  document.body.removeChild(a);
                                  URL.revokeObjectURL(url);
                                } catch {
                                  toast.error("PDF-Download fehlgeschlagen");
                                }
                              }}
                            >
                              <Download className="w-3.5 h-3.5" />
                              PDF herunterladen
                            </Button>
                          </div>
                        )}
                        {/* Lösch-Button (nur für Admins, bei allen Status) */}
                        {user?.role === "admin" && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              disabled={deleteMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(rechnung.id, rechnung.orderNumber);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Löschen
                            </Button>
                          </div>
                        )}
                        {/* Bearbeiten-Button (nur für HWP, nur wenn Status = offen) */}
                        {isHwp && nachtrag.status === "offen" && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditDialog({
                                  rechnungId: rechnung.id,
                                  orderNumber: rechnung.orderNumber,
                                  kundenName: rechnung.kundenName ?? "",
                                  hwpName: rechnung.hwpName ?? "",
                                  airtableId: rechnung.airtableAppointmentsId ?? rechnung.orderNumber,
                                  uvAnzahl: rechnung.uvAnzahl ?? 1,
                                  positionen: [],
                                  kommentar: nachtrag.hwpKommentar ?? undefined,
                                });
                                // Karte aufklappen damit man die Positionen sieht
                                setExpandedId(nachtrag.id);
                              }}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              Bearbeiten
                            </Button>
                          </div>
                        )}
                        {/* Aktions-Buttons (nur für Reviewer, nur wenn offen) */}
                        {isReviewer && nachtrag.status === "offen" && (
                          <div className="flex gap-2 pt-1">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                openApproveDialog(nachtrag.id, rechnung.orderNumber, nachtrag.summeMitPauschale);
                              }}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Freigeben
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="gap-1.5"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRejectDialog(nachtrag.id, rechnung.orderNumber, nachtrag.summeMitPauschale);
                              }}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Ablehnen
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Bearbeitungs-Dialog für HWP */}
      {editDialog && (() => {
        // Positionen aus dem geladenen Rechnungs-Detail extrahieren
        const positionen = editRechnungData?.positionen ?? [];
        const initialMengen: Record<string, number> = {};
        for (const p of positionen) {
          if (!p.isFreitext && p.quelle === "nachtrag") {
            initialMengen[p.positionKey] = p.menge;
          }
        }
        const initialFreitext = positionen
          .filter((p: any) => p.isFreitext && p.quelle === "nachtrag")
          .map((p: any) => ({
            id: String(p.id),
            bezeichnung: p.positionLabel ?? "",
            menge: p.menge ?? 1,
            einzelpreis: p.einzelpreis ?? 0,
          }));
        // key = positionen.length stellt sicher dass der Dialog neu initialisiert wird
        // sobald die Daten vom Server ankommen
        return (
          <HwpMkAntragDialog
            key={`edit-${editDialog.rechnungId}-${positionen.length}`}
            open={!!editDialog}
            onClose={() => setEditDialog(null)}
            onSuccess={() => {
              setEditDialog(null);
              utils.mkKlassifizierung.listNachtraege.invalidate();
            }}
            airtableId={editDialog.airtableId}
            orderNumber={editDialog.orderNumber}
            kundenName={editDialog.kundenName}
            hwpName={editDialog.hwpName}
            hwpAccountId={user?.airtableAccountId ?? undefined}
            rechnungId={editDialog.rechnungId}
            initialUvAnzahl={editDialog.uvAnzahl}
            initialMengen={initialMengen}
            initialFreitext={initialFreitext}
            initialKommentar={editDialog.kommentar}
          />
        );
      })()}

      {/* Freigabe-/Ablehnungs-Dialog */}
      <Dialog open={!!reviewDialog} onOpenChange={(o) => !o && closeReviewDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {reviewDialog?.action === "approve" ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  Antrag freigeben
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-destructive" />
                  Antrag ablehnen
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            {/* Auftrag-Info */}
            <div className="bg-muted/30 rounded-lg p-3 border text-sm">
              <div className="font-semibold">{reviewDialog?.orderNumber}</div>
              <div className="text-muted-foreground mt-0.5">
                Beantragter Betrag: <span className="font-medium text-foreground">{formatCurrency(reviewDialog?.betrag)}</span>
              </div>
            </div>

            {/* Freigegebener Betrag (nur bei Freigabe) */}
            {reviewDialog?.action === "approve" && (
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Euro className="h-3.5 w-3.5 text-muted-foreground" />
                  Freigegebener Betrag (€)
                </Label>
                <Input
                  type="number"
                  min={0}
                  value={freigegebenerBetrag}
                  onChange={(e) => setFreigegebenerBetrag(e.target.value)}
                  placeholder={String(reviewDialog?.betrag ?? 0)}
                  className="font-mono"
                />
                {freigegebenerBetrag && parseInt(freigegebenerBetrag) !== reviewDialog?.betrag && (
                  <p className="text-xs text-amber-600">
                    Abweichung vom beantragten Betrag: {formatCurrency(parseInt(freigegebenerBetrag) - (reviewDialog?.betrag ?? 0))}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Leer lassen = beantragten Betrag übernehmen ({formatCurrency(reviewDialog?.betrag)})
                </p>
              </div>
            )}

            {/* Kommentar */}
            <div className="space-y-1.5">
              <Label>
                Kommentar
                {reviewDialog?.action === "reject" && (
                  <span className="text-destructive ml-1">* (Pflicht)</span>
                )}
                {reviewDialog?.action === "approve" && (
                  <span className="text-muted-foreground ml-1">(optional)</span>
                )}
              </Label>
              <Textarea
                placeholder={
                  reviewDialog?.action === "reject"
                    ? "Bitte Ablehnungsgrund angeben..."
                    : "Anmerkungen zur Freigabe (optional)..."
                }
                value={reviewKommentar}
                onChange={(e) => setReviewKommentar(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeReviewDialog} disabled={isPending}>
              Abbrechen
            </Button>
            <Button
              onClick={handleReview}
              disabled={
                isPending ||
                (reviewDialog?.action === "reject" && !reviewKommentar.trim())
              }
              className={
                reviewDialog?.action === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                  : ""
              }
              variant={reviewDialog?.action === "reject" ? "destructive" : "default"}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {reviewDialog?.action === "approve" ? "Freigeben" : "Ablehnen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
