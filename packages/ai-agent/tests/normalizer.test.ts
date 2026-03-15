import { describe, it, expect } from 'vitest'
import { normalizeSalaryInput, parseSalaryRange } from '../src/index.js'

describe('parseSalaryRange', () => {
  it('extracts annual ranges', () => {
    expect(parseSalaryRange('$120,000 - $160,000 per year')).toEqual({
      min: '120000',
      max: '160000',
      currency: 'USD',
      period: 'year',
    })
  })

  it('extracts single-value hourly compensation', () => {
    expect(parseSalaryRange('$60/hour')).toEqual({
      min: '60',
      max: '60',
      currency: 'USD',
      period: 'hour',
    })
  })

  it('returns an empty object when no salary is present', () => {
    expect(parseSalaryRange('competitive compensation package')).toEqual({})
  })
})

describe('normalizeSalaryInput', () => {
  it('cleans salary ranges and period labels', () => {
    expect(normalizeSalaryInput('$95,000 - $120,000 /year')).toBe('95-120 year')
  })

  it('returns undefined when no numeric range exists', () => {
    expect(normalizeSalaryInput('competitive salary')).toBeUndefined()
  })
})
