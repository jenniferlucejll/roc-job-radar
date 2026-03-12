ALTER TABLE "jobs" ADD COLUMN "salary_normalized_raw" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_normalized_min" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_normalized_max" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_currency" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "salary_period" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "requirements_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "requirements_html" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "responsibilities_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "responsibilities_html" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "summary_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "normalized_description_text" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "normalized_description_html" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_provider" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_normalized_at" timestamp;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_warnings" jsonb;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "ai_payload" jsonb;