import { pgTable, serial, text, boolean, integer, timestamp, unique, index } from 'drizzle-orm/pg-core';

export const employers = pgTable('employers', {
  id: serial('id').primaryKey(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  careerUrl: text('career_url').notNull(),
  atsType: text('ats_type').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const jobs = pgTable('jobs', {
  id: serial('id').primaryKey(),
  employerId: integer('employer_id').notNull().references(() => employers.id),
  externalId: text('external_id').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  location: text('location'),
  remoteStatus: text('remote_status'),
  department: text('department'),
  descriptionHtml: text('description_html'),
  salaryRaw: text('salary_raw'),
  datePostedAt: timestamp('date_posted_at'),
  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
  removedAt: timestamp('removed_at'),
}, (table) => [
  unique('jobs_employer_external_id_unique').on(table.employerId, table.externalId),
  unique('jobs_url_unique').on(table.url),
  index('jobs_employer_id_idx').on(table.employerId),
  index('jobs_removed_at_idx').on(table.removedAt),
  index('jobs_first_seen_at_idx').on(table.firstSeenAt),
]);

export const scrapeErrors = pgTable('scrape_errors', {
  id: serial('id').primaryKey(),
  employerId: integer('employer_id').references(() => employers.id),
  errorType: text('error_type').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

export const scrapeRuns = pgTable('scrape_runs', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull().unique(),
  status: text('status').notNull().default('success'),
  startedAt: timestamp('started_at').notNull(),
  finishedAt: timestamp('finished_at').notNull(),
  employersRun: integer('employers_run').notNull().default(0),
  jobsInserted: integer('jobs_inserted').notNull().default(0),
  jobsUpdated: integer('jobs_updated').notNull().default(0),
  jobsRemoved: integer('jobs_removed').notNull().default(0),
  errors: integer('errors').notNull().default(0),
  requestAttempts: integer('request_attempts').notNull().default(0),
  retryAttempts: integer('retry_attempts').notNull().default(0),
  openErrors: integer('open_errors').notNull().default(0),
  durationMs: integer('duration_ms').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const scrapeRunEmployers = pgTable('scrape_run_employers', {
  id: serial('id').primaryKey(),
  runId: text('run_id').notNull().references(() => scrapeRuns.runId),
  employerId: integer('employer_id').notNull().references(() => employers.id),
  status: text('status').notNull(),
  jobsScraped: integer('jobs_scraped').notNull().default(0),
  jobsFiltered: integer('jobs_filtered').notNull().default(0),
  jobsInserted: integer('jobs_inserted').notNull().default(0),
  jobsUpdated: integer('jobs_updated').notNull().default(0),
  jobsRemoved: integer('jobs_removed').notNull().default(0),
  requestAttempts: integer('request_attempts').notNull().default(0),
  retryAttempts: integer('retry_attempts').notNull().default(0),
  unresolvedErrors: integer('unresolved_errors').notNull().default(0),
  errors: text('errors').notNull().default('[]'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  unique('scrape_run_employers_run_id_employer_id_unique').on(table.runId, table.employerId),
]);

export const keywordFilters = pgTable('keyword_filters', {
  id: serial('id').primaryKey(),
  keyword: text('keyword').notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
