import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchEmployers, fetchJobs, fetchJob, fetchScrapeStatus, setScheduledScrapingEnabled, triggerScrape, triggerTestScrape } from './client.js'

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
  })
}

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch([]))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ─── fetchEmployers ───────────────────────────────────────────────────────────

describe('fetchEmployers', () => {
  it('calls /api/employers without query string by default', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchEmployers()
    expect(spy).toHaveBeenCalledWith('/api/employers')
  })

  it('appends ?all=true when all=true', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchEmployers(true)
    expect(spy).toHaveBeenCalledWith('/api/employers?all=true')
  })

  it('returns parsed JSON array', async () => {
    const data = [{ id: 1, name: 'Paychex' }]
    vi.stubGlobal('fetch', mockFetch(data))
    const result = await fetchEmployers()
    expect(result).toEqual(data)
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch({ error: 'oops' }, 500))
    await expect(fetchEmployers()).rejects.toThrow('500')
  })
})

// ─── fetchJobs ────────────────────────────────────────────────────────────────

describe('fetchJobs', () => {
  it('calls /api/jobs with no params when filters are empty', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({})
    expect(spy).toHaveBeenCalledWith('/api/jobs')
  })

  it('omits status param when status is "active" (backend default)', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ status: 'active' })
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('status=')
  })

  it('includes status=removed when specified', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ status: 'removed' })
    expect(spy).toHaveBeenCalledWith('/api/jobs?status=removed')
  })

  it('includes status=all when specified', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ status: 'all' })
    expect(spy).toHaveBeenCalledWith('/api/jobs?status=all')
  })

  it('includes q param when query is non-empty', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ q: 'engineer' })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('q=engineer')
  })

  it('trims whitespace from q param', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ q: '  engineer  ' })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('q=engineer')
  })

  it('omits q param when empty string', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ q: '' })
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('q=')
  })

  it('omits q param when whitespace only', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ q: '   ' })
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('q=')
  })

  it('includes employerId param when set', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ employerId: '42' })
    expect(spy).toHaveBeenCalledWith('/api/jobs?employerId=42')
  })

  it('omits employerId param when empty string', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ employerId: '' })
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('employerId=')
  })

  it('includes new=true when newOnly is true', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ newOnly: true })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('new=true')
  })

  it('omits new param when newOnly is false', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ newOnly: false })
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('new=')
  })

  it('omits newHours when it is the default 168', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ newOnly: true, newHours: 168 })
    const url = spy.mock.calls[0][0] as string
    expect(url).not.toContain('newHours=')
  })

  it('includes newHours when non-default and newOnly=true', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ newOnly: true, newHours: 24 })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('newHours=24')
  })

  it('builds URL with multiple params correctly', async () => {
    const spy = mockFetch([])
    vi.stubGlobal('fetch', spy)
    await fetchJobs({ q: 'dev', status: 'all', employerId: '5' })
    const url = spy.mock.calls[0][0] as string
    expect(url).toContain('q=dev')
    expect(url).toContain('status=all')
    expect(url).toContain('employerId=5')
  })

  it('throws on non-OK response', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 404))
    await expect(fetchJobs({})).rejects.toThrow('404')
  })
})

// ─── fetchJob ─────────────────────────────────────────────────────────────────

describe('fetchJob', () => {
  it('calls /api/jobs/:id', async () => {
    const spy = mockFetch({ id: 7 })
    vi.stubGlobal('fetch', spy)
    await fetchJob(7)
    expect(spy).toHaveBeenCalledWith('/api/jobs/7')
  })

  it('throws on 404', async () => {
    vi.stubGlobal('fetch', mockFetch({}, 404))
    await expect(fetchJob(99)).rejects.toThrow('404')
  })
})

// ─── fetchScrapeStatus ────────────────────────────────────────────────────────

