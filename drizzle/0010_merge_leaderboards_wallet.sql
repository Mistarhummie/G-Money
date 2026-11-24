-- The leaderboards (0008) and wallet payments (0009) were built on separate branches that share one test
-- database. Whichever branch deployed first, the other's migration may have been skipped, so this one makes
-- sure everything from both exists. Every statement is safe to run again.
CREATE TABLE IF NOT EXISTS "leaderboard_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"week" text NOT NULL,
	"fee_kes" integer NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"points" integer DEFAULT 0 NOT NULL,
	"time_ms" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"detail" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leaderboard_weeks" (
	"game" text NOT NULL,
	"week" text NOT NULL,
	"gross_kes" integer NOT NULL,
	"platform_fee_kes" integer NOT NULL,
	"pool_kes" integer NOT NULL,
	"players" integer NOT NULL,
	"winners" jsonb NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leaderboard_weeks_game_week_pk" PRIMARY KEY("game","week")
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN IF NOT EXISTS "run_id" text;
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN IF NOT EXISTS "points" integer;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "leaderboard_runs" ADD CONSTRAINT "leaderboard_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_runs_week_idx" ON "leaderboard_runs" USING btree ("game","week","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leaderboard_runs_user_idx" ON "leaderboard_runs" USING btree ("user_id","game","week");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_sessions_run_idx" ON "game_sessions" USING btree ("run_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "wallet_deposits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"method" text NOT NULL,
	"amount_kes" integer NOT NULL,
	"fee_kes" integer DEFAULT 0 NOT NULL,
	"total_kes" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invoice_id" text,
	"checkout_id" text,
	"payer_email" text,
	"receipt" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"credited_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"amount_kes" integer NOT NULL,
	"fee_kes" integer DEFAULT 0 NOT NULL,
	"phone" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"tracking_id" text,
	"receipt" text,
	"note" text,
	"reviewed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "wallet_deposits" ADD CONSTRAINT "wallet_deposits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "wallet_deposits_user_idx" ON "wallet_deposits" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_deposits_invoice_idx" ON "wallet_deposits" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_user_idx" ON "withdrawals" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_tracking_idx" ON "withdrawals" USING btree ("tracking_id");
