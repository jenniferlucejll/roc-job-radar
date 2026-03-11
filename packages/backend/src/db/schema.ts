import { pgTable, serial, text, boolean, integer, timestamp, unique } from 'drizzle-orm/pg-core';

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
]);

export const scrapeErrors = pgTable('scrape_errors', {
  id: serial('id').primaryKey(),
  employerId: integer('employer_id').references(() => employers.id),
  errorType: text('error_type').notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
});

export const keywordFilters = pgTable('keyword_filters', {
  id: serial('id').primaryKey(),
  keyword: text('keyword').notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
