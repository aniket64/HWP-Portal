# HWP Partner Portal – TODO

## Phase 2: Datenbankschema & Auth
- [x] Datenbankschema erweitern: users mit custom Rollen (admin, hwp, tom, kam, tl)
- [x] Custom Login-System (JWT-based authentication)
- [x] Passwort-Hashing (bcrypt)
- [x] DB-Migration durchführen (pnpm db:push)

## Phase 3: Backend
- [x] Auth-Router: login, logout, me (custom JWT)
- [x] User-Management-Router: CRUD für Admin
- [x] Rollen-Middleware (adminProcedure, protectedProcedure)
- [x] Airtable-Service: Mehrkostenfreigabe-Tabelle (tbl7Ic2j1ozM0sTjF)
- [x] Airtable-Router: getRecords mit Pagination, Filter, Sortierung
- [x] Airtable API Key als Secret hinterlegen
- [x] Berechtigungs-Tabelle (rolePermissions) in DB
- [x] Admin-Seed beim Start (admin@hwp-portal.de)

## Phase 4: Frontend
- [x] Login-Seite (E-Mail + Passwort, kein OAuth, dunkles Design)
- [x] DashboardLayout mit rollenbasierter Navigation (Sidebar)
- [x] Kunden-Dashboard: KPI-Karten + neueste Aufträge
- [x] Mehrkosten-Listenansicht (Filter, Suche, Sortierung, Pagination)
- [x] Mehrkosten-Detailansicht (alle 92 Felder strukturiert)
- [x] Admin-Panel: Benutzerverwaltung (CRUD + Aktivierung)
- [x] Admin-Panel: Rollen- und Berechtigungsverwaltung
- [x] Mehrkosten-Status-Tracking (Freigegeben/Abgelehnt)
- [x] Responsive Design

## Phase 5: Tests & Deployment
- [x] Vitest: Airtable-Service-Tests (Tabellen-IDs)
- [x] Vitest: Auth-Logout-Test
- [x] Checkpoint erstellen

## Geplante Erweiterungen (zukünftig)
- [x] Pauschalen-Seite (/pauschalen)
- [x] Service-Ressourcen-Seite (/ressourcen)
- [x] Dokumenten-Upload (S3)
- [x] Kommentar-Funktion für Freigaben
- [x] E-Mail-Benachrichtigungen
- [x] Export-Funktion (CSV/Excel)

## Bugfixes
- [x] Custom auth system implemented: UNAUTHORIZED-Fehler redirects to /login
- [x] getLoginUrl() aus const.ts entfernen / auf /login umleiten
- [x] main.tsx: redirectToLoginIfUnauthorized redirects to /login
- [x] Bug: Nach Dashboard-Datenladung wird User ausgeloggt – behoben durch localStorage + Authorization-Header statt Cookie

## Feature-Erweiterungen (Runde 2)
- [x] Umbenennung: "Mehrkosten" → "Aufträge" in Navigation, Überschriften und Routen
- [x] Mehrkosten nur in Auftrags-Detailansicht anzeigen (nicht als eigene Hauptseite)
- [x] Kalenderwochen-Sortierung und -Filterung in der Auftrags-Übersicht
- [x] Airtable-Caching: Daten zwischenspeichern, nicht bei jedem API-Aufruf neu laden
- [x] Admin-Einstellungen: Konfigurierbare Airtable-Sync-Häufigkeit
- [x] Admin-Einstellungen: Allgemeine App-Einstellungen (Cache leeren, Sync-Status, etc.)
- [x] Datenbankschema: settings-Tabelle für App-Konfiguration
- [x] Backend: Cache-Service mit TTL-Logik
- [x] Backend: Admin-Settings-Router (lesen/schreiben)

## Bugfixes (Runde 3)
- [x] Bug: Aufträge werden nicht mehr angezeigt – behoben durch MEDIUMTEXT-Migration und Auto-Sync
- [x] Bug: Fehlermeldung bei manueller Synchronisierung – behoben (MEDIUMTEXT + forceSync-Fehlerbehandlung)
- [x] Feature: Auto-Sync wenn Cache leer ist – implementiert (automatischer Fetch bei leerem Cache)

