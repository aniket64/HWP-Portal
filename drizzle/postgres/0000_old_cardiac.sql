CREATE TYPE "public"."mk_rechnung_status" AS ENUM('entwurf', 'abgeschlossen', 'terminiert', 'nachtrag', 'freigegeben', 'abgelehnt');--> statement-breakpoint
CREATE TYPE "public"."nachtrag_status" AS ENUM('offen', 'freigegeben', 'abgelehnt');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('admin', 'hwp', 'tom', 'kam', 'tl');--> statement-breakpoint
CREATE TYPE "public"."team_rolle" AS ENUM('kam', 'tom', 'tl');--> statement-breakpoint
CREATE TABLE "airtable_cache" (
	"cacheKey" varchar(255) PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"fetchedAt" timestamp DEFAULT now() NOT NULL,
	"expiresAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" varchar(128) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedBy" integer
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"action" varchar(128) NOT NULL,
	"targetType" varchar(64),
	"targetId" varchar(64),
	"details" json,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auftraege" (
	"airtableId" varchar(64) PRIMARY KEY NOT NULL,
	"opportunityName" text,
	"appointmentNumber" varchar(64),
	"orderNumber" varchar(64),
	"technicianName" text,
	"technicianAccountName" text,
	"technicianAccountId" varchar(64),
	"status" varchar(64),
	"statusFreigabe" varchar(64),
	"mehrkosten" text,
	"pauschale" text,
	"createdDate" varchar(32),
	"lastScheduledEnd" varchar(32),
	"targetEnd" varchar(32),
	"fieldsJson" text NOT NULL,
	"airtableCreatedTime" varchar(64),
	"zuletzt_geaendert" varchar(64),
	"syncedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mk_nachtraege" (
	"id" serial PRIMARY KEY NOT NULL,
	"rechnungId" integer NOT NULL,
	"eingereichtVon" integer NOT NULL,
	"eingereichtVonName" varchar(255),
	"eingereichtAt" timestamp DEFAULT now() NOT NULL,
	"summeOhnePauschale" integer DEFAULT 0 NOT NULL,
	"summeMitPauschale" integer DEFAULT 0 NOT NULL,
	"hwpKommentar" text,
	"status" "nachtrag_status" DEFAULT 'offen' NOT NULL,
	"geprueftVon" integer,
	"geprueftVonName" varchar(255),
	"geprueftAt" timestamp,
	"prueferKommentar" text,
	"freigegebenerBetrag" integer
);
--> statement-breakpoint
CREATE TABLE "mk_positionen" (
	"id" serial PRIMARY KEY NOT NULL,
	"rechnungId" integer NOT NULL,
	"positionKey" varchar(64) NOT NULL,
	"positionLabel" varchar(255) NOT NULL,
	"einheit" varchar(32) NOT NULL,
	"einzelpreis" integer NOT NULL,
	"menge" integer DEFAULT 0 NOT NULL,
	"inPauschaleEnthalten" boolean DEFAULT false NOT NULL,
	"pauschaleMenge" integer DEFAULT 0 NOT NULL,
	"nettomenge" integer DEFAULT 0 NOT NULL,
	"gesamtpreis" integer DEFAULT 0 NOT NULL,
	"quelle" varchar(32) DEFAULT 'klassifizierung' NOT NULL,
	"isFreitext" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mk_rechnungen" (
	"id" serial PRIMARY KEY NOT NULL,
	"orderNumber" varchar(64) NOT NULL,
	"airtableAppointmentsId" varchar(64),
	"kundenName" varchar(255),
	"hwpName" varchar(255),
	"hwpAccountId" varchar(64),
	"uvAnzahl" integer DEFAULT 1 NOT NULL,
	"pauschaleBetrag" integer DEFAULT 0 NOT NULL,
	"summeOhnePauschale" integer DEFAULT 0 NOT NULL,
	"summeMitPauschale" integer DEFAULT 0 NOT NULL,
	"status" "mk_rechnung_status" DEFAULT 'entwurf' NOT NULL,
	"erstelltVon" integer NOT NULL,
	"erstelltVonName" varchar(255),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" "role" NOT NULL,
	"permissions" json NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"updatedBy" integer,
	CONSTRAINT "role_permissions_role_unique" UNIQUE("role")
);
--> statement-breakpoint
CREATE TABLE "team_hwp_zuordnungen" (
	"id" serial PRIMARY KEY NOT NULL,
	"teamId" integer NOT NULL,
	"hwpAccountId" varchar(64) NOT NULL,
	"hwpName" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_mitglieder" (
	"id" serial PRIMARY KEY NOT NULL,
	"teamId" integer NOT NULL,
	"userId" integer NOT NULL,
	"teamRolle" "team_rolle" DEFAULT 'tom' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"beschreibung" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"createdBy" integer
);
--> statement-breakpoint
CREATE TABLE "user_hwp_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"hwpAccountId" varchar(64) NOT NULL,
	"hwpName" varchar(255) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"passwordHash" varchar(255) NOT NULL,
	"name" text NOT NULL,
	"role" "role" DEFAULT 'hwp' NOT NULL,
	"airtableAccountId" varchar(64),
	"companyName" varchar(255),
	"isActive" boolean DEFAULT true NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
