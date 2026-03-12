import type { Employer, Job } from '../types/index.js'

interface Props {
  job: Job
  employer: Employer | null
  onClose: () => void
}

const REMOTE_LABEL: Record<string, string> = {
  remote: 'Remote',
  hybrid: 'Hybrid',
  onsite: 'On-site',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function JobDetail({ job, employer, onClose }: Props) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-semibold leading-snug">{job.title}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {employer?.name ?? `Employer ${job.employerId}`}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none shrink-0 mt-1"
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {/* Meta */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-6">
        {job.location && (
          <>
            <dt className="text-gray-500">Location</dt>
            <dd>{job.location}</dd>
          </>
        )}
        {job.remoteStatus && (
          <>
            <dt className="text-gray-500">Work type</dt>
            <dd>{REMOTE_LABEL[job.remoteStatus] ?? job.remoteStatus}</dd>
          </>
        )}
        {job.department && (
          <>
            <dt className="text-gray-500">Department</dt>
            <dd>{job.department}</dd>
          </>
        )}
        {job.salaryRaw && (
          <>
            <dt className="text-gray-500">Salary</dt>
            <dd>{job.salaryRaw}</dd>
          </>
        )}
        <dt className="text-gray-500">First seen</dt>
        <dd>{formatDate(job.firstSeenAt)}</dd>
        <dt className="text-gray-500">Last seen</dt>
        <dd>{formatDate(job.lastSeenAt)}</dd>
        {job.datePostedAt && (
          <>
            <dt className="text-gray-500">Posted</dt>
            <dd>{formatDate(job.datePostedAt)}</dd>
          </>
        )}
        {job.removedAt && (
          <>
            <dt className="text-gray-500 text-red-400">Removed</dt>
            <dd className="text-red-500">{formatDate(job.removedAt)}</dd>
          </>
        )}
      </dl>

      <a
        href={job.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block mb-6 text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
      >
        View posting ↗
      </a>

      {job.descriptionHtml && (
        <div className="border-t border-gray-200 pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Description</h3>
          <div
            className="prose prose-sm max-w-none text-gray-700"
            /* eslint-disable-next-line react/no-danger */
            dangerouslySetInnerHTML={{ __html: job.descriptionHtml }}
          />
        </div>
      )}
    </div>
  )
}
