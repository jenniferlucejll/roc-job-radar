export interface ParsedSalaryResult {
  min?: string
  max?: string
  currency?: string
  period?: string
}

function parseCurrency(raw?: string | null): string | undefined {
  if (!raw) return undefined

  const normalized = raw.trim().toUpperCase()
  if (normalized === '$') return 'USD'
  if (normalized === '£') return 'GBP'
  if (normalized === '€') return 'EUR'
  if (normalized === 'USD' || normalized === 'CAD' || normalized === 'EUR' || normalized === 'GBP') {
    return normalized
  }

  return undefined
}

export function normalizeSalaryInput(value?: string): string | undefined {
  if (!value) return undefined

  const cleaned = value.replace(/\s+/g, ' ').trim()
  const period =
    /per\s+hour|\bhour\b/i.test(cleaned) ? 'hour'
      : /per\s+month|\bmonth\b/i.test(cleaned) ? 'month'
        : /per\s+day|\bday\b/i.test(cleaned) ? 'day'
          : /per\s+year|\byear\b|\bannually\b/i.test(cleaned) ? 'year'
            : undefined

  const numbers = cleaned.match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)
  if (!numbers || numbers.length === 0) return undefined

  const normalizeNumber = (raw: string): string => {
    const hasThousands = /^(\d{1,3}),\d{3}$/.test(raw)
    const withoutCommas = raw.replace(/,/g, '')
    if (hasThousands) {
      const asNumber = Number(withoutCommas)
      if (Number.isFinite(asNumber) && asNumber > 0) {
        return String(asNumber / 1000)
      }
    }
    return withoutCommas
  }

  const first = normalizeNumber(numbers[0])
  const second = numbers[1] ? normalizeNumber(numbers[1]) : undefined
  const range = second ? `${first}-${second}` : first
  const suffix = period ? ` ${period}` : ''

  return `${range}${suffix}`.trim()
}

export function parseSalaryRange(text?: string): ParsedSalaryResult {
  if (!text) return {}

  const normalized = text.toLowerCase()
  const period =
    normalized.includes('hour') ? 'hour'
      : normalized.includes('month') ? 'month'
        : normalized.includes('day') ? 'day'
          : 'year'

  const numbers = text.match(/\d+(?:,\d{3})*(?:\.\d+)?/g)
  if (!numbers || numbers.length === 0) return {}

  const min = numbers[0].replace(/,/g, '')
  const max = numbers[1] ? numbers[1].replace(/,/g, '') : min
  const currency = normalized.match(/(usd|cad|eur|gbp|\$|£|€)/i)?.[0]

  return {
    min,
    max,
    currency: currency ? parseCurrency(currency) : undefined,
    period,
  }
}
