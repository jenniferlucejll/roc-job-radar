export interface Employer {
  id: number
  key: string
  name: string
  careerUrl: string
  atsType: string
  active: boolean
  createdAt: string
}

export interface Job {
  id: number
  employerId: number
  externalId: string
  title: string
  url: string
  location: string | null
  remoteStatus: 'remote' | 'hybrid' | 'onsite' | null
  department: string | null
  descriptionHtml: string | null
  salaryRaw: string | null
  datePostedAt: string | null
  firstSeenAt: string
  lastSeenAt: string
  removedAt: string | null
}

export type ScrapeRunStatus = 'running' | 'success' | 'partial_error' | 'failed'

export interface ScrapeRunSummary {
  runId: string
  status: ScrapeRunStatus
  startedAt: string
  finishedAt: string
  durationMs: number
  employersRun: number
  jobsInserted: number
  jobsUpdated: number
  jobsRemoved: number
  errors: number
  requestAttempts: number
  retryAttempts: number
  openErrors: number
}

export interface ScrapeResult extends ScrapeRunSummary {
  employers: ScrapeEmployerSummary[]
}

export interface ScrapeEmployerSummary {
  employerId: number
  employerKey: string
  employerName: string
  status: 'success' | 'missing_adapter' | 'robots_blocked' | 'error'
  jobsScraped: number
  jobsFiltered: number
  jobsInserted: number
  jobsUpdated: number
  jobsRemoved: number
  requestAttempts: number
  retryAttempts: number
  unresolvedErrors: number
  errors: Array<{ errorType: string; message: string }>
}

export interface ScrapeStatusResponse {
  running: boolean
  runId: string | null
  lastStartedAt: string | null
  lastResult: ScrapeResult | null
  recentRuns: ScrapeRunSummary[]
}

export interface JobFilters {
  employerId: string
  status: 'active' | 'removed' | 'all'
  newOnly: boolean
  newHours: number
  q: string
}
