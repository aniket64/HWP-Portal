import {
  boolean,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

// ─── Rollen ───────────────────────────────────────────────────────────────────
export const roleEnum = pgEnum("role", ["admin", "hwp", "tom", "kam", "tl"]);

// ─── Berechtigungen (JSON-Objekt pro Rolle) ───────────────────────────────────
// Wird in der permissions-Tabelle gespeichert und kann vom Admin angepasst werden
export type PermissionSet = {
  viewMehrkosten: boolean;
  editMehrkosten: boolean;
  approveMehrkosten: boolean;
  viewAllHWP: boolean;
  viewOwnHWP: boolean;
  manageUsers: boolean;
  manageRoles: boolean;
  viewInvoices: boolean;
  uploadDocuments: boolean;
  viewReports: boolean;
};

export const defaultPermissions: Record<string, PermissionSet> = {
  admin: {
    viewMehrkosten: true,
    editMehrkosten: true,
    approveMehrkosten: true,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: true,
    manageRoles: true,
    viewInvoices: true,
    uploadDocuments: true,
    viewReports: true,
  },
  tom: {
    viewMehrkosten: true,
    editMehrkosten: true,
    approveMehrkosten: true,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: true,
    uploadDocuments: true,
    viewReports: true,
  },
  kam: {
    viewMehrkosten: true,
    editMehrkosten: false,
    approveMehrkosten: true,
    viewAllHWP: true,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: true,
    uploadDocuments: false,
    viewReports: true,
  },
  tl: {
    viewMehrkosten: true,
    editMehrkosten: false,
    approveMehrkosten: false,
    viewAllHWP: false,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: false,
    uploadDocuments: false,
    viewReports: false,
  },
  hwp: {
    viewMehrkosten: true,
    editMehrkosten: false,
    approveMehrkosten: false,
    viewAllHWP: false,
    viewOwnHWP: true,
    manageUsers: false,
    manageRoles: false,
    viewInvoices: true,
    uploadDocuments: true,
    viewReports: false,
  },
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull().default("hwp"),
  // Für HWP: Verknüpfung mit Airtable Account ID
  airtableAccountId: varchar("airtableAccountId", { length: 64 }),
  // Für HWP: Firmenname
  companyName: varchar("companyName", { length: 255 }),
  isActive: boolean("isActive").notNull().default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── Rollen-Berechtigungen (anpassbar durch Admin) ───────────────────────────
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  role: roleEnum("role").notNull().unique(),
  permissions: json("permissions").notNull().$type<PermissionSet>(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  updatedBy: integer("updatedBy"),
});

export type RolePermission = typeof rolePermissions.$inferSelect;

// ─── App-Einstellungen ───────────────────────────────────────────────────────
export const appSettings = pgTable("app_settings", {
  key: varchar("key", { length: 128 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  updatedBy: integer("updatedBy"),
});

export type AppSetting = typeof appSettings.$inferSelect;

// ─── Airtable Cache (für kleine Objekte: Stats, Pauschalen, etc.) ─────────────
export const airtableCache = pgTable("airtable_cache", {
  cacheKey: varchar("cacheKey", { length: 255 }).primaryKey(),
  data: text("data").notNull(),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export type AirtableCache = typeof airtableCache.$inferSelect;

// ─── Aufträge (einzelne Airtable-Datensätze, skalierbar) ─────────────────────
// Jeder Airtable-Datensatz bekommt eine eigene Zeile – kein Größenlimit-Problem
export const auftraege = pgTable("auftraege", {
  airtableId: varchar("airtableId", { length: 64 }).primaryKey(),
  // Wichtige Felder für Filterung/Sortierung (indiziert)
  opportunityName: text("opportunityName"),
  appointmentNumber: varchar("appointmentNumber", { length: 64 }),
  orderNumber: varchar("orderNumber", { length: 64 }),
  technicianName: text("technicianName"),
  technicianAccountName: text("technicianAccountName"),
  technicianAccountId: varchar("technicianAccountId", { length: 64 }),
  status: varchar("status", { length: 64 }),
  statusFreigabe: varchar("statusFreigabe", { length: 64 }),
  mehrkosten: text("mehrkosten"),   // als String gespeichert um NULL zu vermeiden
  pauschale: text("pauschale"),
  createdDate: varchar("createdDate", { length: 32 }),
  lastScheduledEnd: varchar("lastScheduledEnd", { length: 32 }),
  targetEnd: varchar("targetEnd", { length: 32 }),
  // Vollständige Felder als JSON
  fieldsJson: text("fieldsJson").notNull(),
  // Sync-Metadaten
  airtableCreatedTime: varchar("airtableCreatedTime", { length: 64 }),
  zuletzt_geaendert: varchar("zuletzt_geaendert", { length: 64 }),
  syncedAt: timestamp("syncedAt").defaultNow().notNull(),
});

export type Auftrag = typeof auftraege.$inferSelect;
export type InsertAuftrag = typeof auftraege.$inferInsert;

// ─── Dashboard Widget Config (als JSON in app_settings gespeichert) ─────────
export type WidgetId =
  | "kpi_total"
  | "kpi_freigegeben"
  | "kpi_abgelehnt"
  | "kpi_ausstehend"
  | "kpi_mehrkosten"
  | "kpi_pauschalen"
  | "weekly_orders"
  | "status_chart"
  | "top_hwp"
  | "recent_activity";

export type WidgetConfig = {
  id: WidgetId;
  label: string;
  enabled: boolean;
  order: number;
};

export const DEFAULT_WIDGET_CONFIG: WidgetConfig[] = [
  { id: "kpi_total",       label: "Gesamt Aufträge",    enabled: true,  order: 1 },
  { id: "kpi_freigegeben", label: "Freigegeben",         enabled: true,  order: 2 },
  { id: "kpi_abgelehnt",   label: "Abgelehnt",           enabled: true,  order: 3 },
  { id: "kpi_ausstehend",  label: "Ausstehend",          enabled: true,  order: 4 },
  { id: "kpi_mehrkosten",  label: "Gesamt Mehrkosten",   enabled: true,  order: 5 },
  { id: "kpi_pauschalen",  label: "Gesamt Pauschalen",   enabled: true,  order: 6 },
  { id: "weekly_orders",   label: "Wochenansicht",       enabled: true,  order: 7 },
  { id: "status_chart",    label: "Status-Verteilung",   enabled: true,  order: 8 },
  { id: "top_hwp",         label: "Top HWP-Partner",     enabled: true,  order: 9 },
  { id: "recent_activity", label: "Letzte Aktivitäten",  enabled: true,  order: 10 },
];

export const DASHBOARD_WIDGETS_KEY = "dashboard_widget_config";

// ─── Mehrkosten-Modul ───────────────────────────────────────────────────────

// Status einer Mehrkosten-Rechnung
export const mkRechnungStatusEnum = pgEnum("mk_rechnung_status", [
  "entwurf",        // TOM arbeitet noch daran
  "abgeschlossen",  // TOM hat klassifiziert, wartet auf Terminierung
  "terminiert",     // Kunde wurde terminiert + HWP zugewiesen
  "nachtrag",       // HWP hat Nachtrag eingereicht
  "freigegeben",    // TOM/KAM hat Nachtrag freigegeben
  "abgelehnt",      // TOM/KAM hat Nachtrag abgelehnt
]);

// Eine Mehrkosten-Rechnung pro Auftrag (Order Number)
export const mkRechnungen = pgTable("mk_rechnungen", {
  id: serial("id").primaryKey(),
  orderNumber: varchar("orderNumber", { length: 64 }).notNull(),
  // Verknüpfung mit Airtable-Datensatz (aus HI Klassifizierung)
  airtableAppointmentsId: varchar("airtableAppointmentsId", { length: 64 }),
  // Kundendaten (aus Airtable gecacht)
  kundenName: varchar("kundenName", { length: 255 }),
  hwpName: varchar("hwpName", { length: 255 }),
  hwpAccountId: varchar("hwpAccountId", { length: 64 }),
  // UV-Anzahl (bestimmt Pauschale und Pauschalen-Abzug)
  uvAnzahl: integer("uvAnzahl").notNull().default(1),
  // Pauschale (automatisch aus UV-Anzahl + HWP-Konditionen berechnet)
  pauschaleBetrag: integer("pauschaleBetrag").notNull().default(0),
  // Berechnete Summen (in Cent, um Floating-Point-Fehler zu vermeiden)
  summeOhnePauschale: integer("summeOhnePauschale").notNull().default(0),
  summeMitPauschale: integer("summeMitPauschale").notNull().default(0),
  // Workflow-Status
  status: mkRechnungStatusEnum("status").notNull().default("entwurf"),
  // Wer hat die Klassifizierung erstellt
  erstelltVon: integer("erstelltVon").notNull(),
  erstelltVonName: varchar("erstelltVonName", { length: 255 }),
  // Zeitstempel
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type MkRechnung = typeof mkRechnungen.$inferSelect;
export type InsertMkRechnung = typeof mkRechnungen.$inferInsert;

// Einzelne Positionen einer Mehrkosten-Rechnung
export const mkPositionen = pgTable("mk_positionen", {
  id: serial("id").primaryKey(),
  rechnungId: integer("rechnungId").notNull(),
  // Positions-Typ (aus dem Katalog)
  positionKey: varchar("positionKey", { length: 64 }).notNull(),
  positionLabel: varchar("positionLabel", { length: 255 }).notNull(),
  einheit: varchar("einheit", { length: 32 }).notNull(), // "Meter" oder "Menge"
  einzelpreis: integer("einzelpreis").notNull(), // in Cent
  menge: integer("menge").notNull().default(0),
  // Ist diese Position durch die Pauschale abgedeckt?
  inPauschaleEnthalten: boolean("inPauschaleEnthalten").notNull().default(false),
  // Menge die durch Pauschale abgedeckt ist
  pauschaleMenge: integer("pauschaleMenge").notNull().default(0),
  // Netto-Menge (menge - pauschaleMenge, mindestens 0)
  nettomenge: integer("nettomenge").notNull().default(0),
  gesamtpreis: integer("gesamtpreis").notNull().default(0), // nettomenge * einzelpreis
  // Quelle: "klassifizierung" (TOM) oder "nachtrag" (HWP)
  quelle: varchar("quelle", { length: 32 }).notNull().default("klassifizierung"),
  // Freitext-Position (nicht aus dem Katalog, vom Nutzer frei eingegeben)
  isFreitext: boolean("isFreitext").notNull().default(false),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MkPosition = typeof mkPositionen.$inferSelect;
export type InsertMkPosition = typeof mkPositionen.$inferInsert;

// Nachträge (HWP reicht ein, TOM/KAM prüft)
const nachtragStatusEnum = pgEnum("nachtrag_status", ["offen", "freigegeben", "abgelehnt"]);

export const mkNachtraege = pgTable("mk_nachtraege", {
  id: serial("id").primaryKey(),
  rechnungId: integer("rechnungId").notNull(),
  // Wer hat den Nachtrag eingereicht
  eingereichtVon: integer("eingereichtVon").notNull(),
  eingereichtVonName: varchar("eingereichtVonName", { length: 255 }),
  eingereichtAt: timestamp("eingereichtAt").defaultNow().notNull(),
  // Summe des Nachtrags
  summeOhnePauschale: integer("summeOhnePauschale").notNull().default(0),
  summeMitPauschale: integer("summeMitPauschale").notNull().default(0),
  // Kommentar des HWP
  hwpKommentar: text("hwpKommentar"),
  // Freigabe-Status
  status: nachtragStatusEnum("status").notNull().default("offen"),
  // Wer hat geprüft
  geprueftVon: integer("geprueftVon"),
  geprueftVonName: varchar("geprueftVonName", { length: 255 }),
  geprueftAt: timestamp("geprueftAt"),
  // Kommentar des Prüfers
  prueferKommentar: text("prueferKommentar"),
  // Freigegebener Betrag (kann vom beantragten abweichen)
  freigegebenerBetrag: integer("freigegebenerBetrag"),
});

export type MkNachtrag = typeof mkNachtraege.$inferSelect;
export type InsertMkNachtrag = typeof mkNachtraege.$inferInsert;

// ─── KAM/TOM–HWP-Zuordnungen ────────────────────────────────────────────────
// Welche HWP-Partner sind einem KAM/TOM zugeordnet?
export const userHwpAssignments = pgTable("user_hwp_assignments", {
  id: serial("id").primaryKey(),
  // Der KAM/TOM-Nutzer
  userId: integer("userId").notNull(),
  // Airtable Account ID des HWP (aus auftraege.technicianAccountId)
  hwpAccountId: varchar("hwpAccountId", { length: 64 }).notNull(),
  // Anzeigename des HWP (gecacht für schnelle Anzeige)
  hwpName: varchar("hwpName", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserHwpAssignment = typeof userHwpAssignments.$inferSelect;
export type InsertUserHwpAssignment = typeof userHwpAssignments.$inferInsert;

// ─── Teams ───────────────────────────────────────────────────────────────────
// Ein Team besteht aus KAM/TOM-Mitgliedern und zugeordneten HWP-Partnern
export const teams = pgTable("teams", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  beschreibung: text("beschreibung"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  createdBy: integer("createdBy"),
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

// Mitglieder eines Teams (KAM oder TOM)
const teamRolleEnum = pgEnum("team_rolle", ["kam", "tom", "tl"]);

export const teamMitglieder = pgTable("team_mitglieder", {
  id: serial("id").primaryKey(),
  teamId: integer("teamId").notNull(),
  userId: integer("userId").notNull(),
  // Rolle des Mitglieds im Team (zur Anzeige, nicht zur Berechtigungsprüfung)
  teamRolle: teamRolleEnum("teamRolle").notNull().default("tom"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamMitglied = typeof teamMitglieder.$inferSelect;
export type InsertTeamMitglied = typeof teamMitglieder.$inferInsert;

// HWP-Partner die einem Team zugeordnet sind
export const teamHwpZuordnungen = pgTable("team_hwp_zuordnungen", {
  id: serial("id").primaryKey(),
  teamId: integer("teamId").notNull(),
  hwpAccountId: varchar("hwpAccountId", { length: 64 }).notNull(),
  hwpName: varchar("hwpName", { length: 255 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type TeamHwpZuordnung = typeof teamHwpZuordnungen.$inferSelect;
export type InsertTeamHwpZuordnung = typeof teamHwpZuordnungen.$inferInsert;

// ─── Audit Log (für Admin-Aktionen) ──────────────────────────────────────────
export const auditLog = pgTable("audit_log", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  action: varchar("action", { length: 128 }).notNull(),
  targetType: varchar("targetType", { length: 64 }),
  targetId: varchar("targetId", { length: 64 }),
  details: json("details"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
