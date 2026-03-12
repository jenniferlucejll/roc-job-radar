import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchEmployers, fetchJobs, fetchScrapeStatus, triggerScrape } from '../api/client.js'
import type { Employer, ScrapeEmployerSummary, ScrapeRunSummary, ScrapeStatusResponse } from '../types/index.js'

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  partial_error: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
  error: 'bg-red-100 text-red-700',
  missing_adapter: 'bg-orange-100 text-orange-700',
  robots_blocked: 'bg-yellow-100 text-yellow-700',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function EmployerDetail({ emp }: { emp: ScrapeEmployerSummary }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3 py-2 px-0">
        <span className="text-sm text-gray-700 font-medium w-36 shrink-0">{emp.employerName}</span>
        <StatusBadge status={emp.status} />
        <span className="text-xs text-gray-500 ml-2">
          <span className="text-green-600">+{emp.jobsInserted}</span>
          {' / '}
          <span>{emp.jobsUpdated}</span>
          {' / '}
          <span className="text-red-500">-{emp.jobsRemoved}</span>
        </span>
        {emp.errors.length > 0 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-auto text-xs text-red-500 hover:underline"
          >
            {emp.errors.length} error{emp.errors.length !== 1 ? 's' : ''} {expanded ? '▲' : '▼'}
          </button>
        )}
      </div>
      {expanded && emp.errors.length > 0 && (
        <div className="pb-2 pl-0 space-y-1">
          {emp.errors.map((e, i) => (
            <div key={i} className="text-xs bg-red-50 border border-red-100 rounded p-2">
              <span className="font-medium text-red-700">{e.errorType}</span>
              <span className="text-red-600 ml-2">{e.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function AdminPage() {
  const [scrapeStatus, setScrapeStatus] = useState<ScrapeStatusResponse | null>(null)
  const [employers, setEmployers] = useState<Employer[]>([])
  const [jobStats, setJobStats] = useState<{ active: number; newThisWeek: number; removed: number } | null>(null)
  const [triggering, setTriggering] = useState(false)
  const wasRunning = useRef(false)

  const refreshStatus = useCallback(() => {
    fetchScrapeStatus(20)
      .then((s) => {
        wasRunning.current = s.running
        setScrapeStatus(s)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshStatus()
    fetchEmployers(true).then(setEmployers).catch(() => {})

    // Job stats: active count + new this week + removed count
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    Promise.all([
      fetchJobs({ status: 'active' }),
      fetchJobs({ status: 'all' }),
    ])
      .then(([active, all]) => {
        const newThisWeek = all.filter((j) => j.firstSeenAt >= weekAgo && j.removedAt === null).length
        const removed = all.filter((j) => j.removedAt !== null).length
        setJobStats({ active: active.length, newThisWeek, removed })
      })
      .catch(() => {})
  }, [refreshStatus])

  // Poll while running
  useEffect(() => {
    const interval = setInterval(refreshStatus, scrapeStatus?.running ? 5_000 : 30_000)
    return () => clearInterval(interval)
  }, [refreshStatus, scrapeStatus?.running])

  async function handleRunNow() {
    setTriggering(true)
    try {
      await triggerScrape()
      refreshStatus()
    } finally {
      setTriggering(false)
    }
  }

  const running = scrapeStatus?.running ?? false
  const last = scrapeStatus?.lastResult

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Scrape Control */}
        <SectionCard title="Scrape Control">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${running ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
              <span className="text-sm text-gray-700">
                {running
                  ? 'Scrape in progress…'
                  : scrapeStatus?.lastStartedAt
                  ? `Last run ${formatDateTime(scrapeStatus.lastStartedAt)}`
                  : 'Never run'}
              </span>
              {last && !running && <StatusBadge status={last.status} />}
            </div>
            <button
              onClick={handleRunNow}
              disabled={running || triggering}
              className="ml-auto px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {running ? 'Running…' : 'Run Scrape Now'}
            </button>
          </div>
          {last && (
            <div className="flex gap-6 mt-4 text-sm text-gray-600">
              <span><span className="text-green-600 font-semibold">+{last.jobsInserted}</span> inserted</span>
              <span><span className="font-semibold">{last.jobsUpdated}</span> updated</span>
              <span><span className="text-red-500 font-semibold">-{last.jobsRemoved}</span> removed</span>
              <span className="text-gray-400">{formatDuration(last.durationMs)}</span>
              {last.errors > 0 && (
                <span className="text-red-500">{last.errors} error{last.errors !== 1 ? 's' : ''}</span>
              )}
            </div>
          )}
        </SectionCard>

        {/* Job Stats */}
        {jobStats && (
          <SectionCard title="Job Stats">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">{jobStats.active}</p>
                <p className="text-xs text-gray-500 mt-1">Active jobs</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">{jobStats.newThisWeek}</p>
                <p className="text-xs text-gray-500 mt-1">New this week</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-red-400">{jobStats.removed}</p>
                <p className="text-xs text-gray-500 mt-1">Removed (total)</p>
              </div>
            </div>
          </SectionCard>
        )}

        {/* Recent Runs */}
        <SectionCard title="Recent Scrape Runs">
          {!scrapeStatus || scrapeStatus.recentRuns.length === 0 ? (
            <p className="text-sm text-gray-400">No runs yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="pb-2 pr-4 font-medium">Status</th>
                    <th className="pb-2 pr-4 font-medium">Started</th>
                    <th className="pb-2 pr-4 font-medium">Duration</th>
                    <th className="pb-2 pr-4 font-medium">Employers</th>
                    <th className="pb-2 pr-4 font-medium">Inserted</th>
                    <th className="pb-2 pr-4 font-medium">Updated</th>
                    <th className="pb-2 pr-4 font-medium">Removed</th>
                    <th className="pb-2 font-medium">Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapeStatus.recentRuns.map((run: ScrapeRunSummary) => (
                    <tr key={run.runId} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2 pr-4"><StatusBadge status={run.status} /></td>
                      <td className="py-2 pr-4 text-gray-600">{formatDateTime(run.startedAt)}</td>
                      <td className="py-2 pr-4 text-gray-500">{formatDuration(run.durationMs)}</td>
                      <td className="py-2 pr-4 text-gray-600">{run.employersRun}</td>
                      <td className="py-2 pr-4 text-green-600">+{run.jobsInserted}</td>
                      <td className="py-2 pr-4 text-gray-600">{run.jobsUpdated}</td>
                      <td className="py-2 pr-4 text-red-500">-{run.jobsRemoved}</td>
                      <td className="py-2">
                        {run.errors > 0
                          ? <span className="text-red-500">{run.errors}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* Last Run Employer Detail */}
        {last && last.employers.length > 0 && (
          <SectionCard title="Last Run — Per Employer">
            {last.employers.map((emp) => (
              <EmployerDetail key={emp.employerId} emp={emp} />
            ))}
          </SectionCard>
        )}

        {/* Employers */}
        <SectionCard title="Employers">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-2 pr-4 font-medium">Name</th>
                  <th className="pb-2 pr-4 font-medium">ATS Type</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 font-medium">Career URL</th>
                </tr>
              </thead>
              <tbody>
                {employers.map((emp) => (
                  <tr key={emp.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium text-gray-800">{emp.name}</td>
                    <td className="py-2 pr-4 text-gray-500">{emp.atsType}</td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${emp.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {emp.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="py-2">
                      <a
                        href={emp.careerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs truncate max-w-xs block"
                      >
                        {emp.careerUrl}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

      </div>
    </div>
  )
}
