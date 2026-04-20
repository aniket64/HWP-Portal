CREATE TYPE "public"."nachtrag_status" AS ENUM('offen', 'freigegeben', 'abgelehnt');--> statement-breakpoint
CREATE TYPE "public"."team_rolle" AS ENUM('kam', 'tom', 'tl');--> statement-breakpoint
DROP TABLE "role_permissions" CASCADE;--> statement-breakpoint
DROP TABLE "users" CASCADE;--> statement-breakpoint
DROP TYPE "public"."role";