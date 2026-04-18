import { useState, useEffect, useMemo } from "react";
import { useLocation, useParams } from "wouter";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Info, Euro, Calculator, User, Plus, Trash2 } from "lucide-react";
import { MK_KATALOG, berechnePauschaleAbzug, getPauschalePositionen } from "../../../shared/mk-positionen-katalog";

const KATEGORIE_LABELS: Record<string, string> = {
  kabel: "Kabel & Leitungen",
  zaehler: "Zähler & Schränke",
  uv: "Unterverteilungen",
  sonstiges: "Sonstiges",
};

type PositionenMap = Record<string, number>;
type FreitextPosition = { id: string; bezeichnung: string; menge: number; einzelpreis: number };

export default function MkRechner() {
  const params = useParams<{ orderNumber: string }>();
  const orderNumber = decodeURIComponent(params.orderNumber ?? "");
  const [, navigate] = useLocation();

  // URL-Parameter für Kontext
  const searchParams = new URLSearchParams(window.location.search);
  const quelle = searchParams.get("quelle") ?? "tbk";
  const airtableId = searchParams.get("airtableId") ?? "";

  // State
  const [uvAnzahl, setUvAnzahl] = useState(1);
  const [selectedHwp, setSelectedHwp] = useState<string>("");
  const [positionen, setPositionen] = useState<PositionenMap>({});
  const [freitextPositionen, setFreitextPositionen] = useState<FreitextPosition[]>([]);
  const [notiz, setNotiz] = useState("");
  const [saved, setSaved] = useState(false);

  // Daten laden
  const { data: existingRechnung, isLoading } = trpc.mkKlassifizierung.getRechnung.useQuery(
    { orderNumber },
    { enabled: !!orderNumber }
  );

  const { data: pauschalen, isLoading: pauschalenLoading } = trpc.mkKlassifizierung.getPauschalen.useQuery();

  // Vorhandene Rechnung laden
  useEffect(() => {
    if (existingRechnung?.rechnung) {
      setUvAnzahl(existingRechnung.rechnung.uvAnzahl ?? 1);
      if (existingRechnung.rechnung.hwpName) {
        setSelectedHwp(existingRechnung.rechnung.hwpName);
      }
      const posMap: PositionenMap = {};
      existingRechnung.positionen?.forEach((p: { positionKey: string; menge: number }) => {
        posMap[p.positionKey] = p.menge;
      });
      setPositionen(posMap);
    }
  }, [existingRechnung]);

  // Pauschalen-Abzug (Inklusivmengen) basierend auf UV-Anzahl
  const pauschaleAbzug = useMemo(() => berechnePauschaleAbzug(uvAnzahl), [uvAnzahl]);
  const pauschalePositionen = useMemo(() => getPauschalePositionen(uvAnzahl), [uvAnzahl]);

  // HWP-spezifischer Pauschalen-Betrag aus Airtable
  const pauschaleBetrag = useMemo(() => {
    if (!pauschalen || !selectedHwp) return 0;
    const hwpPauschale = pauschalen.find(p => p.hwpName === selectedHwp);
    if (!hwpPauschale) return 0;
    // UV-Anzahl auf max. 4 begrenzen (Tabelle hat nur 1–4)
    const uvKey = `uv${Math.min(uvAnzahl, 4)}` as "uv1" | "uv2" | "uv3" | "uv4";
    return hwpPauschale[uvKey] ?? 0;
  }, [pauschalen, selectedHwp, uvAnzahl]);

  // Berechnung
  const berechnung = useMemo(() => {
    let bruttoSumme = 0;
    let pauschaleWert = 0;
    MK_KATALOG.forEach(pos => {
      const menge = positionen[pos.key] ?? 0;
      if (menge > 0) {
        bruttoSumme += menge * pos.einzelpreisEuro;
        const abzugMenge = pauschaleAbzug.get(pos.key) ?? 0;
        pauschaleWert += Math.min(menge, abzugMenge) * pos.einzelpreisEuro;
      }
    });
    // Freitext-Positionen addieren
    const freitextSumme = freitextPositionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0);
    bruttoSumme += freitextSumme;
    const summeOhnePauschale = bruttoSumme;
    const summeMitPauschale = bruttoSumme - pauschaleWert + pauschaleBetrag;
    return { bruttoSumme, pauschaleWert, summeOhnePauschale, summeMitPauschale, freitextSumme };
  }, [positionen, freitextPositionen, pauschaleAbzug, pauschaleBetrag]);

  // Mutations
  const saveRechnungMutation = trpc.mkKlassifizierung.saveRechnung.useMutation({
    onSuccess: () => {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    const posArray = [
      ...Object.entries(positionen)
        .filter(([, menge]) => menge > 0)
        .map(([positionKey, menge]) => ({ positionKey, menge, isFreitext: false as const })),
      ...freitextPositionen
        .filter(p => p.menge > 0 && p.bezeichnung.trim())
        .map(p => ({
          positionKey: `freitext_${p.id}`,
          menge: p.menge,
          isFreitext: true as const,
          freitextBezeichnung: p.bezeichnung,
          freitextEinzelpreis: Math.round(p.einzelpreis * 100),
        })),
    ];
    saveRechnungMutation.mutate({
      orderNumber,
      kundenName: orderNumber,
      airtableId,
      quelle: quelle as "tbk" | "ntbk",
      hwpName: selectedHwp || undefined,
      uvAnzahl,
      pauschaleBetrag,
      positionen: posArray,
    });
  };
  const addFreitextPosition = () => {
    setFreitextPositionen(prev => [...prev, { id: crypto.randomUUID(), bezeichnung: "", menge: 1, einzelpreis: 0 }]);
  };
  const removeFreitextPosition = (id: string) => {
    setFreitextPositionen(prev => prev.filter(p => p.id !== id));
  };
  const updateFreitextPosition = (id: string, field: keyof FreitextPosition, value: string | number) => {
    setFreitextPositionen(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p));
  };

  const setMenge = (key: string, value: number) => {
    setPositionen(prev => ({ ...prev, [key]: Math.max(0, value) }));
  };

  const kategorien = ["kabel", "zaehler", "uv", "sonstiges"] as const;

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-8 text-center text-muted-foreground">Lade Rechnung...</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start gap-2 sm:gap-4">
          <Button variant="ghost" size="sm" className="shrink-0 mt-0.5" onClick={() => window.history.length > 1 ? window.history.back() : navigate("/mk-klassifizierung")}>
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">Zurück</span>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground leading-tight">Mehrkosten-Rechner</h1>
            <p className="text-muted-foreground text-xs sm:text-sm mt-0.5 truncate">
              {orderNumber} · {quelle.toUpperCase()}
              {existingRechnung?.rechnung && (
                <Badge variant="outline" className="text-xs ml-2">
                  {existingRechnung.rechnung.status === "entwurf" ? "Entwurf" :
                   existingRechnung.rechnung.status === "freigegeben" ? "Freigegeben" :
                   existingRechnung.rechnung.status === "abgelehnt" ? "Abgelehnt" :
                   existingRechnung.rechnung.status}
                </Badge>
              )}
            </p>
          </div>
          <Button size="sm" className="shrink-0" onClick={handleSave} disabled={saveRechnungMutation.isPending} variant={saved ? "outline" : "default"}>
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline ml-1">{saved ? "Gespeichert ✓" : saveRechnungMutation.isPending ? "Speichert..." : "Speichern"}</span>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Linke Spalte: Positionen */}
          <div className="lg:col-span-2 space-y-4">
            {/* HWP + UV-Auswahl */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Calculator className="w-4 h-4" />
                  Konfiguration
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* HWP-Auswahl */}
                <div>
                  <label className="text-sm text-muted-foreground mb-1 block flex items-center gap-1">
                    <User className="w-3 h-3" />
                    Handwerkspartner (für Pauschalen-Betrag)
                  </label>
                  {pauschalenLoading ? (
                    <div className="text-sm text-muted-foreground">Lade Handwerkspartner...</div>
                  ) : (
                    <Select
                      value={selectedHwp}
                      onValueChange={setSelectedHwp}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Handwerkspartner auswählen..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(pauschalen ?? [])
                          .filter(p => p.hwpName)
                          .sort((a, b) => a.hwpName.localeCompare(b.hwpName))
                          .map(p => (
                            <SelectItem key={p.id} value={p.hwpName}>
                              {p.hwpName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  {selectedHwp && pauschaleBetrag > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Pauschale bei {uvAnzahl} UV: <span className="font-medium text-primary">{pauschaleBetrag.toLocaleString("de-DE")} €</span>
                    </p>
                  )}
                  {selectedHwp && pauschaleBetrag === 0 && (
                    <p className="text-xs text-amber-600 mt-1">
                      Kein Pauschalen-Betrag für {uvAnzahl} UV hinterlegt.
                    </p>
                  )}
                </div>

                {/* UV-Anzahl */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-1 block">Anzahl UVs beim Kunden</label>
                    <Select value={String(uvAnzahl)} onValueChange={v => setUvAnzahl(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <SelectItem key={n} value={String(n)}>{n} UV{n > 1 ? "s" : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">In Pauschale enthalten:</p>
                    <div className="text-xs text-muted-foreground space-y-0.5 bg-muted/30 rounded p-2">
                      {pauschalePositionen.map(p => (
                        <div key={p.key} className="flex justify-between">
                          <span>{p.label}</span>
                          <span className="font-medium">
                            {p.menge} {MK_KATALOG.find(k => k.key === p.key)?.einheit === "Meter" ? "m" : "x"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Positionen nach Kategorie */}
            {kategorien.map(kat => {
              const katPositionen = MK_KATALOG.filter(p => p.kategorie === kat);
              const katSumme = katPositionen.reduce((sum, p) => sum + (positionen[p.key] ?? 0) * p.einzelpreisEuro, 0);
              return (
                <Card key={kat}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{KATEGORIE_LABELS[kat]}</CardTitle>
                      {katSumme > 0 && (
                        <span className="text-sm font-medium text-primary">{katSumme.toLocaleString("de-DE")} €</span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1">
                      {katPositionen.map(pos => {
                        const menge = positionen[pos.key] ?? 0;
                        const abzugMenge = pauschaleAbzug.get(pos.key) ?? 0;
                        const posGesamt = menge * pos.einzelpreisEuro;
                        const abzugGesamt = Math.min(menge, abzugMenge) * pos.einzelpreisEuro;
                        const nettoGesamt = posGesamt - abzugGesamt;
                        return (
                          <div key={pos.key} className="py-1.5 border-b last:border-0">
                            {/* Zeile 1: Name + Controls */}
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1 flex-wrap">
                                  <span className="text-sm">{pos.label}</span>
                                  <span className="text-xs text-muted-foreground">({pos.einzelpreisEuro} €/{pos.einheit === "Meter" ? "m" : "Stk"})</span>
                                  {abzugMenge > 0 && (
                                    <Badge variant="secondary" className="text-xs py-0">{abzugMenge} {pos.einheit === "Meter" ? "m" : "x"} inkl.</Badge>
                                  )}
                                </div>
                              </div>
                              {/* Preis rechts neben Controls */}
                              {menge > 0 && (
                                <div className="text-right text-xs shrink-0">
                                  {abzugGesamt === posGesamt
                                    ? <span className="text-green-600">voll inkl.</span>
                                    : abzugGesamt > 0
                                    ? <span className="font-medium">{nettoGesamt.toLocaleString("de-DE")} €</span>
                                    : <span className="font-medium">{posGesamt.toLocaleString("de-DE")} €</span>
                                  }
                                </div>
                              )}
                              <div className="flex items-center gap-1 shrink-0">
                                <Button variant="outline" size="icon" className="h-7 w-7 text-base" onClick={() => setMenge(pos.key, menge - 1)} disabled={menge <= 0}>–</Button>
                                <Input type="number" min={0} value={menge || ""} placeholder="0"
                                  onChange={e => setMenge(pos.key, parseInt(e.target.value) || 0)}
                                  className="w-14 h-7 text-center text-sm px-1" />
                                <Button variant="outline" size="icon" className="h-7 w-7 text-base" onClick={() => setMenge(pos.key, menge + 1)}>+</Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Freitext-Positionen */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Zusatzpositionen (Freitext)</CardTitle>
                  <Button variant="outline" size="sm" onClick={addFreitextPosition} className="h-7 text-xs">
                    <Plus className="w-3 h-3 mr-1" />
                    Position hinzufügen
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {freitextPositionen.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Keine Zusatzpositionen. Klicke oben um eine hinzuzufügen.</p>
                ) : (
                  <div className="space-y-3">
                    {freitextPositionen.map(p => (
                      <div key={p.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-2 items-center">
                        <Input
                          placeholder="Bezeichnung..."
                          value={p.bezeichnung}
                          onChange={e => updateFreitextPosition(p.id, "bezeichnung", e.target.value)}
                          className="h-8 text-sm"
                        />
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Menge</span>
                          <Input
                            type="number" min={1} value={p.menge}
                            onChange={e => updateFreitextPosition(p.id, "menge", parseInt(e.target.value) || 1)}
                            className="w-16 h-8 text-sm text-center"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">€/Stk</span>
                          <Input
                            type="number" min={0} step={0.01} value={p.einzelpreis || ""}
                            placeholder="0"
                            onChange={e => updateFreitextPosition(p.id, "einzelpreis", parseFloat(e.target.value) || 0)}
                            className="w-24 h-8 text-sm text-right"
                          />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeFreitextPosition(p.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                    {freitextPositionen.some(p => p.menge > 0 && p.einzelpreis > 0) && (
                      <div className="text-right text-sm font-medium text-primary pt-1 border-t">
                        Summe Zusatz: {freitextPositionen.reduce((s, p) => s + p.menge * p.einzelpreis, 0).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Notiz */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Notiz / Begründung</CardTitle>
              </CardHeader>
              <CardContent>
                <textarea
                  className="w-full min-h-[80px] text-sm border rounded-md p-2 bg-background resize-y"
                  placeholder="Optionale Notiz zur Mehrkosten-Einschätzung..."
                  value={notiz}
                  onChange={e => setNotiz(e.target.value)}
                />
              </CardContent>
            </Card>
          </div>

          {/* Rechte Spalte: Zusammenfassung */}
          <div className="space-y-4">
            <Card className="sticky top-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Euro className="w-4 h-4" />
                  Zusammenfassung
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Positionen-Übersicht */}
                <div className="space-y-1">
                  {MK_KATALOG.filter(p => (positionen[p.key] ?? 0) > 0).map(pos => {
                    const menge = positionen[pos.key] ?? 0;
                    const abzugMenge = pauschaleAbzug.get(pos.key) ?? 0;
                    const inklusivMenge = Math.min(menge, abzugMenge);
                    const nettoMenge = menge - inklusivMenge;
                    return (
                      <div key={pos.key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground truncate mr-2">
                          {pos.label} ({menge} {pos.einheit === "Meter" ? "m" : "x"})
                          {inklusivMenge > 0 && (
                            <span className="text-xs text-green-600 ml-1">
                              ({inklusivMenge} inkl.)
                            </span>
                          )}
                        </span>
                        <span className="shrink-0">
                          {(menge * pos.einzelpreisEuro).toLocaleString("de-DE")} €
                        </span>
                      </div>
                    );
                  })}
                  {Object.values(positionen).every(v => v === 0) && (
                    <p className="text-sm text-muted-foreground text-center py-2">Noch keine Positionen</p>
                  )}
                </div>

                <Separator />

                {/* Summen */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Brutto-Summe</span>
                    <span className="font-medium">{berechnung.bruttoSumme.toLocaleString("de-DE")} €</span>
                  </div>
                  {berechnung.pauschaleWert > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>davon in Pauschale enthalten</span>
                      <span>−{berechnung.pauschaleWert.toLocaleString("de-DE")} €</span>
                    </div>
                  )}
                  {pauschaleBetrag > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>+ Pauschalen-Betrag ({uvAnzahl} UV)</span>
                      <span className="text-primary">+{pauschaleBetrag.toLocaleString("de-DE")} €</span>
                    </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2">
                  <div className="flex justify-between font-bold text-primary">
                    <span>Gesamtbetrag Mehrkosten</span>
                    <span className="text-lg">{berechnung.summeMitPauschale.toLocaleString("de-DE")} €</span>
                  </div>
                </div>

                <Separator />

                {/* Pauschale-Info */}
                <div className="bg-muted/40 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex items-center gap-1 font-medium text-foreground">
                    <Info className="w-3 h-3" />
                    Inklusivleistungen ({uvAnzahl} UV)
                  </div>
                  {pauschalePositionen.map(p => (
                    <div key={p.key} className="flex justify-between">
                      <span>{p.label}</span>
                      <span>{p.menge} {MK_KATALOG.find(k => k.key === p.key)?.einheit === "Meter" ? "m" : "x"}</span>
                    </div>
                  ))}
                  {selectedHwp ? (
                    <div className="flex justify-between font-medium mt-1 pt-1 border-t">
                      <span>Pauschalen-Betrag ({selectedHwp})</span>
                      <span className={pauschaleBetrag > 0 ? "text-primary" : "text-amber-600"}>
                        {pauschaleBetrag > 0 ? `${pauschaleBetrag.toLocaleString("de-DE")} €` : "nicht hinterlegt"}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 pt-1 border-t text-amber-600">
                      Bitte Handwerkspartner auswählen für Pauschalen-Betrag
                    </div>
                  )}
                </div>

                <Button
                  className="w-full"
                  onClick={handleSave}
                  disabled={saveRechnungMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saved ? "Gespeichert ✓" : "Entwurf speichern"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
