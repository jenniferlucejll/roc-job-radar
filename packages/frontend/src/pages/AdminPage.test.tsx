import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AdminPage } from './AdminPage.js'
import type { Employer, Job, ScrapeStatusResponse } from '../types/index.js'

vi.mock('../api/client.js', () => ({
  fetchEmployers: vi.fn(),
  fetchJobs: vi.fn(),
  fetchScrapeStatus: vi.fn(),
  setScheduledScrapingEnabled: vi.fn(),
  triggerScrape: vi.fn(),
  triggerTestScrape: vi.fn(),
}))

import {
  fetchEmployers,
  fetchJobs,
  fetchScrapeStatus,
  setScheduledScrapingEnabled,
  triggerScrape,
  triggerTestScrape,
} from '../api/client.js'

const mockFetchEmployers = vi.mocked(fetchEmployers)
const mockFetchJobs = vi.mocked(fetchJobs)
const mockFetchScrapeStatus = vi.mocked(fetchScrapeStatus)
const mockSetScheduledScrapingEnabled = vi.mocked(setScheduledScrapingEnabled)
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
    scheduledScrapingEnabled: false,
    schedulerArmed: false,
    resetsOnRestart: true,
    bootstrapState: 'ready',
    bootstrapMessage: null,
  }
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  )
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockFetchEmployers.mockResolvedValue([makeEmployer()])
  mockFetchJobs
    .mockResolvedValueOnce([makeJob(1), makeJob(2)])
    .mockResolvedValueOnce([makeJob(1), makeJob(2), makeJob(3, '2026-03-11T00:00:00.000Z')])
  mockFetchScrapeStatus.mockResolvedValue(makeStatus())
  mockSetScheduledScrapingEnabled.mockResolvedValue({
    scheduledScrapingEnabled: true,
    schedulerArmed: true,
    resetsOnRestart: true,
  })
  mockTriggerScrape.mockResolvedValue({ started: true, runId: 'run-normal-2' })
  mockTriggerTestScrape.mockResolvedValue({ started: true, runId: 'run-test-2' })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AdminPage', () => {
  it('renders a test scrape action for each employer', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Test Scrape (3)' })).toBeInTheDocument()
    })
  })

  it('renders scheduled scraping as disabled by default with reset messaging', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Scheduled scraping disabled')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Enable Scheduled Scraping' })).toBeInTheDocument()
    expect(screen.getByText('Scheduled scraping resets to disabled whenever the backend restarts.')).toBeInTheDocument()
    expect(screen.getByText('This controls cron-triggered scraping only. Manual admin scrapes remain available.')).toBeInTheDocument()
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

  it('allows enabling scheduled scraping from the admin page', async () => {
    const user = userEvent.setup()
    renderPage()

    const button = await screen.findByRole('button', { name: 'Enable Scheduled Scraping' })
    await user.click(button)

    await waitFor(() => {
      expect(mockSetScheduledScrapingEnabled).toHaveBeenCalledWith(true)
    })
  })

  it('disables admin scrape controls until scrape status is loaded', async () => {
    const statusRequest = deferred<ScrapeStatusResponse>()
    mockFetchScrapeStatus.mockReturnValueOnce(statusRequest.promise)

    renderPage()

    expect(screen.getByText('Checking backend bootstrap status before enabling admin scrape controls.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enable Scheduled Scraping' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run Scrape Now' })).toBeDisabled()
    expect(await screen.findByRole('button', { name: 'Scrape' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Test Scrape (3)' })).toBeDisabled()

    statusRequest.resolve(makeStatus())

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Enable Scheduled Scraping' })).toBeEnabled()
    })
  })

  it('keeps admin scrape controls disabled while bootstrap is still in progress', async () => {
    mockFetchScrapeStatus.mockResolvedValueOnce({
      ...makeStatus(),
      bootstrapState: 'migrating',
      bootstrapMessage: 'Database migrations are still being applied. Scrape status will be available shortly.',
    })

    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Database migrations are still being applied. Scrape status will be available shortly.')).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: 'Enable Scheduled Scraping' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Run Scrape Now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Scrape' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Test Scrape (3)' })).toBeDisabled()
  })

  it('retries employers and job stats after bootstrap completes without a page refresh', async () => {
    const statusRequest = deferred<ScrapeStatusResponse>()
    mockFetchScrapeStatus.mockReturnValueOnce(statusRequest.promise)
    mockFetchEmployers.mockRejectedValueOnce(new Error('schema not ready'))
    mockFetchJobs
      .mockRejectedValueOnce(new Error('schema not ready'))
      .mockRejectedValueOnce(new Error('schema not ready'))
      .mockResolvedValueOnce([makeJob(1), makeJob(2)])
      .mockResolvedValueOnce([makeJob(1), makeJob(2), makeJob(3, '2026-03-11T00:00:00.000Z')])

    renderPage()

    expect(screen.getByText('Checking backend bootstrap status before enabling admin scrape controls.')).toBeInTheDocument()

    statusRequest.resolve(makeStatus())

    await waitFor(() => {
      expect(mockFetchEmployers).toHaveBeenCalledTimes(2)
      expect(mockFetchJobs).toHaveBeenCalledTimes(4)
      expect(screen.getByText('Active jobs')).toBeInTheDocument()
      expect(screen.getAllByText('Paychex').length).toBeGreaterThan(0)
    })
  })
})
