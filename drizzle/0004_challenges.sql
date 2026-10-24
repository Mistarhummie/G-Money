CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"game" text NOT NULL,
	"kind" text NOT NULL,
	"stage" integer DEFAULT 1 NOT NULL,
	"seed" bigint NOT NULL,
	"created_by" text NOT NULL,
	"invited_user_id" text,
	"side0_id" text,
	"side1_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"moves" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"turn" integer DEFAULT 0 NOT NULL,
	"winner_side" integer,
	"result" text,
	"move_seconds" integer DEFAULT 120 NOT NULL,
	"last_move_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "challenge_id" text;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_invited_user_id_users_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_side0_id_users_id_fk" FOREIGN KEY ("side0_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_side1_id_users_id_fk" FOREIGN KEY ("side1_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "challenges_game_status_idx" ON "challenges" USING btree ("game","status");