describe('fetchScrapeStatus', () => {
  it('uses default limit of 10', async () => {
    const spy = mockFetch({
      running: false,
      runId: null,
      lastStartedAt: null,
      lastResult: null,
      recentRuns: [],
      bootstrapState: 'ready',
      bootstrapMessage: null,
      scheduledScrapingEnabled: false,
      schedulerArmed: false,
      resetsOnRestart: true,
    })
    vi.stubGlobal('fetch', spy)
    await fetchScrapeStatus()
    expect(spy).toHaveBeenCalledWith('/api/scrape/status?limit=10')
  })

  it('passes custom limit', async () => {
    const spy = mockFetch({
      running: false,
      runId: null,
      lastStartedAt: null,
      lastResult: null,
      recentRuns: [],
      bootstrapState: 'ready',
      bootstrapMessage: null,
      scheduledScrapingEnabled: false,
      schedulerArmed: false,
      resetsOnRestart: true,
    })
    vi.stubGlobal('fetch', spy)
    await fetchScrapeStatus(25)
    expect(spy).toHaveBeenCalledWith('/api/scrape/status?limit=25')
  })
})

describe('setScheduledScrapingEnabled', () => {
  it('POSTs the new scheduled scraping state', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        scheduledScrapingEnabled: true,
        schedulerArmed: true,
        resetsOnRestart: true,
      }),
    })
    vi.stubGlobal('fetch', spy)
    await setScheduledScrapingEnabled(true)
    expect(spy).toHaveBeenCalledWith('/api/scrape/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"scheduledScrapingEnabled":true}',
    })
  })
})

// ─── triggerScrape ────────────────────────────────────────────────────────────

describe('triggerScrape', () => {
  it('POSTs to /api/scrape with no body when no employerKey given', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ started: true, runId: 'abc' }),
    })
    vi.stubGlobal('fetch', spy)
    await triggerScrape()
    expect(spy).toHaveBeenCalledWith('/api/scrape', { method: 'POST', headers: undefined, body: undefined })
  })

  it('POSTs with JSON body and Content-Type header when employerKey given', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ started: true, runId: 'run-paychex' }),
    })
    vi.stubGlobal('fetch', spy)
    await triggerScrape('paychex')
    expect(spy).toHaveBeenCalledWith('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"employerKey":"paychex"}',
    })
  })

  it('returns started=true and runId on 202', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ started: true, runId: 'xyz' }),
    }))
    const result = await triggerScrape()
    expect(result).toEqual({ started: true, runId: 'xyz' })
  })

  it('returns started=true and runId on 202 with employerKey', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ started: true, runId: 'run-wegmans' }),
    }))
    const result = await triggerScrape('wegmans')
    expect(result).toEqual({ started: true, runId: 'run-wegmans' })
  })

  it('returns started=false with empty runId on 409 (already running)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ started: false }),
    }))
    const result = await triggerScrape()
    expect(result).toEqual({ started: false, runId: '' })
  })

  it('returns started=false with empty runId on 409 when employerKey given', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ started: false }),
    }))
    const result = await triggerScrape('paychex')
    expect(result).toEqual({ started: false, runId: '' })
  })

  it('throws on other non-OK status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }))
    await expect(triggerScrape()).rejects.toThrow('500')
  })
})

describe('triggerTestScrape', () => {
  it('POSTs to /api/scrape/test with JSON body', async () => {
    const spy = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: () => Promise.resolve({ started: true, runId: 'test-paychex' }),
    })
    vi.stubGlobal('fetch', spy)
    await triggerTestScrape('paychex')
    expect(spy).toHaveBeenCalledWith('/api/scrape/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"employerKey":"paychex"}',
    })
  })

  it('returns started=false with empty runId on 409', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ started: false }),
    }))
    const result = await triggerTestScrape('wegmans')
    expect(result).toEqual({ started: false, runId: '' })
  })

  it('throws on other non-OK status codes', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    }))
    await expect(triggerTestScrape('paychex')).rejects.toThrow('500')
  })
})
