CREATE TABLE "ludo_games" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"stage" integer,
	"size" integer NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"host_id" text,
	"seats" jsonb NOT NULL,
	"invited" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first" integer DEFAULT 0 NOT NULL,
	"log" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"missed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"places" jsonb,
	"turn_seconds" integer DEFAULT 30 NOT NULL,
	"last_action_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ludo_players" (
	"game_id" text NOT NULL,
	"user_id" text NOT NULL,
	"seat" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ludo_players_game_id_user_id_pk" PRIMARY KEY("game_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "ludo_progress" (
	"user_id" text NOT NULL,
	"stage" integer NOT NULL,
	"played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"best_rolls" integer,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "ludo_progress_user_id_stage_pk" PRIMARY KEY("user_id","stage")
);
--> statement-breakpoint
ALTER TABLE "ludo_games" ADD CONSTRAINT "ludo_games_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ludo_players" ADD CONSTRAINT "ludo_players_game_id_ludo_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."ludo_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ludo_players" ADD CONSTRAINT "ludo_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ludo_progress" ADD CONSTRAINT "ludo_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ludo_games_lobby_idx" ON "ludo_games" USING btree ("mode","status","is_private");--> statement-breakpoint
CREATE UNIQUE INDEX "ludo_players_seat_idx" ON "ludo_players" USING btree ("game_id","seat");--> statement-breakpoint
CREATE INDEX "ludo_players_user_idx" ON "ludo_players" USING btree ("user_id");