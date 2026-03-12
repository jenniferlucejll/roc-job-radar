import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { JobModal } from './JobModal.js'
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
    externalId: 'ext-1',
    title: 'Senior Engineer',
    url: 'https://example.com/job/1',
    location: 'Rochester, NY',
    remoteStatus: 'hybrid',
    department: 'Engineering',
    descriptionHtml: '<p>Great job opportunity.</p>',
    salaryRaw: '$120k–$150k',
    datePostedAt: null,
    firstSeenAt: '2026-01-15T00:00:00Z',
    lastSeenAt: '2026-01-15T00:00:00Z',
    removedAt: null,
    ...overrides,
  }
}

describe('JobModal', () => {
  it('renders company name', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('Paychex')).toBeInTheDocument()
  })

  it('renders job title', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('renders salary when present', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('💰 $120k–$150k')).toBeInTheDocument()
  })

  it('renders location when present', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('📍 Rochester, NY')).toBeInTheDocument()
  })

  it('renders remote status badge', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('Hybrid')).toBeInTheDocument()
  })

  it('renders description HTML', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('Great job opportunity.')).toBeInTheDocument()
  })

  it('shows "No description available." when descriptionHtml is null', () => {
    render(<JobModal job={makeJob({ descriptionHtml: null })} employer={employer} onClose={vi.fn()} />)
    expect(screen.getByText('No description available.')).toBeInTheDocument()
  })

  it('shows "Unknown Company" when employer is undefined', () => {
    render(<JobModal job={makeJob()} employer={undefined} onClose={vi.fn()} />)
    expect(screen.getByText('Unknown Company')).toBeInTheDocument()
  })

  it('shows removed date when removedAt is set', () => {
    render(
      <JobModal
        job={makeJob({ removedAt: '2026-02-01T00:00:00Z' })}
        employer={employer}
        onClose={vi.fn()}
      />,
    )
    expect(screen.getByText(/Removed/)).toBeInTheDocument()
  })

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<JobModal job={makeJob()} employer={employer} onClose={onClose} />)
    await user.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape key is pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<JobModal job={makeJob()} employer={employer} onClose={onClose} />)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('has a "View posting" link pointing to job URL', () => {
    render(<JobModal job={makeJob()} employer={employer} onClose={vi.fn()} />)
    const link = screen.getByRole('link', { name: /View posting/i })
    expect(link).toHaveAttribute('href', 'https://example.com/job/1')
    expect(link).toHaveAttribute('target', '_blank')
  })
})
