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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" className="bg-white rounded-xl shadow-xl w-full max-w-2xl mb-16">
        {/* Modal header */}
        <div className="flex items-start justify-between gap-4 p-6 border-b border-gray-100">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-700 mb-1">
              {employer?.name ?? 'Unknown Company'}
            </p>
            <h2 className="text-lg font-semibold text-gray-900 leading-snug">{job.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-2 px-6 py-3 border-b border-gray-100">
          {job.salaryRaw && (
            <span className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-700">
              💰 {job.salaryRaw}
            </span>
          )}
          {job.location && (
            <span className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-700">
              📍 {job.location}
            </span>
          )}
          {job.remoteStatus && (
            <span className={`text-xs rounded px-2 py-1 font-medium ${REMOTE_COLOR[job.remoteStatus] ?? 'bg-gray-100 text-gray-600'}`}>
              {REMOTE_LABEL[job.remoteStatus] ?? job.remoteStatus}
            </span>
          )}
          {job.department && (
            <span className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-700">
              🏷 {job.department}
            </span>
          )}
          <span className="text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-500 ml-auto">
            Found {formatDate(job.firstSeenAt)}
          </span>
        </div>

        {/* Description */}
        <div className="px-6 py-4">
          {job.descriptionHtml ? (
            <div
              className="prose prose-sm max-w-none text-gray-700 [&>*:first-child]:mt-0"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(job.descriptionHtml) }}
            />
          ) : (
            <p className="text-sm text-gray-400">No description available.</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
          {job.removedAt && (
            <span className="text-xs text-red-500">
              Removed {formatDate(job.removedAt)}
            </span>
          )}
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            View posting
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  )
}
