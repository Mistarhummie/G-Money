CREATE TABLE "game_progress" (
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"stage" integer NOT NULL,
	"best_score" integer,
	"best_time_ms" integer,
	"cleared_at" timestamp with time zone,
	CONSTRAINT "game_progress_user_id_game_stage_pk" PRIMARY KEY("user_id","game","stage")
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"game" text NOT NULL,
	"stage" integer NOT NULL,
	"tournament_id" text,
	"seed" bigint NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"time_ms" integer,
	"score" integer,
	"valid" boolean DEFAULT false NOT NULL,
	"cleared" boolean DEFAULT false NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"detail" text
);
--> statement-breakpoint
ALTER TABLE "tournaments" ADD COLUMN "stage" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "game_progress" ADD CONSTRAINT "game_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "game_sessions_tournament_idx" ON "game_sessions" USING btree ("tournament_id","user_id");--> statement-breakpoint
CREATE INDEX "game_sessions_board_idx" ON "game_sessions" USING btree ("game","stage","cleared");