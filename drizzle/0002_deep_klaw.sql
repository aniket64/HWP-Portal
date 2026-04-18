CREATE TABLE `airtable_cache` (
	`cacheKey` varchar(255) NOT NULL,
	`data` text NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	`expiresAt` timestamp NOT NULL,
	CONSTRAINT `airtable_cache_cacheKey` PRIMARY KEY(`cacheKey`)
);
--> statement-breakpoint
CREATE TABLE `app_settings` (
	`key` varchar(128) NOT NULL,
	`value` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`updatedBy` int,
	CONSTRAINT `app_settings_key` PRIMARY KEY(`key`)
);
