import type { Employer, Job } from '../types/index.js'
import { JobCard } from './JobCard.js'

interface Props {
  jobs: Job[]
  employers: Map<number, Employer>
  selectedId: number | null
  onSelect: (job: Job) => void
}

export function JobList({ jobs, employers, selectedId, onSelect }: Props) {
  if (jobs.length === 0) {
    return <p className="p-4 text-sm text-gray-400">No jobs match the current filters.</p>
  }

  return (
    <div>
      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          employer={employers.get(job.employerId)}
          selected={job.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}
