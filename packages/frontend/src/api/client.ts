import type {
  Employer,
  Job,
  JobFilters,
  ScrapeStatusResponse,
} from '../types/index.js'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${path}`)
  return res.json() as Promise<T>
}

export async function fetchEmployers(all = false): Promise<Employer[]> {
  const qs = all ? '?all=true' : ''
  return get<Employer[]>(`/api/employers${qs}`)
}

export async function fetchJobs(filters: Partial<JobFilters> = {}): Promise<Job[]> {
  const params = new URLSearchParams()
  if (filters.employerId) params.set('employerId', filters.employerId)
  if (filters.status && filters.status !== 'active') params.set('status', filters.status)
  if (filters.newOnly) {
    params.set('new', 'true')
    if (filters.newHours && filters.newHours !== 168) {
      params.set('newHours', String(filters.newHours))
    }
  }
  if (filters.q?.trim()) params.set('q', filters.q.trim())
  const qs = params.toString() ? `?${params.toString()}` : ''
  return get<Job[]>(`/api/jobs${qs}`)
}

export async function fetchJob(id: number): Promise<Job> {
  return get<Job>(`/api/jobs/${id}`)
}

export async function fetchScrapeStatus(limit = 10): Promise<ScrapeStatusResponse> {
  return get<ScrapeStatusResponse>(`/api/scrape/status?limit=${limit}`)
}

export async function triggerScrape(): Promise<{ started: boolean; runId: string }> {
  const res = await fetch('/api/scrape', { method: 'POST' })
  if (res.status === 409) {
    const body = (await res.json()) as { started: boolean }
    return { started: body.started, runId: '' }
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<{ started: boolean; runId: string }>
}
