ALTER TABLE "scrape_errors" ADD COLUMN "resolved_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_url_unique" UNIQUE("url");