import type { Employer, Job } from '../types/index.js'

interface Props {
  job: Job
  employer: Employer | undefined
  selected: boolean
  onSelect: (job: Job) => void
}

const REMOTE_BADGE: Record<string, string> = {
  remote: 'bg-green-100 text-green-700',
  hybrid: 'bg-yellow-100 text-yellow-700',
  onsite: 'bg-gray-100 text-gray-600',
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function JobCard({ job, employer, selected, onSelect }: Props) {
  return (
    <button
      onClick={() => onSelect(job)}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        selected ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
      } ${job.removedAt ? 'opacity-60' : ''}`}
    >
      <p className="text-sm font-medium leading-snug line-clamp-2">{job.title}</p>
      <p className="text-xs text-gray-500 mt-0.5">{employer?.name ?? `Employer ${job.employerId}`}</p>
      <div className="flex items-center gap-2 mt-1 flex-wrap">
        {job.location && (
          <span className="text-xs text-gray-400 truncate max-w-[140px]">{job.location}</span>
        )}
        {job.remoteStatus && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${REMOTE_BADGE[job.remoteStatus] ?? 'bg-gray-100 text-gray-600'}`}>
            {job.remoteStatus}
          </span>
        )}
        <span className="text-xs text-gray-400 ml-auto shrink-0">
          {relativeDate(job.firstSeenAt)}
        </span>
      </div>
    </button>
  )
}
