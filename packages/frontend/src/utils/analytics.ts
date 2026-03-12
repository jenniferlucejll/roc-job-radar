import type { Job } from '../types/index.js'

export interface CurrentCount {
  name: string
  active: number
}

export interface MonthlyPoint {
  month: string
  [key: string]: number | string
}

/**
 * Groups active jobs by a key function and returns sorted current counts.
 * Jobs with removedAt set are excluded from active counts.
 */
export function buildCurrentCounts(
  jobs: Job[],
  key: (j: Job) => string,
): CurrentCount[] {
  const counts = new Map<string, number>()
  for (const job of jobs) {
    if (job.removedAt !== null) continue
    const k = key(job) || 'Uncategorized'
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, active]) => ({ name, active }))
}

/**
 * Buckets all jobs (active + removed) by month of firstSeenAt,
 * counting how many appeared per month for each key in topKeys.
 */
export function buildMonthlyTrend(
  jobs: Job[],
  key: (j: Job) => string,
  topKeys: string[],
): MonthlyPoint[] {
  const monthMap = new Map<string, Map<string, number>>()

  for (const job of jobs) {
    const month = job.firstSeenAt.slice(0, 7) // YYYY-MM
    const k = key(job) || 'Uncategorized'
    if (!topKeys.includes(k)) continue
    if (!monthMap.has(month)) monthMap.set(month, new Map())
    const m = monthMap.get(month)!
    m.set(k, (m.get(k) ?? 0) + 1)
  }

  return [...monthMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, counts]) => {
      const point: MonthlyPoint = { month }
      for (const k of topKeys) {
        point[k] = counts.get(k) ?? 0
      }
      return point
    })
}
