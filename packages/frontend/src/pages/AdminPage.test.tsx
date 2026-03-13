import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminPage } from './AdminPage.js'
import type { Employer, Job, ScrapeStatusResponse } from '../types/index.js'

vi.mock('../api/client.js', () => ({
  fetchEmployers: vi.fn(),
  fetchJobs: vi.fn(),
  fetchScrapeStatus: vi.fn(),
  triggerScrape: vi.fn(),
  triggerTestScrape: vi.fn(),
}))

import {
  fetchEmployers,
  fetchJobs,
  fetchScrapeStatus,
  triggerScrape,
  triggerTestScrape,
} from '../api/client.js'

const mockFetchEmployers = vi.mocked(fetchEmployers)
const mockFetchJobs = vi.mocked(fetchJobs)
const mockFetchScrapeStatus = vi.mocked(fetchScrapeStatus)
const mockTriggerScrape = vi.mocked(triggerScrape)
const mockTriggerTestScrape = vi.mocked(triggerTestScrape)

function makeEmployer(): Employer {
  return {
    id: 1,
    key: 'paychex',
    name: 'Paychex',
    careerUrl: 'https://example.com/careers',
    atsType: 'workday',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function makeJob(id: number, removedAt: string | null = null): Job {
  return {
    id,
    employerId: 1,
    externalId: `ext-${id}`,
    title: `Job ${id}`,
    url: `https://example.com/jobs/${id}`,
    location: null,
    remoteStatus: null,
    department: null,
    descriptionHtml: null,
    salaryRaw: null,
    datePostedAt: null,
    firstSeenAt: '2026-03-10T00:00:00.000Z',
    lastSeenAt: '2026-03-10T00:00:00.000Z',
    removedAt,
  }
}

function makeStatus(): ScrapeStatusResponse {
  return {
    running: false,
    runId: 'run-normal-1',
    lastStartedAt: '2026-03-12T12:00:00.000Z',
    lastResult: {
      runId: 'run-normal-1',
      runType: 'normal',
      status: 'success',
      startedAt: '2026-03-12T12:00:00.000Z',
      finishedAt: '2026-03-12T12:01:00.000Z',
      durationMs: 60_000,
      employersRun: 1,
      jobsInserted: 2,
      jobsUpdated: 1,
      jobsRemoved: 0,
      errors: 0,
      requestAttempts: 4,
      retryAttempts: 1,
      openErrors: 0,
      employers: [{
        employerId: 1,
        employerKey: 'paychex',
        employerName: 'Paychex',
        status: 'success',
        jobsScraped: 3,
        jobsFiltered: 3,
        jobsInserted: 2,
        jobsUpdated: 1,
        jobsRemoved: 0,
        requestAttempts: 4,
        retryAttempts: 1,
        unresolvedErrors: 0,
        errors: [],
      }],
    },
    recentRuns: [
      {
        runId: 'run-normal-1',
        runType: 'normal',
        status: 'success',
        startedAt: '2026-03-12T12:00:00.000Z',
        finishedAt: '2026-03-12T12:01:00.000Z',
        durationMs: 60_000,
        employersRun: 1,
        jobsInserted: 2,
        jobsUpdated: 1,
        jobsRemoved: 0,
        errors: 0,
        requestAttempts: 4,
        retryAttempts: 1,
        openErrors: 0,
      },
      {
        runId: 'run-test-1',
        runType: 'test',
        status: 'success',
        startedAt: '2026-03-12T13:00:00.000Z',
        finishedAt: '2026-03-12T13:00:20.000Z',
        durationMs: 20_000,
        employersRun: 1,
        jobsInserted: 1,
        jobsUpdated: 2,
        jobsRemoved: 0,
        errors: 0,
        requestAttempts: 2,
        retryAttempts: 0,
        openErrors: 0,
      },
    ],
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockFetchEmployers.mockResolvedValue([makeEmployer()])
  mockFetchJobs
    .mockResolvedValueOnce([makeJob(1), makeJob(2)])
    .mockResolvedValueOnce([makeJob(1), makeJob(2), makeJob(3, '2026-03-11T00:00:00.000Z')])
  mockFetchScrapeStatus.mockResolvedValue(makeStatus())
  mockTriggerScrape.mockResolvedValue({ started: true, runId: 'run-normal-2' })
  mockTriggerTestScrape.mockResolvedValue({ started: true, runId: 'run-test-2' })
})

describe('AdminPage', () => {
  it('renders a test scrape action for each employer', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test Scrape (3)' })).toBeInTheDocument()
    })
  })

  it('splits normal runs and test runs into separate sections', async () => {
    renderPage()

    const normalSection = await screen.findByText('Recent Scrape Runs')
    const testSection = await screen.findByText('Recent Test Scrapes')

    const normalCard = normalSection.closest('div')?.parentElement
    const testCard = testSection.closest('div')?.parentElement

    expect(within(normalCard as HTMLElement).getByText('normal')).toBeInTheDocument()
    expect(within(normalCard as HTMLElement).getByText('+2')).toBeInTheDocument()
    expect(within(testCard as HTMLElement).getByText('test')).toBeInTheDocument()
    expect(within(testCard as HTMLElement).getByText('+1')).toBeInTheDocument()
  })

  it('triggers the test scrape endpoint from the employer action', async () => {
    const user = userEvent.setup()
    renderPage()

    const button = await screen.findByRole('button', { name: 'Test Scrape (3)' })
    await user.click(button)

    await waitFor(() => {
      expect(mockTriggerTestScrape).toHaveBeenCalledWith('paychex')
    })
  })
})
