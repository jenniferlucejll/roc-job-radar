import { useEffect } from 'react'
import DOMPurify from 'dompurify'
import type { Employer, Job } from '../types/index.js'

interface Props {
  job: Job
  employer: Employer | undefined
  onClose: () => void
}

const REMOTE_LABEL: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
}

const REMOTE_COLOR: Record<string, string> = {
  remote: 'bg-green-100 text-green-700',
  hybrid: 'bg-yellow-100 text-yellow-700',
  onsite: 'bg-gray-100 text-gray-600',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function JobModal({ job, employer, onClose }: Props) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-full w-full flex-col bg-white shadow-xl"
      >
        <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
          <div className="flex items-start justify-between gap-4 px-5 py-5 sm:px-8">
            <div className="min-w-0 flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                {employer?.name ?? 'Unknown Company'}
              </p>
              <h2 className="text-xl font-semibold leading-snug text-gray-900 sm:text-2xl">{job.title}</h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 px-5 py-3 sm:px-8">
            <span className="rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              ID {job.externalId}
            </span>
            {job.salaryRaw && (
              <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                💰 {job.salaryRaw}
              </span>
            )}
            {job.location && (
              <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                📍 {job.location}
              </span>
            )}
            {job.remoteStatus && (
              <span className={`rounded px-2.5 py-1 text-xs font-medium ${REMOTE_COLOR[job.remoteStatus] ?? 'bg-gray-100 text-gray-600'}`}>
                {REMOTE_LABEL[job.remoteStatus] ?? job.remoteStatus}
              </span>
            )}
            {job.department && (
              <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-700">
                🏷 {job.department}
              </span>
            )}
            <span className="rounded border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-500">
              Found {formatDate(job.firstSeenAt)}
            </span>
            {job.removedAt && (
              <span className="rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs text-red-600">
                Removed {formatDate(job.removedAt)}
              </span>
            )}
            <a
              href={job.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              View posting
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
          <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 sm:py-8">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm sm:p-8">
              {job.descriptionHtml ? (
                <div
                  className="prose prose-sm max-w-none text-gray-700 [&>*:first-child]:mt-0"
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.descriptionHtml) }}
                />
              ) : (
                <p className="text-sm text-gray-400">No description available.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
