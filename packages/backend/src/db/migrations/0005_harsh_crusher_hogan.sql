ALTER TABLE "scrape_run_employers"
  ADD COLUMN IF NOT EXISTS "duration_ms" integer DEFAULT 0 NOT NULL;
