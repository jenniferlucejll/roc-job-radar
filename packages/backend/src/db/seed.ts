import { db } from './client.js';
import { employers, keywordFilters } from './schema.js';

const seedEmployers = [
  { key: 'paychex', name: 'Paychex', careerUrl: 'https://www.paychex.com/careers', atsType: 'jibe' },
  { key: 'wegmans', name: 'Wegmans', careerUrl: 'https://jobs.wegmans.com', atsType: 'custom' },
  { key: 'university-of-rochester', name: 'University of Rochester', careerUrl: 'https://www.rochester.edu/careers/', atsType: 'workday' },
  { key: 'l3harris', name: 'L3Harris', careerUrl: 'https://careers.l3harris.com', atsType: 'talentbrew' },
];

const seedKeywords = [
  'engineer', 'developer', 'software', 'data', 'devops', 'cloud',
  'security', 'architect', 'infrastructure', 'platform', 'sre',
  'machine learning', 'artificial intelligence', 'database', 'backend',
  'frontend', 'full-stack', 'fullstack', 'typescript', 'python',
];

await db.insert(employers)
  .values(seedEmployers)
  .onConflictDoNothing();

await db.insert(keywordFilters)
  .values(seedKeywords.map((keyword) => ({ keyword })))
  .onConflictDoNothing();

console.log('Seed complete.');
process.exit(0);
