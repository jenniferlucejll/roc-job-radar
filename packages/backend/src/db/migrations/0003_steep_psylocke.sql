CREATE TABLE IF NOT EXISTS "scrape_run_employers" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"employer_id" integer NOT NULL,
	"status" text NOT NULL,
	"jobs_scraped" integer DEFAULT 0 NOT NULL,
	"jobs_filtered" integer DEFAULT 0 NOT NULL,
	"jobs_inserted" integer DEFAULT 0 NOT NULL,
	"jobs_updated" integer DEFAULT 0 NOT NULL,
	"jobs_removed" integer DEFAULT 0 NOT NULL,
	"request_attempts" integer DEFAULT 0 NOT NULL,
	"retry_attempts" integer DEFAULT 0 NOT NULL,
	"unresolved_errors" integer DEFAULT 0 NOT NULL,
	"errors" text DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_run_employers_run_id_employer_id_unique" UNIQUE("run_id","employer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"started_at" timestamp NOT NULL,
	"finished_at" timestamp NOT NULL,
	"employers_run" integer DEFAULT 0 NOT NULL,
	"jobs_inserted" integer DEFAULT 0 NOT NULL,
	"jobs_updated" integer DEFAULT 0 NOT NULL,
	"jobs_removed" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"request_attempts" integer DEFAULT 0 NOT NULL,
	"retry_attempts" integer DEFAULT 0 NOT NULL,
	"open_errors" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_run_employers" ADD CONSTRAINT "scrape_run_employers_run_id_scrape_runs_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."scrape_runs"("run_id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_run_employers" ADD CONSTRAINT "scrape_run_employers_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
