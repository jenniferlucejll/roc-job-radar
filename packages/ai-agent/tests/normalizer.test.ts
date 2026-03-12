import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizeJobPosting,
  parseSalaryRange,
  normalizeSalaryInput,
  type AiNormalizeOptions,
} from '../src/index.js'

describe('normalizeJobPosting', () => {
  const options: AiNormalizeOptions = {
    enabled: true,
    apiUrl: 'http://127.0.0.1:11434/api/chat',
    model: 'gemma3',
    timeoutMs: 1000,
    maxInputChars: 5000,
    requestMaxTokens: 1200,
    maxRetries: 1,
    retryBaseDelayMs: 10,
  }

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('builds deterministic JSON and normalizes known keys', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              salaryRaw: '$120000',
              salaryMin: '120000',
              salaryMax: '160000',
              salaryCurrency: 'USD',
              salaryPeriod: 'year',
              requirementsText: '3+ years of experience in TypeScript',
              responsibilitiesText: 'Build services and APIs',
              summaryText: 'Lead backend engineer role',
              normalizedDescriptionText: 'Normalized description',
            }),
          },
        }),
      }),
    )

    const result = await normalizeJobPosting(
      {
        title: 'Senior Backend Engineer',
        location: 'Rochester, NY',
        department: 'Engineering',
        salaryRaw: '$120,000 - $160,000/year',
        descriptionHtml: '<p>Build and maintain APIs for internal products.</p>',
      },
      options,
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        provider: 'ollama',
        model: 'gemma3',
        salaryRaw: '$120000',
        salaryMin: '120000',
        salaryMax: '160000',
        requirementsText: '3+ years of experience in TypeScript',
      },
    })
  })

  it('returns parse failure when response is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ message: { content: 'bad payload' } }),
      }),
    )

    const result = await normalizeJobPosting(
      {
        title: 'Role',
        descriptionHtml: '<p>stuff</p>',
      },
      options,
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('bad_schema')
    }
  })

  it('sanitizes unsafe HTML in model response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              requirementsHtml: '<script>alert("bad")</script><ul><li onmouseover="alert(1)">Safe requirement</li></ul>',
              responsibilitiesHtml: '<a href="javascript:alert(1)">click</a> then <em>act</em>',
              summaryText: 'Safe summary',
            }),
          },
        }),
      }),
    )

    const result = await normalizeJobPosting(
      {
        title: 'Role',
        descriptionHtml: '<p>Build with care.</p>',
      },
      options,
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.requirementsHtml).toBe('<ul><li>Safe requirement</li></ul>')
    expect(result.data.responsibilitiesHtml).toBe('click then <em>act</em>')
    expect(result.data.responsibilitiesHtml).not.toContain('javascript:')
    expect(result.data.responsibilitiesHtml).not.toContain('<a')
    expect(result.data.requirementsHtml).not.toContain('script')
    expect(result.data.requirementsHtml).not.toContain('onmouseover')
  })

  it('returns disabled result when AI is disabled', async () => {
    const result = await normalizeJobPosting(
      {
        title: 'Role',
        descriptionHtml: '<p>stuff</p>',
      },
      { ...options, enabled: false },
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('provider_unavailable')
    }
  })

  it('handles timeout behavior with retry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError')),
    )

    const result = await normalizeJobPosting(
      {
        title: 'Role',
        descriptionHtml: '<p>stuff</p>',
      },
      {
        ...options,
        maxRetries: 0,
      },
    )

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('timeout')
    }
  })
})

describe('parseSalaryRange', () => {
  it('extracts annual and hourly ranges', () => {
    expect(parseSalaryRange('$120,000 - $160,000 per year')).toEqual({
      min: '120000',
      max: '160000',
      currency: '$',
      period: 'year',
    })
    expect(parseSalaryRange('$60/hour')).toEqual({
      min: '60',
      max: '60',
      currency: '$',
      period: 'hour',
    })
  })
})

describe('normalizeSalaryInput', () => {
  it('cleans ranges and strips punctuation', () => {
    expect(normalizeSalaryInput('$95,000 - $120,000 /year')).toBe('95-120 year')
  })
})
