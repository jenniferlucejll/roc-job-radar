import { useCallback, useEffect, useState } from 'react'
import { fetchEmployers, fetchJobs } from '../api/client.js'
import type { Employer, Job, JobFilters } from '../types/index.js'
import { SearchBar } from '../components/SearchBar.js'
import { ViewToggle } from '../components/ViewToggle.js'
import type { ViewMode } from '../components/ViewToggle.js'
import { Pagination } from '../components/Pagination.js'
import { JobCardLarge } from '../components/JobCardLarge.js'
import { JobListRow } from '../components/JobListRow.js'
import { JobModal } from '../components/JobModal.js'

const CARD_PAGE_SIZE = 12
const LIST_PAGE_SIZE = 20

const DEFAULT_FILTERS: JobFilters = {
  employerId: '',
  status: 'active',
  newOnly: false,
  newHours: 168,
  q: '',
}

export function HomePage() {
  const [employers, setEmployers] = useState<Employer[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [filters, setFilters] = useState<JobFilters>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('card')
  const [page, setPage] = useState(1)
  const [selectedJob, setSelectedJob] = useState<Job | null>(null)

  useEffect(() => {
    fetchEmployers().then(setEmployers).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchJobs(filters)
      .then((data) => {
        setJobs([...data].sort((a, b) => +new Date(b.firstSeenAt) - +new Date(a.firstSeenAt)))
        setPage(1)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load jobs')
      })
      .finally(() => setLoading(false))
  }, [filters])

  const employerMap = new Map(employers.map((e) => [e.id, e]))

  const pageSize = viewMode === 'card' ? CARD_PAGE_SIZE : LIST_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize))
  const pagedJobs = jobs.slice((page - 1) * pageSize, page * pageSize)

  const handleViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode)
    setPage(1)
  }, [])

  function handleFilterChange(patch: Partial<JobFilters>) {
    setFilters((f) => ({ ...f, ...patch }))
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <SearchBar
        value={filters.q}
        onChange={(q) => handleFilterChange({ q })}
      />

      {/* Filter bar + view controls */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-200 flex-wrap">
        {/* Employer */}
        <select
          value={filters.employerId}
          onChange={(e) => handleFilterChange({ employerId: e.target.value })}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
        >
          <option value="">All companies</option>
          {employers.map((emp) => (
            <option key={emp.id} value={String(emp.id)}>
              {emp.name}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => handleFilterChange({ status: e.target.value as JobFilters['status'] })}
          className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
        >
          <option value="active">Active</option>
          <option value="removed">Removed</option>
          <option value="all">All</option>
        </select>

        {/* New only */}
        <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={filters.newOnly}
            onChange={(e) => handleFilterChange({ newOnly: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          New only
        </label>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Job count */}
        <span className="text-sm text-gray-400">
          {loading ? '…' : `${jobs.length} job${jobs.length !== 1 ? 's' : ''}`}
        </span>

        {/* View toggle */}
        <ViewToggle mode={viewMode} onChange={handleViewMode} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {loading && (
          <p className="p-8 text-center text-sm text-gray-400">Loading…</p>
        )}
        {!loading && error && (
          <p className="p-8 text-center text-sm text-red-500">{error}</p>
        )}
        {!loading && !error && jobs.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-400">No jobs found.</p>
        )}

        {!loading && !error && jobs.length > 0 && viewMode === 'card' && (
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedJobs.map((job) => (
              <JobCardLarge
                key={job.id}
                job={job}
                employer={employerMap.get(job.employerId)}
                onClick={() => setSelectedJob(job)}
              />
            ))}
          </div>
        )}

        {!loading && !error && jobs.length > 0 && viewMode === 'list' && (
          <div className="bg-white border border-gray-200 rounded-none sm:rounded-lg sm:m-4 overflow-hidden">
            {pagedJobs.map((job) => (
              <JobListRow
                key={job.id}
                job={job}
                employer={employerMap.get(job.employerId)}
                onClick={() => setSelectedJob(job)}
              />
            ))}
          </div>
        )}

        <Pagination page={page} totalPages={totalPages} onPage={setPage} />
      </div>

      {/* Job modal */}
      {selectedJob && (
        <JobModal
          job={selectedJob}
          employer={employerMap.get(selectedJob.employerId)}
          onClose={() => setSelectedJob(null)}
        />
      )}
    </div>
  )
}
