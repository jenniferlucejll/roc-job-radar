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
      className={`w-full text-left bg-white border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300 hover:shadow-sm transition-all flex flex-col gap-2 ${
        isRemoved ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-3 bg-blue-600 px-4 py-2.5 text-white">
        <span className="min-w-0 truncate text-xs font-semibold tracking-[0.02em]">
          {employer?.name ?? 'Unknown'}
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-blue-100">
            ID {job.externalId}
          </span>
          {isRemoved && (
            <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-red-100">
              Removed
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4 pt-0">
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
      </div>
    </button>
  )
}
