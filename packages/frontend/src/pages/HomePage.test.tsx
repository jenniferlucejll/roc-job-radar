import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { HomePage } from './HomePage.js'
import type { Employer, Job } from '../types/index.js'

vi.mock('../api/client.js', () => ({
  fetchEmployers: vi.fn(),
  fetchJobs: vi.fn(),
}))

import { fetchEmployers, fetchJobs } from '../api/client.js'

const mockFetchEmployers = vi.mocked(fetchEmployers)
const mockFetchJobs = vi.mocked(fetchJobs)

function makeEmployer(id: number, name: string): Employer {
  return { id, key: name.toLowerCase(), name, careerUrl: 'https://example.com', atsType: 'workday', active: true, createdAt: '2026-01-01T00:00:00Z' }
}

function makeJob(id: number, overrides: Partial<Job> = {}): Job {
  return {
    id,
    employerId: 10,
    externalId: `ext-${id}`,
    title: `Job ${id}`,
    url: `https://example.com/job/${id}`,
    location: null,
    remoteStatus: null,
    department: null,
    descriptionHtml: null,
    salaryRaw: null,
    datePostedAt: null,
    firstSeenAt: `2026-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    lastSeenAt: `2026-01-${String(id).padStart(2, '0')}T00:00:00Z`,
    removedAt: null,
    ...overrides,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetchEmployers.mockResolvedValue([makeEmployer(10, 'Paychex')])
  mockFetchJobs.mockResolvedValue([makeJob(1), makeJob(2)])
})

// ─── Initial load ─────────────────────────────────────────────────────────────

describe('initial load', () => {
  it('shows jobs after load', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Job 1')).toBeInTheDocument()
      expect(screen.getByText('Job 2')).toBeInTheDocument()
    })
  })

  it('shows loading indicator while fetching', async () => {
    // Never resolve so loading state persists
    mockFetchJobs.mockReturnValue(new Promise(() => {}))
    renderPage()
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows error message when fetch fails', async () => {
    mockFetchJobs.mockRejectedValue(new Error('Network failure'))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('Network failure')).toBeInTheDocument()
    })
  })

  it('shows job count in filter bar', async () => {
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('2 jobs')).toBeInTheDocument()
    })
  })

  it('shows "No jobs found." when API returns empty array', async () => {
    mockFetchJobs.mockResolvedValue([])
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('No jobs found.')).toBeInTheDocument()
    })
  })
})

// ─── Sorting ──────────────────────────────────────────────────────────────────

describe('sorting', () => {
  it('displays jobs newest-first (highest firstSeenAt first)', async () => {
    const jobs = [
      makeJob(1, { firstSeenAt: '2026-01-01T00:00:00Z' }),
      makeJob(2, { firstSeenAt: '2026-01-03T00:00:00Z' }),
      makeJob(3, { firstSeenAt: '2026-01-02T00:00:00Z' }),
    ]
    mockFetchJobs.mockResolvedValue(jobs)
    renderPage()

    await waitFor(() => {
      const cards = screen.getAllByRole('button', { name: /Job \d/ })
      expect(cards[0]).toHaveTextContent('Job 2') // newest
      expect(cards[1]).toHaveTextContent('Job 3')
      expect(cards[2]).toHaveTextContent('Job 1') // oldest
    })
  })
})

// ─── Search ───────────────────────────────────────────────────────────────────

describe('search input', () => {
  it('triggers a new fetchJobs call with q param when user types', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByText('Job 1'))

    const input = screen.getByPlaceholderText('Job title, keywords, or company')
    await user.type(input, 'engineer')

    await waitFor(() => {
      const calls = mockFetchJobs.mock.calls
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall).toMatchObject({ q: 'engineer' })
    })
  })
})

// ─── Status filter ────────────────────────────────────────────────────────────

describe('status filter', () => {
  it('sends status=removed when "Removed" is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByText('Job 1'))

    const select = screen.getByDisplayValue('Active')
    await user.selectOptions(select, 'removed')

    await waitFor(() => {
      const calls = mockFetchJobs.mock.calls
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall).toMatchObject({ status: 'removed' })
    })
  })

  it('sends status=all when "All" is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByText('Job 1'))

    const select = screen.getByDisplayValue('Active')
    await user.selectOptions(select, 'all')

    await waitFor(() => {
      const calls = mockFetchJobs.mock.calls
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall).toMatchObject({ status: 'all' })
    })
  })
})

// ─── Employer filter ──────────────────────────────────────────────────────────

describe('employer filter', () => {
  it('sends employerId when an employer is selected', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByText('Job 1'))

    const select = screen.getByDisplayValue('All companies')
    await user.selectOptions(select, 'Paychex')

    await waitFor(() => {
      const calls = mockFetchJobs.mock.calls
      const lastCall = calls[calls.length - 1][0]
      expect(lastCall).toMatchObject({ employerId: '10' })
    })
  })
})

// ─── View toggle ─────────────────────────────────────────────────────────────

describe('view toggle', () => {
  it('switches from card to list view and resets to page 1', async () => {
    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByText('Job 1'))

    const listBtn = screen.getByTitle('List view')
    await user.click(listBtn)

    // In list view the jobs still appear (as rows)
    expect(screen.getByText('Job 1')).toBeInTheDocument()
  })

  it('resets to page 1 when switching view mode', async () => {
    // 25 jobs — exceeds both card (12/page) and list (20/page) sizes
    const jobs = Array.from({ length: 25 }, (_, i) => makeJob(i + 1, {
      firstSeenAt: `2026-01-${String(25 - i).padStart(2, '0')}T00:00:00Z`,
    }))
    mockFetchJobs.mockResolvedValue(jobs)

    const user = userEvent.setup()
    renderPage()
    await waitFor(() => screen.getByText('Page 1 of 3')) // 25 / 12 = 3 pages

    // Go to page 2 in card view
    await user.click(screen.getByText('Next →'))
    await waitFor(() => screen.getByText('Page 2 of 3'))

    // Switch to list view — page resets to 1 of 2 (25 / 20 = 2 pages)
    const listBtn = screen.getByTitle('List view')
    await user.click(listBtn)
    await waitFor(() => screen.getByText('Page 1 of 2'))
  })
})

// ─── Modal ────────────────────────────────────────────────────────────────────

describe('job modal', () => {
  it('opens modal when a job card is clicked', async () => {
    const user = userEvent.setup()
    mockFetchJobs.mockResolvedValue([makeJob(1, { title: 'Senior Engineer' })])
    renderPage()

    await waitFor(() => screen.getByText('Senior Engineer'))
    await user.click(screen.getByText('Senior Engineer'))

    // Modal shows job title as a heading
    const modal = screen.getByRole('dialog', { hidden: true })
    expect(within(modal).getByText('Senior Engineer')).toBeInTheDocument()
  })

  it('closes modal when X button is clicked', async () => {
    const user = userEvent.setup()
    mockFetchJobs.mockResolvedValue([makeJob(1, { title: 'Senior Engineer' })])
    renderPage()

    await waitFor(() => screen.getByText('Senior Engineer'))
    await user.click(screen.getByText('Senior Engineer'))
    await user.click(screen.getByLabelText('Close'))

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { hidden: true })).not.toBeInTheDocument()
    })
  })
})
