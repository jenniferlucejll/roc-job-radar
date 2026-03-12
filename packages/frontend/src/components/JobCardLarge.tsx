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

export function JobCardLarge({ job, employer, onClick }: Props) {
  const isRemoved = job.removedAt !== null

  return (
    <button
      onClick={onClick}
      className={`w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:shadow-sm transition-all flex flex-col gap-2 ${
        isRemoved ? 'opacity-50' : ''
      }`}
    >
      {/* Company */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full truncate">
          {employer?.name ?? 'Unknown'}
        </span>
        {isRemoved && (
          <span className="text-xs text-red-400 shrink-0">removed</span>
        )}
      </div>

      {/* Title */}
      <p className="text-sm font-semibold text-gray-900 leading-snug line-clamp-2">{job.title}</p>

      {/* Salary */}
      <p className="text-xs text-gray-500">
        {job.salaryRaw ?? <span className="text-gray-300">Salary not listed</span>}
      </p>

      {/* Description */}
      {job.descriptionHtml && (
        <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">
          {stripHtml(job.descriptionHtml)}
        </p>
      )}

      {/* Date found */}
      <p className="text-xs text-gray-400 mt-auto pt-1">Found {formatDate(job.firstSeenAt)}</p>
    </button>
  )
}
