CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"status" text NOT NULL DEFAULT 'success',
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp NOT NULL,
	"employers_run" integer NOT NULL DEFAULT 0,
	"jobs_inserted" integer NOT NULL DEFAULT 0,
	"jobs_updated" integer NOT NULL DEFAULT 0,
	"jobs_removed" integer NOT NULL DEFAULT 0,
	"errors" integer NOT NULL DEFAULT 0,
	"request_attempts" integer NOT NULL DEFAULT 0,
	"retry_attempts" integer NOT NULL DEFAULT 0,
	"open_errors" integer NOT NULL DEFAULT 0,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_run_id_unique" UNIQUE("run_id");
--> statement-breakpoint
CREATE INDEX "scrape_runs_finished_at_idx" ON "scrape_runs" ("finished_at");
