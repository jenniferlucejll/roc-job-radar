import { describe, it, expect } from 'vitest'
import { buildCurrentCounts, buildMonthlyTrend } from './analytics.js'
import type { Job } from '../types/index.js'

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    employerId: 10,
    externalId: 'ext-1',
    title: 'Engineer',
    url: 'https://example.com/job/1',
    location: null,
    remoteStatus: null,
    department: null,
    descriptionHtml: null,
    salaryRaw: null,
    datePostedAt: null,
    firstSeenAt: '2026-01-15T00:00:00Z',
    lastSeenAt: '2026-01-15T00:00:00Z',
    removedAt: null,
    ...overrides,
  }
}

// ─── buildCurrentCounts ───────────────────────────────────────────────────────

describe('buildCurrentCounts', () => {
  it('returns empty array when no jobs', () => {
    expect(buildCurrentCounts([], (j) => j.department ?? '')).toEqual([])
  })

  it('counts active jobs by key', () => {
    const jobs = [
      job({ id: 1, department: 'Engineering' }),
      job({ id: 2, department: 'Engineering' }),
      job({ id: 3, department: 'Product' }),
    ]
    const result = buildCurrentCounts(jobs, (j) => j.department ?? '')
    expect(result).toEqual([
      { name: 'Engineering', active: 2 },
      { name: 'Product', active: 1 },
    ])
  })

  it('excludes removed jobs (removedAt non-null)', () => {
    const jobs = [
      job({ id: 1, department: 'Engineering' }),
      job({ id: 2, department: 'Engineering', removedAt: '2026-02-01T00:00:00Z' }),
    ]
    const result = buildCurrentCounts(jobs, (j) => j.department ?? '')
    expect(result).toEqual([{ name: 'Engineering', active: 1 }])
  })

  it('groups null key values as "Uncategorized"', () => {
    const jobs = [job({ id: 1, department: null })]
    const result = buildCurrentCounts(jobs, (j) => j.department ?? '')
    expect(result).toEqual([{ name: 'Uncategorized', active: 1 }])
  })

  it('groups empty-string key values as "Uncategorized"', () => {
    const jobs = [job({ id: 1, department: '' })]
    const result = buildCurrentCounts(jobs, (j) => j.department ?? '')
    expect(result).toEqual([{ name: 'Uncategorized', active: 1 }])
  })

  it('sorts results by count descending', () => {
    const jobs = [
      job({ id: 1, department: 'A' }),
      job({ id: 2, department: 'B' }),
      job({ id: 3, department: 'B' }),
      job({ id: 4, department: 'C' }),
      job({ id: 5, department: 'C' }),
      job({ id: 6, department: 'C' }),
    ]
    const result = buildCurrentCounts(jobs, (j) => j.department ?? '')
    expect(result.map((r) => r.name)).toEqual(['C', 'B', 'A'])
  })

  it('returns zero active when all jobs are removed', () => {
    const jobs = [
      job({ id: 1, department: 'Eng', removedAt: '2026-01-01T00:00:00Z' }),
    ]
    const result = buildCurrentCounts(jobs, (j) => j.department ?? '')
    expect(result).toEqual([])
  })

  it('works with a non-department key function (employerId)', () => {
    const jobs = [
      job({ id: 1, employerId: 1 }),
      job({ id: 2, employerId: 1 }),
      job({ id: 3, employerId: 2 }),
    ]
    const result = buildCurrentCounts(jobs, (j) => String(j.employerId))
    expect(result).toEqual([
      { name: '1', active: 2 },
      { name: '2', active: 1 },
    ])
  })
})

// ─── buildMonthlyTrend ────────────────────────────────────────────────────────

describe('buildMonthlyTrend', () => {
  it('returns empty array when no jobs', () => {
    const result = buildMonthlyTrend([], (j) => j.department ?? '', ['Engineering'])
    expect(result).toEqual([])
  })

  it('returns empty array when topKeys is empty', () => {
    const jobs = [job({ department: 'Engineering' })]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', [])
    expect(result).toEqual([])
  })

  it('buckets jobs by firstSeenAt month (YYYY-MM)', () => {
    const jobs = [
      job({ id: 1, department: 'Eng', firstSeenAt: '2026-01-05T00:00:00Z' }),
      job({ id: 2, department: 'Eng', firstSeenAt: '2026-01-20T00:00:00Z' }),
      job({ id: 3, department: 'Eng', firstSeenAt: '2026-02-10T00:00:00Z' }),
    ]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', ['Eng'])
    expect(result).toEqual([
      { month: '2026-01', Eng: 2 },
      { month: '2026-02', Eng: 1 },
    ])
  })

  it('sorts months chronologically', () => {
    const jobs = [
      job({ id: 1, department: 'Eng', firstSeenAt: '2026-03-01T00:00:00Z' }),
      job({ id: 2, department: 'Eng', firstSeenAt: '2026-01-01T00:00:00Z' }),
      job({ id: 3, department: 'Eng', firstSeenAt: '2026-02-01T00:00:00Z' }),
    ]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', ['Eng'])
    expect(result.map((r) => r.month)).toEqual(['2026-01', '2026-02', '2026-03'])
  })

  it('fills zero for a topKey with no jobs in a given month', () => {
    const jobs = [
      job({ id: 1, department: 'Eng', firstSeenAt: '2026-01-01T00:00:00Z' }),
      job({ id: 2, department: 'Product', firstSeenAt: '2026-02-01T00:00:00Z' }),
    ]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', ['Eng', 'Product'])
    expect(result).toEqual([
      { month: '2026-01', Eng: 1, Product: 0 },
      { month: '2026-02', Eng: 0, Product: 1 },
    ])
  })

  it('excludes keys not in topKeys', () => {
    const jobs = [
      job({ id: 1, department: 'Eng', firstSeenAt: '2026-01-01T00:00:00Z' }),
      job({ id: 2, department: 'Design', firstSeenAt: '2026-01-01T00:00:00Z' }),
    ]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', ['Eng'])
    expect(result).toEqual([{ month: '2026-01', Eng: 1 }])
    expect(result[0]).not.toHaveProperty('Design')
  })

  it('includes removed jobs in the trend (historical count)', () => {
    const jobs = [
      job({ id: 1, department: 'Eng', firstSeenAt: '2026-01-01T00:00:00Z', removedAt: '2026-02-01T00:00:00Z' }),
    ]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', ['Eng'])
    expect(result).toEqual([{ month: '2026-01', Eng: 1 }])
  })

  it('handles null department as "Uncategorized"', () => {
    const jobs = [
      job({ id: 1, department: null, firstSeenAt: '2026-01-01T00:00:00Z' }),
    ]
    const result = buildMonthlyTrend(jobs, (j) => j.department ?? '', ['Uncategorized'])
    expect(result).toEqual([{ month: '2026-01', Uncategorized: 1 }])
  })
})
