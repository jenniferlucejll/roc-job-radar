CREATE INDEX IF NOT EXISTS "jobs_employer_id_idx" ON "jobs" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_removed_at_idx" ON "jobs" USING btree ("removed_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jobs_first_seen_at_idx" ON "jobs" USING btree ("first_seen_at");