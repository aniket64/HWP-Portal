/**
 * HwpMkAntragDialog
 * Ermöglicht Handwerkspartnern, selbstständig einen Mehrkosten-Antrag einzureichen.
 * - Pauschale wird direkt beim Öffnen geladen und sofort in der Gesamtsumme berücksichtigt
 * - Optionales Material-Feld: Bezeichnung, Menge, Einzelpreis (beliebig viele Zeilen)
 */
import { useState, useMemo, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Euro, PlusCircle, Minus, Plus, Trash2, PackagePlus } from "lucide-react";
import { toast } from "sonner";
import { MK_KATALOG, berechnePauschaleAbzug } from "@shared/mk-positionen-katalog";

// ─── Typen ────────────────────────────────────────────────────────────────────
interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  airtableId: string;
  orderNumber: string;
  kundenName: string;
  hwpName: string;
  hwpAccountId?: string; // Airtable Account-ID für zuverlässiges Pauschalen-Matching
  // Bearbeitungsmodus: wenn gesetzt, wird updateMkAntrag statt createMkAntrag aufgerufen
  rechnungId?: number;
  initialUvAnzahl?: number;
  initialMengen?: Record<string, number>;
  initialFreitext?: FreitextPosition[];
  initialKommentar?: string;
}

interface FreitextPosition {
  id: string;
  bezeichnung: string;
  menge: number;
  einzelpreis: number;
}

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

const KATEGORIE_LABELS: Record<string, string> = {
  kabel: "Kabel",
  zaehler: "Zähler",
  sls: "SLS / Absicherung",
  hak: "HAK / Hausanschluss",
  uv: "Unterverteilung",
  sonstiges: "Sonstiges",
};

function newFreitext(): FreitextPosition {
  return { id: crypto.randomUUID(), bezeichnung: "", menge: 1, einzelpreis: 0 };
}

// ─── localStorage-Hilfsfunktionen ────────────────────────────────────────────
const DRAFT_KEY_PREFIX = "hwp-mk-entwurf-";

function loadDraft(orderNumber: string) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY_PREFIX + orderNumber);
    if (!raw) return null;
    return JSON.parse(raw) as {
      uvAnzahl: number;
      mengen: Record<string, number>;
      freitextPositionen: FreitextPosition[];
      kommentar: string;
    };
  } catch {
    return null;
  }
}

function saveDraft(orderNumber: string, data: {
  uvAnzahl: number;
  mengen: Record<string, number>;
  freitextPositionen: FreitextPosition[];
  kommentar: string;
}) {
  try {
    localStorage.setItem(DRAFT_KEY_PREFIX + orderNumber, JSON.stringify(data));
  } catch {
    // localStorage nicht verfügbar – ignorieren
  }
}

function deleteDraft(orderNumber: string) {
  try {
    localStorage.removeItem(DRAFT_KEY_PREFIX + orderNumber);
  } catch {}
}

