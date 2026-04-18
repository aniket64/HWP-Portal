CREATE TABLE `mk_nachtraege` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rechnungId` int NOT NULL,
	`eingereichtVon` int NOT NULL,
	`eingereichtVonName` varchar(255),
	`eingereichtAt` timestamp NOT NULL DEFAULT (now()),
	`summeOhnePauschale` int NOT NULL DEFAULT 0,
	`summeMitPauschale` int NOT NULL DEFAULT 0,
	`hwpKommentar` text,
	`nachtrag_status` enum('offen','freigegeben','abgelehnt') NOT NULL DEFAULT 'offen',
	`geprueftVon` int,
	`geprueftVonName` varchar(255),
	`geprueftAt` timestamp,
	`prueferKommentar` text,
	`freigegebenerBetrag` int,
	CONSTRAINT `mk_nachtraege_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mk_positionen` (
	`id` int AUTO_INCREMENT NOT NULL,
	`rechnungId` int NOT NULL,
	`positionKey` varchar(64) NOT NULL,
	`positionLabel` varchar(255) NOT NULL,
	`einheit` varchar(32) NOT NULL,
	`einzelpreis` int NOT NULL,
	`menge` int NOT NULL DEFAULT 0,
	`inPauschaleEnthalten` boolean NOT NULL DEFAULT false,
	`pauschaleMenge` int NOT NULL DEFAULT 0,
	`nettomenge` int NOT NULL DEFAULT 0,
	`gesamtpreis` int NOT NULL DEFAULT 0,
	`quelle` varchar(32) NOT NULL DEFAULT 'klassifizierung',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `mk_positionen_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `mk_rechnungen` (
	`id` int AUTO_INCREMENT NOT NULL,
	`orderNumber` varchar(64) NOT NULL,
	`airtableAppointmentsId` varchar(64),
	`kundenName` varchar(255),
	`hwpName` varchar(255),
	`hwpAccountId` varchar(64),
	`uvAnzahl` int NOT NULL DEFAULT 1,
	`pauschaleBetrag` int NOT NULL DEFAULT 0,
	`summeOhnePauschale` int NOT NULL DEFAULT 0,
	`summeMitPauschale` int NOT NULL DEFAULT 0,
	`mk_rechnung_status` enum('entwurf','abgeschlossen','terminiert','nachtrag','freigegeben','abgelehnt') NOT NULL DEFAULT 'entwurf',
	`erstelltVon` int NOT NULL,
	`erstelltVonName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mk_rechnungen_id` PRIMARY KEY(`id`)
);
