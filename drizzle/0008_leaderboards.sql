CREATE TABLE "leaderboard_runs" (
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
CREATE TABLE "leaderboard_weeks" (
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
ALTER TABLE "game_sessions" ADD COLUMN "run_id" text;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "points" integer;--> statement-breakpoint
ALTER TABLE "leaderboard_runs" ADD CONSTRAINT "leaderboard_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leaderboard_runs_week_idx" ON "leaderboard_runs" USING btree ("game","week","status");--> statement-breakpoint
CREATE INDEX "leaderboard_runs_user_idx" ON "leaderboard_runs" USING btree ("user_id","game","week");--> statement-breakpoint
CREATE INDEX "game_sessions_run_idx" ON "game_sessions" USING btree ("run_id");