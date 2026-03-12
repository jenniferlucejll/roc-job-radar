import type { Employer, Job } from '../types/index.js'

interface Props {
  job: Job
  employer: Employer | undefined
  onClick: () => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export function JobListRow({ job, employer, onClick }: Props) {
  const isRemoved = job.removedAt !== null

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border-b border-gray-100 px-4 py-3 hover:bg-blue-50 transition-colors flex items-start gap-4 ${
        isRemoved ? 'opacity-50' : ''
      }`}
    >
      {/* Company */}
      <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full shrink-0 mt-0.5">
        {employer?.name ?? 'Unknown'}
      </span>

      {/* Title + description */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
        {job.descriptionHtml && (
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {stripHtml(job.descriptionHtml)}
          </p>
        )}
      </div>

      {/* Salary */}
      <span className="text-xs text-gray-500 shrink-0 hidden sm:block">
        {job.salaryRaw ?? '—'}
      </span>

      {/* Date */}
      <span className="text-xs text-gray-400 shrink-0">{formatDate(job.firstSeenAt)}</span>
    </button>
  )
}
