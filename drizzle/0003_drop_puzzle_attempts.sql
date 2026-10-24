DROP TABLE "puzzle_attempts" CASCADE;--> statement-breakpoint
-- The old 15-tile speed puzzle is stage 3 (4x4) of the sliding puzzle.
UPDATE "tournaments" SET "game" = 'slide', "stage" = 3 WHERE "game" = 'puzzle15';