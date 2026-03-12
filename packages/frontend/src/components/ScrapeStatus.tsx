import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchScrapeStatus, triggerScrape } from '../api/client.js'
import type { ScrapeRunSummary, ScrapeStatusResponse } from '../types/index.js'

interface Props {
  onScrapeComplete: () => void
}

const STATUS_COLOR: Record<string, string> = {
  running: 'bg-blue-100 text-blue-700',
  success: 'bg-green-100 text-green-700',
  partial_error: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function RunRow({ run }: { run: ScrapeRunSummary }) {
  return (
    <tr className="text-xs border-t border-gray-100">
      <td className="py-1 pr-3">
        <span className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[run.status] ?? 'bg-gray-100 text-gray-600'}`}>
          {run.status}
        </span>
      </td>
      <td className="py-1 pr-3 text-gray-500">{formatTime(run.startedAt)}</td>
      <td className="py-1 pr-3 text-gray-500">{formatDuration(run.durationMs)}</td>
      <td className="py-1 pr-3">
        <span className="text-green-600">+{run.jobsInserted}</span>
        {' / '}
        <span className="text-gray-600">{run.jobsUpdated}</span>
        {' / '}
        <span className="text-red-500">-{run.jobsRemoved}</span>
      </td>
      {run.errors > 0 && (
        <td className="py-1 text-red-500">{run.errors} err</td>
      )}
    </tr>
  )
}

export function ScrapeStatus({ onScrapeComplete }: Props) {
  const [status, setStatus] = useState<ScrapeStatusResponse | null>(null)
  const [triggering, setTriggering] = useState(false)
  const [open, setOpen] = useState(false)
  const wasRunning = useRef(false)

  const refresh = useCallback(() => {
    fetchScrapeStatus(10)
      .then((s) => {
        if (wasRunning.current && !s.running) {
          onScrapeComplete()
        }
        wasRunning.current = s.running
        setStatus(s)
      })
      .catch(() => {})
  }, [onScrapeComplete])

  // Poll every 5s while running, every 30s otherwise
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, status?.running ? 5_000 : 30_000)
    return () => clearInterval(id)
  }, [refresh, status?.running])

  async function handleRunNow() {
    setTriggering(true)
    try {
      await triggerScrape()
      refresh()
    } finally {
      setTriggering(false)
    }
  }

  const running = status?.running ?? false
  const last = status?.lastResult

  return (
    <div className="border-t border-gray-200 bg-white shrink-0">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-4 py-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
        >
          <span className={`w-2 h-2 rounded-full ${running ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
          <span>{running ? 'Scraping…' : last ? `Last run ${formatTime(last.startedAt)}` : 'Never run'}</span>
          {last && !running && (
            <span className={`px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLOR[last.status] ?? 'bg-gray-100 text-gray-600'}`}>
              {last.status}
            </span>
          )}
          <span className="text-gray-400">{open ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={handleRunNow}
          disabled={running || triggering}
          className="ml-auto text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? 'Running…' : 'Run now'}
        </button>
      </div>

      {/* Expanded panel */}
      {open && (
        <div className="px-4 pb-3 border-t border-gray-100">
          {last && (
            <div className="flex gap-4 text-xs text-gray-600 py-2">
              <span><span className="text-green-600 font-medium">+{last.jobsInserted}</span> new</span>
              <span><span className="font-medium">{last.jobsUpdated}</span> updated</span>
              <span><span className="text-red-500 font-medium">-{last.jobsRemoved}</span> removed</span>
              <span className="ml-auto">{formatDuration(last.durationMs)}</span>
            </div>
          )}
          {status && status.recentRuns.length > 0 && (
            <table className="w-full">
              <tbody>
                {status.recentRuns.map((r) => (
                  <RunRow key={r.runId} run={r} />
                ))}
              </tbody>
            </table>
          )}
          {status && status.recentRuns.length === 0 && (
            <p className="text-xs text-gray-400 py-1">No runs yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
