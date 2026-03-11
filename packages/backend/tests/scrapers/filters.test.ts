import { describe, it, expect } from 'vitest';
import { passesFilter, TECH_DEPARTMENTS } from '../../src/scrapers/filters.js';
import type { ScrapedJob } from '../../src/types/index.js';

function job(overrides: Partial<ScrapedJob> = {}): ScrapedJob {
  return {
    externalId: 'job-1',
    title: 'some role',
    url: 'https://example.com/jobs/1',
    ...overrides,
  };
}

const KEYWORDS = ['engineer', 'developer', 'software', 'data'];

describe('passesFilter', () => {
  describe('keyword matching', () => {
    it('passes when title contains a keyword', () => {
      expect(passesFilter(job({ title: 'Senior Software Engineer' }), KEYWORDS)).toBe(true);
    });

    it('passes when description contains a keyword', () => {
      expect(
        passesFilter(
          job({ title: 'Analyst', descriptionHtml: '<p>Looking for a data engineer</p>' }),
          KEYWORDS,
        ),
      ).toBe(true);
    });

    it('is case-insensitive for keywords', () => {
      expect(passesFilter(job({ title: 'SENIOR DEVELOPER' }), KEYWORDS)).toBe(true);
    });

    it('fails when no keyword matches title or description', () => {
      expect(
        passesFilter(
          job({ title: 'Warehouse Associate', descriptionHtml: '<p>Stock shelves.</p>' }),
          KEYWORDS,
        ),
      ).toBe(false);
    });
  });

  describe('department category matching', () => {
    it('passes when department exactly matches a tech category', () => {
      expect(passesFilter(job({ title: 'Analyst', department: 'Engineering' }), [])).toBe(true);
    });

    it('passes when department contains a tech category substring', () => {
      expect(
        passesFilter(job({ title: 'Manager', department: 'Software Engineering' }), []),
      ).toBe(true);
    });

    it('is case-insensitive for department matching', () => {
      expect(passesFilter(job({ title: 'Manager', department: 'INFORMATION TECHNOLOGY' }), [])).toBe(true);
    });

    it('fails when department does not match any tech category', () => {
      expect(passesFilter(job({ title: 'Cashier', department: 'Retail Operations' }), [])).toBe(false);
    });
  });

  describe('combined logic', () => {
    it('passes on department match even when keywords are empty', () => {
      expect(
        passesFilter(job({ title: 'Project Manager', department: 'Technology' }), []),
      ).toBe(true);
    });

    it('passes on keyword match even when department does not match', () => {
      expect(
        passesFilter(job({ title: 'Software Engineer', department: 'Finance' }), KEYWORDS),
      ).toBe(true);
    });

    it('fails when neither department nor keywords match', () => {
      expect(
        passesFilter(
          job({ title: 'Store Associate', department: 'Retail', descriptionHtml: 'Greet customers.' }),
          KEYWORDS,
        ),
      ).toBe(false);
    });

    it('passes when job has no department but title keyword matches', () => {
      expect(passesFilter(job({ title: 'Data Analyst' }), KEYWORDS)).toBe(true);
    });
  });

  describe('TECH_DEPARTMENTS constant', () => {
    it('includes expected categories', () => {
      expect(TECH_DEPARTMENTS).toContain('engineering');
      expect(TECH_DEPARTMENTS).toContain('information technology');
      expect(TECH_DEPARTMENTS).toContain('security');
    });
  });
});
