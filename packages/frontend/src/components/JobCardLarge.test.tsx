import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JobCardLarge } from './JobCardLarge.js'
import type { Employer, Job } from '../types/index.js'

const employer: Employer = {
  id: 10,
  key: 'paychex',
  name: 'Paychex',
  careerUrl: 'https://paychex.com/careers',
  atsType: 'workday',
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
}

function makeJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 1,
    employerId: 10,
    externalId: 'REQ-12345',
    title: 'Senior Engineer',
    url: 'https://example.com/job/1',
    location: 'Rochester, NY',
    remoteStatus: 'hybrid',
    department: 'Engineering',
    descriptionHtml: '<p>Great job opportunity.</p>',
    salaryRaw: '$120k-$150k',
    datePostedAt: null,
    firstSeenAt: '2026-01-15T00:00:00Z',
    lastSeenAt: '2026-01-15T00:00:00Z',
    removedAt: null,
    ...overrides,
  }
}

describe('JobCardLarge', () => {
  it('renders company name and generic ID label in the header', () => {
    render(<JobCardLarge job={makeJob()} employer={employer} onClick={vi.fn()} />)

    expect(screen.getByText('Paychex')).toBeInTheDocument()
    expect(screen.getByText('ID REQ-12345')).toBeInTheDocument()
  })

  it('calls onClick when the card is pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(<JobCardLarge job={makeJob()} employer={employer} onClick={onClick} />)

    await user.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows removed state in the header when removedAt is set', () => {
    render(
      <JobCardLarge
        job={makeJob({ removedAt: '2026-02-01T00:00:00Z' })}
        employer={employer}
        onClick={vi.fn()}
      />,
    )

    expect(screen.getByText('Removed')).toBeInTheDocument()
  })
})
