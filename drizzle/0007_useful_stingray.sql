CREATE TABLE `team_hwp_zuordnungen` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`hwpAccountId` varchar(64) NOT NULL,
	`hwpName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_hwp_zuordnungen_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `team_mitglieder` (
	`id` int AUTO_INCREMENT NOT NULL,
	`teamId` int NOT NULL,
	`userId` int NOT NULL,
	`team_rolle` enum('kam','tom','tl') NOT NULL DEFAULT 'tom',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `team_mitglieder_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`beschreibung` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`createdBy` int,
	CONSTRAINT `teams_id` PRIMARY KEY(`id`)
);