## Bugfixes (Runde 4)
- [x] Bug: Suche in der Auftragsübersicht – behoben durch serverseitige Filterung auf gecachten Daten
- [x] Feature: KW-Navigation mit Pfeil-Navigation (‹ KW › + Aktuelle KW Button + Datums-Range-Anzeige)

## Bugfixes (Runde 5)
- [x] Bug: Nur erste 100 Einträge – behoben: vollständige Paginierung (13.758 Einträge in 138 Seiten)
- [x] Bug: forceSync – behoben: Einzelzeilen-Speicherung in auftraege-Tabelle (kein Größenlimit)
- [x] Feature: Delta-Sync implementiert (filterByFormula auf Zuletzt geändert + 5 Min Puffer)

## Korrekturen Detailansicht (Runde 6)
- [x] "Amounts" aus technischen Details entfernen
- [x] "Amount" → "Anlagenwert" umbenannt (mit EUR-Formatierung)
- [x] Anzahl Module: Wert durch 100 dividiert (Airtable speichert ×100)
- [x] Rechnungsdaten: Hinweis "Keine Rechnungsdaten hinterlegt" wenn leer (kein Fehler, Daten fehlen in Airtable)
- [x] Freigeber anzeigen: Name + E-Mail aus "1. Prüfer"-Feld + Freigabe-Zeitpunkt
- [x] "Zählerzusammenlegung (ZZL)": Einheit entfernen, als Ja/Nein-Checkbox dargestellt

## Korrekturen (Runde 7)
- [x] 2. Prüfer in Freigabe-Sektion der Detailansicht anzeigen (Airtable-Feldname ermitteln)
- [x] Filter-Persistenz: Beim Zurücknavigieren aus Detailansicht bleiben Filter, Suche, KW und Seite erhalten
- [x] Auftragsübersicht: Standardmäßig nach Datum (neueste zuerst) sortiert

## Pauschalen-Seite (Runde 8)
- [x] Backend: pauschalen.list Endpunkt mit Filterung, Sortierung, Pagination (aus auftraege-Tabelle)
- [x] Backend: pauschalen.stats Endpunkt (Summen, Anzahl, HWP-Aufschlüsselung)
- [x] Frontend: Pauschalen-Seite (/pauschalen) mit Tabelle, Filter, Sortierung
- [x] Frontend: KPI-Karten (Gesamtpauschale, Anzahl Aufträge mit Pauschale, Ø Pauschale)
- [x] Frontend: HWP-Filter, Status-Filter, KW-Filter (wie Auftraege.tsx)
- [x] Frontend: URL-Query-Parameter für Filter-Persistenz
- [x] Routing: /pauschalen in App.tsx registrieren
- [x] Navigation: Pauschalen-Link bereits in DashboardLayout vorhanden (nur Route fehlt)

## Pauschalen-Neuimplementierung (Runde 9)
- [x] Airtable AKTUELLE_PAUSCHALEN Tabelle analysieren (alle Felder abrufen)
- [x] Backend: getPauschalen aus tblAWJS4XKLrv4Pd1 laden (alle Felder)
- [x] Backend: updatePauschale per Airtable PATCH API (Pauschalen-Wert ändern)
- [x] Frontend: Pauschalen-Seite zeigt HWP-Partner mit Pauschalen nach UV-Anzahl sortiert
- [x] Frontend: Inline-Bearbeitung der Pauschalen-Werte direkt in der Tabelle
- [x] Frontend: Speichern schreibt direkt in Airtable zurück

## Konditionen-Seite (Runde 10)
- [x] Frontend: Bearbeitungsfunktion entfernen (alle Edit-States, Mutations, Pencil-Buttons)
- [x] Frontend: Seite umbenennen zu "Konditionen" (Titel, Beschreibung)
- [x] Navigation: Sidebar-Link von "Pauschalen" zu "Konditionen" umbenennen
- [x] Backend: update-Endpunkt aus pauschalen-Router entfernen
- [x] Tests: pauschalen.test.ts auf reine Lesefunktionen reduzieren