// ─── Hauptkomponente ──────────────────────────────────────────────────────────
export default function HwpMkAntragDialog({
  open, onClose, onSuccess, airtableId, orderNumber, kundenName, hwpName, hwpAccountId,
  rechnungId, initialUvAnzahl, initialMengen, initialFreitext, initialKommentar,
}: Props) {
  const isEditMode = !!rechnungId;
  // Entwurf aus localStorage laden (nur im Neu-Modus)
  const initialDraft = useMemo(() => isEditMode ? null : loadDraft(orderNumber), [orderNumber, isEditMode]);

  const [uvAnzahl, setUvAnzahl] = useState(initialUvAnzahl ?? initialDraft?.uvAnzahl ?? 1);
  const [mengen, setMengen] = useState<Record<string, number>>(initialMengen ?? initialDraft?.mengen ?? {});
  const [freitextPositionen, setFreitextPositionen] = useState<FreitextPosition[]>(initialFreitext ?? initialDraft?.freitextPositionen ?? []);
  const [kommentar, setKommentar] = useState(initialKommentar ?? initialDraft?.kommentar ?? "");
  const [hasDraft, setHasDraft] = useState(() => !isEditMode && loadDraft(orderNumber) !== null);
  const utils = trpc.useUtils();

  // Entwurf automatisch speichern wenn sich Werte ändern
  const persistDraft = useCallback(() => {
    const isEmpty = Object.values(mengen).every(m => m === 0) &&
      freitextPositionen.length === 0 &&
      !kommentar.trim();
    if (isEmpty) {
      deleteDraft(orderNumber);
      setHasDraft(false);
    } else {
      saveDraft(orderNumber, { uvAnzahl, mengen, freitextPositionen, kommentar });
      setHasDraft(true);
    }
  }, [orderNumber, uvAnzahl, mengen, freitextPositionen, kommentar]);

  useEffect(() => {
    if (open) persistDraft();
  }, [open, persistDraft]);

  // Pauschale direkt laden – wird sofort in der Gesamtsumme berücksichtigt
  // hwpAccountId ermöglicht zuverlässiges Matching unabhängig von Schreibweise des HWP-Namens
  const { data: pauschaleData, isLoading: pauschaleLoading } = trpc.hwp.getPauschaleForHwp.useQuery(
    { hwpName, hwpAccountId, uvAnzahl },
    { enabled: open && (!!hwpAccountId || !!hwpName) }
  );
  // betrag kommt jetzt in Euro (Integer) zurück
  const pauschaleBetrag = pauschaleData?.betrag ?? 0;

  // Pauschalen-Abzug berechnen
  const pauschaleAbzug = useMemo(() => berechnePauschaleAbzug(uvAnzahl), [uvAnzahl]);

  // Positionen nach Kategorie gruppieren
  const kategorien = useMemo(() => {
    const groups: Record<string, typeof MK_KATALOG> = {};
    for (const pos of MK_KATALOG) {
      const kat = pos.kategorie ?? "sonstiges";
      if (!groups[kat]) groups[kat] = [];
      groups[kat].push(pos);
    }
    return groups;
  }, []);

  // Summen berechnen
  const { summeKatalog, pauschaleSumme, freitextSumme, summeMitPauschale } = useMemo(() => {
    let summeKatalog = 0;
    let pauschaleSumme = 0;
    for (const pos of MK_KATALOG) {
      const menge = mengen[pos.key] ?? 0;
      if (menge <= 0) continue;
      const inklusiv = Math.min(menge, pauschaleAbzug.get(pos.key) ?? 0);
      summeKatalog += menge * pos.einzelpreisEuro;
      pauschaleSumme += inklusiv * pos.einzelpreisEuro;
    }
    const freitextSumme = freitextPositionen.reduce(
      (acc, p) => acc + (p.menge > 0 && p.einzelpreis > 0 ? p.menge * p.einzelpreis : 0), 0
    );
    const summeMitPauschale = summeKatalog - pauschaleSumme + pauschaleBetrag + freitextSumme;
    return { summeKatalog, pauschaleSumme, freitextSumme, summeMitPauschale };
  }, [mengen, freitextPositionen, pauschaleAbzug, pauschaleBetrag]);

  const katalogPositionenCount = Object.values(mengen).filter(m => m > 0).length;
  const freitextCount = freitextPositionen.filter(p => p.bezeichnung && p.menge > 0 && p.einzelpreis > 0).length;
  const hasPositionen = katalogPositionenCount > 0 || freitextCount > 0;

  // Freitext-Zeile hinzufügen
  const addFreitext = () => setFreitextPositionen(prev => [...prev, newFreitext()]);

  // Freitext-Zeile aktualisieren
  const updateFreitext = (id: string, field: keyof FreitextPosition, value: string | number) => {
    setFreitextPositionen(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  // Freitext-Zeile löschen
  const removeFreitext = (id: string) => {
    setFreitextPositionen(prev => prev.filter(p => p.id !== id));
  };

  const createMutation = trpc.hwp.createMkAntrag.useMutation({
    onSuccess: () => {
      toast.success("Mehrkosten-Antrag erfolgreich eingereicht");
      utils.hwp.auftragDetail.invalidate();
      utils.hwp.meineAuftraege.invalidate();
      utils.hwp.meineStats.invalidate();
      deleteDraft(orderNumber);
      setHasDraft(false);
      setMengen({});
      setFreitextPositionen([]);
      setKommentar("");
      setUvAnzahl(1);
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const updateMutation = trpc.hwp.updateMkAntrag.useMutation({
    onSuccess: () => {
      toast.success("Antrag erfolgreich aktualisiert");
      utils.hwp.auftragDetail.invalidate();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(`Fehler: ${e.message}`),
  });

  const submitMutation = isEditMode ? updateMutation : createMutation;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    // Katalog-Positionen
    const katalogPos = MK_KATALOG
      .filter(pos => (mengen[pos.key] ?? 0) > 0)
      .map(pos => ({ positionKey: pos.key, menge: mengen[pos.key], isFreitext: false }));

    // Freitext-Positionen (nur vollständig ausgefüllte)
    const freitextPos = freitextPositionen
      .filter(p => p.bezeichnung.trim() && p.menge > 0 && p.einzelpreis > 0)
      .map((p, i) => ({
        positionKey: `freitext_${i}`,
        menge: p.menge,
        isFreitext: true,
        freitextBezeichnung: p.bezeichnung.trim(),
        freitextEinzelpreis: Math.round(p.einzelpreis),
      }));

    if (katalogPos.length === 0 && freitextPos.length === 0) {
      toast.error("Bitte mindestens eine Position eingeben");
      return;
    }

    if (isEditMode && rechnungId) {
      updateMutation.mutate({
        rechnungId,
        uvAnzahl,
        pauschaleBetrag,
        positionen: [...katalogPos, ...freitextPos],
        kommentar: kommentar || undefined,
      });
    } else {
      createMutation.mutate({
        airtableId,
        orderNumber,
        kundenName,
        uvAnzahl,
        pauschaleBetrag,
        positionen: [...katalogPos, ...freitextPos],
        kommentar: kommentar || undefined,
      });
    }
  };

  const handleReset = () => {
    setMengen({});
    setFreitextPositionen([]);
    setKommentar("");
    setUvAnzahl(1);
    deleteDraft(orderNumber);
    setHasDraft(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="h-5 w-5 text-primary" />
            {isEditMode ? "Antrag bearbeiten" : "Mehrkosten-Antrag einreichen"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Auftrag-Info */}
          <div className="bg-muted/30 rounded-lg p-3 border text-sm">
            <p className="font-medium">{kundenName || "–"}</p>
            <p className="text-muted-foreground text-xs mt-0.5">Auftragsnr.: {orderNumber}</p>
          </div>

          {/* Entwurf-Banner */}
          {hasDraft && (
            <div className="flex items-center gap-2 text-sm bg-amber-50 text-amber-700 rounded-lg p-3 border border-amber-200">
              <span className="text-lg">💾</span>
              <div className="flex-1">
                <p className="font-medium text-xs">Gespeicherter Entwurf wiederhergestellt</p>
                <p className="text-xs text-amber-600 mt-0.5">Ihre Eingaben vom letzten Mal wurden automatisch geladen.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-amber-700 hover:text-amber-900 hover:bg-amber-100 h-7 text-xs px-2"
                onClick={handleReset}
              >
                Verwerfen
              </Button>
            </div>
          )}

          {/* UV-Anzahl */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Anzahl Unterverteilungen (UV)</Label>
            <Select
              value={String(uvAnzahl)}
              onValueChange={v => setUvAnzahl(Number(v))}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                  <SelectItem key={n} value={String(n)}>{n} UV</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Pauschale direkt anzeigen */}
            <div className="flex items-center gap-2 text-sm">
              {pauschaleLoading ? (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Lade Pauschale...
                </span>
              ) : pauschaleBetrag > 0 ? (
                <span className="text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 rounded px-2 py-1">
                  Pauschale ({uvAnzahl} UV): {formatCurrency(pauschaleBetrag)}
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Keine Pauschale hinterlegt</span>
              )}
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
                    <div
                      key={pos.key}
                      className={`flex items-center gap-3 py-1.5 px-2 rounded-md ${menge > 0 ? "bg-primary/5 border border-primary/10" : "hover:bg-muted/30"}`}
                    >
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
                          type="button" variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => setMengen(m => ({ ...m, [pos.key]: Math.max(0, (m[pos.key] ?? 0) - 1) }))}
                          disabled={!menge}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <Input
                          type="number" min={0} value={menge || ""} placeholder="0"
                          onChange={e => {
                            const v = parseInt(e.target.value, 10);
                            setMengen(m => ({ ...m, [pos.key]: isNaN(v) ? 0 : Math.max(0, v) }));
                          }}
                          className="h-7 w-16 text-center text-sm px-1"
                        />
                        <Button
                          type="button" variant="outline" size="icon" className="h-7 w-7"
                          onClick={() => setMengen(m => ({ ...m, [pos.key]: (m[pos.key] ?? 0) + 1 }))}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Optionales Material / Zusatzpositionen */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <PackagePlus className="h-3.5 w-3.5" />
                Optionales Material
              </p>
              <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={addFreitext}>
                <Plus className="h-3 w-3" />
                Zeile hinzufügen
              </Button>
            </div>

            {freitextPositionen.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1">
                Kein optionales Material – Zeile hinzufügen um Sondermaterial zu erfassen.
              </p>
            ) : (
              <div className="space-y-2">
                {/* Tabellenkopf */}
                <div className="grid grid-cols-[1fr_80px_90px_32px] gap-2 px-1">
                  <p className="text-xs text-muted-foreground font-medium">Bezeichnung</p>
                  <p className="text-xs text-muted-foreground font-medium text-center">Menge</p>
                  <p className="text-xs text-muted-foreground font-medium text-right">€ / Stk</p>
                  <span />
                </div>
                {freitextPositionen.map(p => {
                  const gesamt = p.menge > 0 && p.einzelpreis > 0 ? p.menge * p.einzelpreis : 0;
                  return (
                    <div key={p.id} className="grid grid-cols-[1fr_80px_90px_32px] gap-2 items-center bg-muted/20 rounded-md px-2 py-1.5 border">
                      <Input
                        value={p.bezeichnung}
                        onChange={e => updateFreitext(p.id, "bezeichnung", e.target.value)}
                        placeholder="z.B. Sonderkabel NYY-J"
                        className="h-7 text-sm"
                      />
                      <Input
                        type="number" min={1} value={p.menge || ""}
                        onChange={e => updateFreitext(p.id, "menge", Math.max(1, parseInt(e.target.value, 10) || 1))}
                        placeholder="1"
                        className="h-7 text-sm text-center px-1"
                      />
                      <div className="relative">
                        <Input
                          type="number" min={0} step={1} value={p.einzelpreis || ""}
                          onChange={e => updateFreitext(p.id, "einzelpreis", Math.max(0, parseFloat(e.target.value) || 0))}
                          placeholder="0"
                          className="h-7 text-sm text-right pr-5 pl-1"
                        />
                        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">€</span>
                      </div>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeFreitext(p.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      {gesamt > 0 && (
                        <div className="col-span-4 text-xs text-right text-primary font-medium pr-10">
                          → {formatCurrency(gesamt)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Summen-Übersicht (wenn Positionen vorhanden) */}
          {(katalogPositionenCount > 0 || freitextCount > 0) && (
            <div className="rounded-lg border bg-muted/20 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Position</TableHead>
                    <TableHead className="text-xs text-right">Menge</TableHead>
                    <TableHead className="text-xs text-right">EP</TableHead>
                    <TableHead className="text-xs text-right">Gesamt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Katalog-Positionen */}
                  {MK_KATALOG.filter(pos => (mengen[pos.key] ?? 0) > 0).map(pos => {
                    const menge = mengen[pos.key] ?? 0;
                    const inklusiv = Math.min(menge, pauschaleAbzug.get(pos.key) ?? 0);
                    const netto = menge - inklusiv;
                    return (
                      <TableRow key={pos.key}>
                        <TableCell className="text-xs py-1.5">{pos.label}</TableCell>
                        <TableCell className="text-xs text-right py-1.5">
                          {menge} {pos.einheit === "Meter" ? "m" : "×"}
                          {inklusiv > 0 && <span className="text-emerald-600 ml-1">(-{inklusiv} inkl.)</span>}
                        </TableCell>
                        <TableCell className="text-xs text-right py-1.5">{formatCurrency(pos.einzelpreisEuro)}</TableCell>
                        <TableCell className="text-xs text-right py-1.5 font-medium">
                          {netto > 0 ? formatCurrency(netto * pos.einzelpreisEuro) : <span className="text-emerald-600">inklusiv</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {/* Freitext-Positionen */}
                  {freitextPositionen.filter(p => p.bezeichnung && p.menge > 0 && p.einzelpreis > 0).map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs py-1.5 italic">{p.bezeichnung}</TableCell>
                      <TableCell className="text-xs text-right py-1.5">{p.menge} ×</TableCell>
                      <TableCell className="text-xs text-right py-1.5">{formatCurrency(p.einzelpreis)}</TableCell>
                      <TableCell className="text-xs text-right py-1.5 font-medium">{formatCurrency(p.menge * p.einzelpreis)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="px-4 py-3 border-t bg-muted/30 space-y-1.5">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Katalogpositionen (brutto)</span>
                  <span>{formatCurrency(summeKatalog)}</span>
                </div>
                {freitextSumme > 0 && (
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Optionales Material</span>
                    <span>{formatCurrency(freitextSumme)}</span>
                  </div>
                )}
                {pauschaleBetrag > 0 && (
                  <div className="flex justify-between text-sm text-emerald-700">
                    <span>Pauschale ({uvAnzahl} UV)</span>
                    <span>+{formatCurrency(pauschaleBetrag)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-primary">
                  <span className="flex items-center gap-1">
                    <Euro className="h-4 w-4" />
                    Gesamtbetrag
                  </span>
                  <span className="text-base">{formatCurrency(summeMitPauschale)}</span>
                </div>
              </div>
            </div>
          )}

          {/* Kommentar */}
          <div className="space-y-1.5">
            <Label className="text-sm">Kommentar / Begründung (optional)</Label>
            <Textarea
              placeholder="Optionale Begründung oder Hinweise zum Antrag..."
              value={kommentar}
              onChange={e => setKommentar(e.target.value)}
              rows={3}
              className="resize-none text-sm"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={handleReset} disabled={submitMutation.isPending}>
            Zurücksetzen
          </Button>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitMutation.isPending}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !hasPositionen}
            className="gap-2"
          >
            {isPending ? (
              <><Loader2 className="h-4 w-4 animate-spin" />{isEditMode ? "Wird gespeichert..." : "Wird eingereicht..."}</>
            ) : (
              <><PlusCircle className="h-4 w-4" />{isEditMode ? "Änderungen speichern" : "Antrag einreichen"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
