CREATE TABLE `user_hwp_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`hwpAccountId` varchar(64) NOT NULL,
	`hwpName` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_hwp_assignments_id` PRIMARY KEY(`id`)
);