## Runde 11
- [x] Konditionen: Zusatzvereinbarungen je Zeile ausklappbar anzeigen
- [x] Auftragsdetail: MVT-Link neben Salesforce-Link ergänzen (https://fulfilment.craftos.enpal.io/workorders/protocol/{DE-Nummer}/MVT)

## Runde 12 (Bugfixes)
- [x] Konditionen: Zusatzvereinbarungen leer – Platzhalter "-" als leer behandeln (Airtable-Verhalten)
- [x] Auftragsdetail: MVT-Link auf Order Number (DE-Nummer) umgestellt

## Runde 13
- [x] Auftragsdetail: IPA-Protokoll-Link ergänzen (https://buildability.craftos.enpal.tech/pv/{DE-Nummer}), nur wenn Module > 0

## Runde 14 – Dashboard-Überarbeitung
- [x] DB-Schema: Widget-Konfiguration als JSON in app_settings (DASHBOARD_WIDGETS_KEY)
- [x] Backend: dashboard.stats (KPIs: Aufträge, Mehrkosten, Status-Verteilung, Top-HWP)
- [x] Backend: dashboard.weeklyOrders (Aufträge der aktuellen KW, tagesgrupiert, navigierbar)
- [x] Backend: dashboard.search (Schnellsuche über alle Aufträge)
- [x] Backend: dashboard.getWidgetConfig / saveWidgetConfig
- [x] Frontend: Dashboard-Schnellsuche oben (live, Debounce, Ergebnisliste)
- [x] Frontend: Wochenbasierte Auftragsansicht mit KW-Navigation (< KW > + Heute)
- [x] Frontend: KPI-Widgets (Aufträge gesamt, Freigegeben, Abgelehnt, Ausstehend, Mehrkosten, Pauschalen)
- [x] Frontend: Status-Verteilung Widget (Balkendiagramm)
- [x] Frontend: Top-HWP-Partner Widget (nach Auftragsanzahl)
- [x] Frontend: Letzte Aktivitäten Widget
- [x] Admin-Einstellungen: Widget-Sichtbarkeit und Reihenfolge konfigurierbar (Sektion in /admin/settings)

## Runde 15 – Dashboard-Verbesserungen
- [x] Backend: dashboard.stats um period-Filter (week/month/all) erweitern
- [x] Frontend: KPI-Karten Zeitraum-Umschalter (Woche / Monat / Gesamt)
- [x] Frontend: Wochenansicht übersichtlicher (Tages-Gruppenheader, heute hervorheben, "Nach HWP" Umschalter)
- [x] Frontend: HWP-Auftragsverteilung Widget (alle Partner, Balkendiagramm, nach Zeitraum gefiltert)

## Mehrkosten-Modul (Runde 16)
- [x] HI Klassifizierung Base analysieren (TBK + nTBK Tabellen, Felder)
- [x] DB-Schema: mk_rechnungen, mk_positionen, mk_nachtraege
- [x] Backend: mkKlassifizierung.listKunden (TBK + nTBK, filterbar)
- [x] Backend: mkKlassifizierung.getRechnung / saveRechnung / submitNachtrag
- [x] Backend: mkKlassifizierung.approveNachtrag / rejectNachtrag
- [x] Backend: mkKlassifizierung.listNachtraege
- [x] Frontend: MkKlassifizierung.tsx – Kundenliste aus beiden Tabellen
- [x] Frontend: MkRechner.tsx – Mehrkostenrechner mit allen 25 Positionen
- [x] Frontend: UV-Auswahl mit automatischem Pauschalen-Abzug
- [x] Frontend: Summe ohne/mit Pauschale anzeigen
- [x] Frontend: Entwurf speichern / Nachtrag einreichen
- [x] Frontend: MkNachtraege.tsx – Freigabe-Übersicht für TOM/KAM
- [x] Navigation: MK-Links in Sidebar (Klassifizierung, Nachträge)

## Runde 17 (Bugfixes)
- [x] Bug: Klassifizieren-Button führt zu 404 – /mk-rechner/ auf /mk/rechner/ korrigiert

## Runde 18 (Bugfixes Rechner)
- [x] Bug: Pauschalen-Abzug rechnet falsch – Inklusivmengen müssen von eingegebener Menge abgezogen werden (nicht addiert)
- [x] Bug: Materialien in Pauschale werden nicht aus Gesamtkosten herausgerechnet
- [x] Feature: HWP-Auswahl in Klassifizierung (damit HWP-spezifische Pauschale geladen wird)
- [x] Feature: HWP-Auswahl im Rechner anzeigen und Pauschale je HWP dynamisch laden

## Runde 19
- [x] MkRechner: "Gesamt ohne Pauschale" aus Zusammenfassung entfernen
- [x] Auftragsübersicht: Spalten sortierbar machen (klickbare Spaltenköpfe)
- [x] MkRechner: Zurück-Button reparieren (navigiert nicht korrekt zurück)

## Runde 20 – HWP-Ansicht
- [x] Backend: hwp.meineAuftraege – eigene Aufträge nach airtableAccountId gefiltert, mit KW-Navigation, joiniert mit mk_rechnungen (wenn Order Number übereinstimmt)
- [x] Backend: hwp.auftragDetail – einzelner Auftrag mit vollständiger Mehrkosten-Rechnung und Positionen
- [x] Frontend: HwpDashboard.tsx – KW-Übersicht mit eigenen Aufträgen + Mehrkosten-Badge
- [x] Frontend: HwpAuftragDetail.tsx – Detailansicht mit Mehrkosten-Rechnung (read-only für HWP)
- [x] Navigation: HWP-spezifische Sidebar-Links (Meine Aufträge, Meine Mehrkosten)
- [x] Routing: /hwp/auftraege und /hwp/auftraege/:id in App.tsx registrieren
- [x] Dashboard: HWP sieht nach Login direkt seine KW-Übersicht statt des allgemeinen Dashboards

## Runde 21 – Nachtrag-Einreichung + Airtable-Lookup
- [x] Backend: hwp.submitNachtrag – HWP kann Nachtrag direkt aus Detailansicht einreichen (nutzt bestehenden mkKlassifizierung.submitNachtrag)
- [x] Backend: admin.lookupAirtableAccounts – Airtable-Accounts laden für Account-ID-Lookup
- [x] Frontend: HwpAuftragDetail – "Nachtrag einreichen"-Dialog mit Positionen, Mengen und Kommentar
- [x] Frontend: AdminUsers – Airtable-Account-ID-Lookup-Button neben dem Eingabefeld
- [x] Tests für neue Endpunkte

## Runde 22 – Nachtrag-Freigabe
- [x] Backend: mkKlassifizierung.approveNachtrag – TOM/KAM gibt Nachtrag frei (mit freigegebenem Betrag + Kommentar)
- [x] Backend: mkKlassifizierung.rejectNachtrag – TOM/KAM lehnt Nachtrag ab (mit Kommentar)
- [x] Frontend: MkNachtraege – Freigabe-Dialog (Betrag anpassbar) und Ablehnungs-Dialog (Kommentar)
- [x] Frontend: MkNachtraege – Status-Badges und Aktionsbuttons je Nachtrag-Status
- [x] Tests für approveNachtrag und rejectNachtrag

## Runde 23 – Account-Lookup Bug + Caching-System
- [x] Bug: Airtable-Account-Lookup im Admin zeigt keine HWPs – Endpunkt debuggen
- [x] Feature: Caching-System – alle Airtable-Daten (Aufträge, Kunden, Pauschalen, HWP-Accounts) werden gecacht
- [x] Feature: Admin-Einstellungsseite – konfigurierbares Sync-Intervall (z.B. alle 15/30/60 Min)
- [x] Feature: Manueller "Jetzt synchronisieren"-Button in den Einstellungen
- [x] Feature: Sync-Status anzeigen (letzter Sync, nächster Sync, Anzahl gecachter Datensätze)
- [x] Alle Airtable-Abfragen auf Cache umstellen um API-Zugriffe zu sparen

## Runde 24 – MK-Klassifizierung Sortierung & Filter
- [x] MkKlassifizierung: Spaltenköpfe klickbar sortierbar (Kunde, Auftragsnr., Status, Datum)
- [x] MkKlassifizierung: Freitextsuche (Kunde, Auftragsnr.)
- [x] MkKlassifizierung: Status-Filter (alle / Entwurf / Eingereicht / Freigegeben / Abgelehnt)
- [x] MkKlassifizierung: Quelle-Filter (alle / TBK / nTBK)

## Runde 25 – KAM/TOM–HWP-Zuordnung + Dokumentation
- [x] DB: Tabelle user_hwp_assignments (userId, hwpAccountId, hwpName)
- [x] Backend: admin.setUserHwpAssignments – HWP-Liste für einen Nutzer setzen
- [x] Backend: admin.getUserHwpAssignments – HWP-Liste eines Nutzers laden
- [x] Backend: Auftragsübersicht filtert nach zugeordneten HWPs (für KAM/TOM)
- [x] Frontend: AdminSettings – HWP-Zuordnung pro KAM/TOM (Mehrfachauswahl)
- [x] Frontend: Auftragsübersicht – Mehrfach-HWP-Filter (Checkboxen/Combobox)
- [x] Tests für HWP-Zuordnungslogik
- [x] Vollständige technische Dokumentation als PDF

## Runde 26 – Auftragsübersicht Korrekturen
- [x] Bug: HWP-Filter zeigt keine Ergebnisse wenn KW-Filter deaktiviert ist
- [x] Feature: Menüpunkt "HWP-Ressourcen" aus Sidebar entfernen
- [x] Feature: Mehrfach-Status-Filter (mehrere Status gleichzeitig auswählbar)

## Runde 27 – Kunden-Bug MK-Klassifizierung
- [x] Bug: Kunden in MK-Klassifizierung werden nicht mehr angezeigt

## Runde 28 – Globaler Fehler-Handler
- [x] Globaler tRPC-Fehler-Handler mit Toast-Benachrichtigungen (BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, INTERNAL_SERVER_ERROR)
- [x] Deutsche, lesbare Fehlermeldungen je Fehlertyp
- [x] Bekannte Fehler (z.B. pageSize-Validierung) werden verständlich übersetzt
- [x] Mutations-Fehler werden ebenfalls abgefangen

## Runde 29 – pageSize-Limits
-- [x] Bug: pageSize-Limit in allen Endpunkten auf 1000 erhöhen (Nachräge, Kunden, Aufträge)

## Runde 30 – Entwurf löschen + Rechner-Layout
- [x] Feature: Entwürfe in MK-Klassifizierung löschbar machen (mit Bestätigungs-Dialog)
- [x] Backend: deleteRechnung-Endpunkt (nur Entwürfe, nicht freigegebene)
- [x] Bug: Positionszeilen-Layout im Rechner – Preis links vom Eingabefeld, bündig ausgerichtet

## Runde 31 – Mobile Ansicht
- [x] DashboardLayout: Mobile Hamburger-Menü + Slide-in Drawer Sidebar
- [x] DashboardLayout: Mobile Header mit Titel und Menü-Button
- [x] Auftraege.tsx: Tabelle → Card-Liste auf Mobile
- [x] MkKlassifizierung.tsx: Tabelle → Card-Liste auf Mobile
- [x] MkRechner.tsx: Einspaltig auf Mobile, Zusammenfassung als Sticky-Footer
- [x] MkNachträge.tsx: Cards auf Mobile, Dialog-Optimierungg
- [x] HwpDashboard.tsx: KW-Navigation mobile-freundlich
- [x] HwpAuftragDetail.tsx: Positionen-Tabelle → Cards auf Mobile
- [x] AdminUsers.tsx: Tabelle → Cards auf Mobile
- [x] AdminSettings.tsx: Formulare mobile-freundlich
- [x] AuftragDetail.tsx: Mobile-Layout
- [x] Login.tsx: Mobile-Check
- [x] Pauschalen.tsx: Mobile-Check

## Runde 32 – FORBIDDEN-Toast Bug
- [x] Bug: Nach KAM-Login erscheint dauerhaft "Keine Berechtigung" Toast – FORBIDDEN-Query identifizieren und beheben

## Runde 33 – Team-Verwaltung
- [x] DB: Tabelle `teams` anlegen (id, name, beschreibung, erstellt_am)
- [x] DB: Tabelle `team_mitglieder` anlegen (team_id, user_id, rolle: KAM|TOM)
- [x] DB: Tabelle `team_hwp_zuordnungen` anlegen (team_id, hwp_airtable_id, hwp_name)
- [x] Backend: teams.router.ts mit CRUD (list, create, update, delete)
- [x] Backend: team-Mitglieder hinzufügen/entfernen (addMember, removeMember)
- [x] Backend: HWP-Zuordnungen für Teams verwalten (setHwpAssignments)
- [x] Backend: KAM/TOM-Filterung auf Team-Zuordnungen berücksichtigen
- [x] Frontend: Teams.tsx – Übersichtsseite mit Team-Liste und Karten
- [x] Frontend: Team-Dialog – anlegen/bearbeiten mit Name, KAM/TOM-Auswahl, HWP-Auswahl
- [x] Frontend: Menüpunkt "Teams" im Hauptmenü (Admin/KAM/TOM sichtbar)
- [x] Frontend: Routing in App.tsx eintragen
- [x] Tests: teams.router.test.ts schreiben

## Runde 34 – Team-Filter & Klassifizierungsdetails
- [x] Airtable [HI] ACH Klassi Overview Felder erkunden
- [x] Backend: Klassifizierungsdaten per Airtable-ID laden (hwp.router.ts)
- [x] Backend: Team-Filter-Logik in Auftragsabfrage integrieren
- [x] Frontend: Team-Filter-Dropdown in Auftragsübersicht (Auftraege.tsx)
- [x] Frontend: Klassifizierungsblock in Detailansicht (AuftragDetail.tsx)
- [x] Tests aktualisieren (klassi_teamfilter.test.ts, 6 neue Tests)

## Runde 35 – Cache, Team-Filter Nachträge, Klassi-Status-Spalte
- [x] Backend: Klassifizierungsdaten cachen (TTL 30 Min, Key = Order Number)
- [x] Backend: getKlassifizierung nutzt Cache statt direkten Airtable-Aufruf
- [x] Backend: mkKlassifizierung.listNachtraege – teamFilter-Parameter hinzufügen
- [x] Backend: Nachträge nach Team-HWPs filtern (wie mehrkosten.list)
- [x] Frontend: MkNachtraege.tsx – Team-Filter-Dropdown ergänzen
- [x] Backend: mehrkosten.list – klassiStatus-Feld je Auftrag mitliefern (aus Klassi-Cache)
- [x] Frontend: Auftraege.tsx – Klassifizierungsstatus-Spalte (Icon/Badge)
- [x] Tests: Cache-Logik, Team-Filter Nachträge, Klassi-Status-Spalte

## Runde 36 – Wochenplanung / Baustellenvorbereitung

- [x] Klassi-Link aus AuftragDetail.tsx entfernen
- [x] Airtable MVT-Felder erkunden (MVT = PDF-Link, kein eigenes Airtable-Feld)
- [x] Backend: wochenplanung.getByHwpAndKW Endpunkt (Aufträge + Klassi + MVTs)
- [x] Frontend: Wochenplanung-Seite mit HWP-Auswahl und KW-Navigation
- [x] Frontend: Exportfunktion (Drucken/Exportieren via window.print)
- [x] Menüpunkt "Wochenplanung" in der Sidebar
- [x] Tests schreiben (wochenplanung.test.ts, 10 Tests)

## Runde 37 – Wochenplanung Bugfixes

- [x] Bug: Kein Zurück-Button / Sidebar fehlt – DashboardLayout einbinden
- [x] Bug: PDF-Export zeigt nur einen Auftrag – page-break-inside: avoid entfernen / print-Styles korrigieren
- [x] Feature: Hinweis-Feld (Freitext) pro Wochenplanung hinzufügen
- [x] Bug: SF- und MVT-Links im PDF ausblenden (nur in Screen-Ansicht zeigen)

## Runde 38 – Hinweis pro Auftragskarte

- [x] Feature: Hinweis-Feld pro Auftragskarte (unterhalb ACH-Klassifizierung, editierbar, im Druck sichtbar)

## Runde 39 – Export-Ausblenden

- [x] Feature: Auftrag komplett aus Export ausblenden (Toggle pro Karte)
- [x] Feature: Einzelne Info-Blöcke pro Auftrag ausblenden (Klassi, Meta-Infos, Links)

## Runde 41 – HWP Selbstständige Mehrkostenanträge
- [x] Backend: auth.registerHwp – öffentlicher Registrierungs-Endpunkt für HWP-Partner
- [x] Backend: hwp.createMkAntrag – HWP legt mkRechnung an und reicht Nachtrag ein
- [x] Backend: hwp.getPauschale – Pauschale für HWP und UV-Anzahl laden
- [x] Frontend: Register.tsx – öffentliche Registrierungsseite für HWPs
- [x] Frontend: Login.tsx – Link zur Registrierungsseite ergänzen
- [x] Frontend: HwpAuftragDetail.tsx – "Mehrkosten beantragen"-Button wenn keine Rechnung vorhanden
- [x] Frontend: HwpMkAntragDialog.tsx – Dialog für neuen Mehrkosten-Antrag (UV-Anzahl, Positionen, Kommentar)
- [x] Tests: hwp-antrag.test.ts

## Runde 42 – Bereinigungen & Erweiterungen
- [x] Login: Registrierungslink entfernen
- [x] Überall: "HWP-Partner" → "Handwerkspartner" umbenennen
- [x] HWP-Ansicht: Pauschale automatisch laden und anzeigen
- [x] MK-Rechner: optionales Zusatzfeld (Bezeichnung, Menge, Wert)
- [x] HWP-Detailansicht: Klassi-Block einbauen

## Runde 43 – HwpMkAntragDialog Pauschale & Material
- [x] HwpMkAntragDialog: Pauschale direkt per getPauschaleForHwp laden (kein Hinweis mehr)
- [x] HwpMkAntragDialog: Pauschale sofort in Gesamtsumme einrechnen
- [x] HwpMkAntragDialog: Optionales Material-Feld vollwertig (Bezeichnung, Menge, Preis je Zeile, Summe)
- [x] createMkAntrag Backend: Freitext-Positionen mit Bezeichnung/Menge/Preis korrekt speichern

## Runde 44 – Umbenennung & localStorage-Entwurf
- [x] UI-Text: "MK Nachträge" → "MK Anträge" in Menü, Seiten, Labels
- [x] UI-Text: "Nachtrag" → "Antrag" in allen sichtbaren Texten (nicht DB-Felder)
- [x] localStorage-Entwurf pro Auftrag im HwpMkAntragDialog (uvAnzahl, mengen, freitextPositionen, kommentar)
- [x] Entwurf beim Öffnen wiederherstellen, beim Einreichen/Zurücksetzen löschen
## Runde 45 – Admin-Löschfunktion für MK-Anträge
- [x] Backend: deleteRechnung – Admin kann alle Status löschen (nicht nur Entwürfe), mkNachtraege kaskadierend löschen
- [x] Frontend: MkNachtraege.tsx – Lösch-Button für Admin bei allen Antragsstatus
- [x] Frontend: trpc.mkKlassifizierung.deleteRechnung (korrekter Router-Pfad)
- [x] Tests: 87 Tests grün
## Runde 46 – HWP-Ansicht in AuftragDetail.tsx
- [ ] AuftragDetail.tsx: useAuth einbinden, für HWP externe Links (Salesforce, MVT, IPA, SF Case) ausblenden
- [ ] AuftragDetail.tsx: für HWP "Mehrkosten beantragen"-Button einblenden (mit HwpMkAntragDialog)
- [ ] AuftragDetail.tsx: für HWP interne Felder (Freigabe-Details, Prüfer, Kommentare) ausblenden

## Runde 46 – HWP-Ansicht in AuftragDetail.tsx
- [x] AuftragDetail.tsx: Externe Links (Salesforce, MVT, IPA, SF Case) für HWP ausblenden
- [x] AuftragDetail.tsx: "Mehrkosten beantragen"-Button für HWP einblenden (HwpMkAntragDialog)
- [x] AuftragDetail.tsx: Freigabe-Details (Prüfer, Kommentare, 2-stufige Freigabe) für HWP ausblenden
- [x] AuftragDetail.tsx: ACH-Klassifizierung für HWP ausblenden

## Runde 47 – Detailansicht-Bug + Auftragssuche
- [ ] Bug: AuftragDetail.tsx – JSON.parse Fehler beheben (fieldsJson korrupt oder leer)
- [ ] Feature: Auftragsübersicht – Freitextsuche über alle Aufträge (Opportunity Name, Order Number, Appointment Number, HWP)

## Runde 48 – PDF-Export Fix
- [x] Bug: PDF-Export erzeugte leere Seite 2 (pdfkit footerY > page.maxY() → neue Seite)
- [x] Fix: footerY = page.maxY() - 15 (innerhalb Inhaltsbereich), bufferPages: true, bottom: 35
- [x] Fix: Spalten korrekt ausgerichtet (Position, Einheit, Menge, Einzelpr., Gesamt)
- [x] Fix: Pauschalen-Zeile mit UV-Anzahl und Abzug
- [x] Fix: Summenblock rechtsbündig mit Gesamtbetrag-Highlight

## Runde 49 – MK-Anträge HWP-Bearbeitung + Pauschalen-Bug
- [ ] Bug: Pauschale für Rabofsky wird in HwpMkAntragDialog nicht geladen (getPauschaleForHwp prüfen)
- [ ] Feature: HWP kann ausstehende MK-Anträge in der MK-Anträge-Ansicht bearbeiten (Bearbeiten-Button)

## Runde 49 – MK-Anträge HWP
- [x] Bug: Pauschale wird nicht geladen wenn Cache leer ist (nach Server-Neustart) – getPauschaleForHwp lädt jetzt direkt aus Airtable wenn Cache fehlt
- [x] Feature: Bearbeiten-Button in HWP MK-Anträge-Ansicht für ausstehende Anträge (Status = offen)

## Runde 50 – PDF Preisfehler
- [x] Bug: PDF zeigt Preise als Cent-Werte (14,00 € statt 1.400 €) – euro()-Funktion dividierte fälschlicherweise durch 100, Werte sind bereits in Euro

## Runde 51 – Pauschalen-Bug dauerhaft beheben
- [x] Bug: "Keine Pauschale hinterlegt" – Ursache: Portal speichert "Rabofsky", Airtable hat "Karl Rabofsky GmbH". Fix: Matching primär auf Airtable Account-ID (0019Y000005cQ2NQAU) umgestellt, Fallback auf Namens-Matching und Enthält-Suche

## Runde 52 – HWP MK-Anträge: PDF-Download + Pauschalen-Anzeige
- [x] Feature: PDF-Download-Button in der HWP MK-Anträge-Übersicht (für HWP + Reviewer)
- [x] Feature: Pauschale (UV-Anzahl + Betrag) in der Summen-Übersicht anzeigen (rot bei Abzug, grau bei fehlender Pauschale)

## Runde 53 – Pauschalen-Logik umkehren (addieren statt abziehen)
- [x] Analyse: Berechnungsformel war korrekt (summeMitPauschale = summeOhnePauschale - pauschaleSumme + pauschaleBetrag); nur Anzeige war falsch
- [x] Fix: Frontend MkNachtraege.tsx: Pauschalen-Zeile jetzt grün + statt rot –
- [x] Fix: PDF-Export: Pauschalen-Zeile als "+ 1.900 €" (grün), Summenblock zeigt "Netto-Material" und "+ Pauschale (3 UV)"
- [x] Fix: PDF Pauschalen-Beschreibung: "Aufwandspauschale für X UV (inkl. Anfahrt, Montage, Materiallogistik)"

## Runde 54 – Netto-Materialwert in MK-Übersicht und PDF
- [x] Feature: Materialwert auf Netto umgestellt: nettoMaterial = summeMitPauschale - pauschaleBetrag (kein DB-Schema-Änderung nötig)
- [x] Fix: Frontend MkNachtraege.tsx: "Netto-Material (exkl. enthalten)" mit korrektem Wert
- [x] Fix: PDF-Export: "Netto-Material" zeigt tatsächlich berechneten Betrag (ohne enthaltene Positionen)

## Runde 55 – Dreistufige Sync-Strategie für Wochenplanung
- [x] Stufe 1: DEFAULT_TTL_MINUTES von 60 auf 15 Minuten reduziert (server/cache.ts)
- [x] Stufe 2: scheduleEveningPrefetch() in server/_core/index.ts – deltaSync täglich um 18:00 Uhr
- [x] Stufe 3: "Jetzt aktualisieren"-Button in Wochenplanung.tsx mit bypassCache + RefreshCw-Icon + Toast
