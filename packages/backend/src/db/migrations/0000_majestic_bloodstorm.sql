CREATE TABLE IF NOT EXISTS "employers" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"career_url" text NOT NULL,
	"ats_type" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "employers_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"employer_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"location" text,
	"remote_status" text,
	"department" text,
	"description_html" text,
	"salary_raw" text,
	"salary_normalized_raw" text,
	"salary_normalized_min" text,
	"salary_normalized_max" text,
	"salary_currency" text,
	"salary_period" text,
	"requirements_text" text,
	"requirements_html" text,
	"responsibilities_text" text,
	"responsibilities_html" text,
	"summary_text" text,
	"normalized_description_text" text,
	"normalized_description_html" text,
	"ai_provider" text,
	"ai_model" text,
	"ai_normalized_at" timestamp,
	"ai_warnings" jsonb,
	"ai_payload" jsonb,
	"date_posted_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	CONSTRAINT "jobs_employer_external_id_unique" UNIQUE("employer_id","external_id"),
	CONSTRAINT "jobs_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "keyword_filters" (
	"id" serial PRIMARY KEY NOT NULL,
	"keyword" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_filters_keyword_unique" UNIQUE("keyword")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_errors" (
	"id" serial PRIMARY KEY NOT NULL,
	"employer_id" integer,
	"error_type" text NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
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
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scrape_run_employers_run_id_employer_id_unique" UNIQUE("run_id","employer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"run_type" text DEFAULT 'normal' NOT NULL,
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
 ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scrape_errors" ADD CONSTRAINT "scrape_errors_employer_id_employers_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."employers"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
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
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_employer_id_idx" ON "jobs" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_removed_at_idx" ON "jobs" USING btree ("removed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_first_seen_at_idx" ON "jobs" USING btree ("first_seen_at");