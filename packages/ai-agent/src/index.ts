export type AiFailureCode = 'request_failed' | 'timeout' | 'bad_schema' | 'provider_unavailable'

export interface AiNormalizedJobData {
  salaryRaw?: string
  salaryMin?: string
  salaryMax?: string
  salaryCurrency?: string
  salaryPeriod?: string
  requirementsText?: string
  requirementsHtml?: string
  responsibilitiesText?: string
  responsibilitiesHtml?: string
  summaryText?: string
  normalizedDescriptionText?: string
  normalizedDescriptionHtml?: string
  otherJobData?: Record<string, unknown>
  provider: string
  model: string
  normalizedAt: string
  rawModelResponse?: string
  warnings?: string[]
}

export interface AiNormalizationError {
  code: AiFailureCode
  message: string
}

export interface AiNormalizationResult {
  success: true
  data: AiNormalizedJobData
}

export interface AiNormalizationFailure {
  success: false
  error: AiNormalizationError
}

export type NormalizeJobPostingResult = AiNormalizationResult | AiNormalizationFailure

export interface AiNormalizeOptions {
  enabled: boolean
  apiUrl: string
  model: string
  timeoutMs: number
  maxInputChars: number
  requestMaxTokens: number
  maxRetries: number
  retryBaseDelayMs: number
}

export interface ScrapedJobInput {
  title: string
  location?: string
  department?: string
  salaryRaw?: string
  descriptionHtml?: string
}

interface OllamaChatRequest {
  model: string
  stream: false
  options: {
    temperature: number
    num_predict: number
  }
  messages: Array<{ role: 'system' | 'user'; content: string }>
}

interface OllamaChatMessage {
  content: string
}

interface OllamaChatResponse {
  done?: boolean
  message?: OllamaChatMessage
  response?: string
  error?: string
}

interface ParsedJson {
  salaryRaw?: string | null
  salaryMin?: number | string | null
  salaryMax?: number | string | null
  salaryCurrency?: string | null
  salaryPeriod?: string | null
  requirementsText?: string | null
  requirementsHtml?: string | null
  responsibilitiesText?: string | null
  responsibilitiesHtml?: string | null
  summaryText?: string | null
  normalizedDescriptionText?: string | null
  normalizedDescriptionHtml?: string | null
  otherJobData?: Record<string, unknown> | null
}

interface ParsedSalaryResult {
  min?: string
  max?: string
  currency?: string
  period?: string
}

function required(value: unknown, name: string): string {
  if (value === undefined || value === null || value === '') {
    throw new Error(`${name} is required`)
  }
  return String(value)
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

function stripHtmlTags(html?: string): string {
  if (!html) return ''
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const ALLOWED_TAGS = new Set(['p', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'br']);
const ALLOWED_ATTRS: Record<string, Set<string>> = {};

function sanitizeAttributeValue(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value
    .replace(/[\n\r\t]/g, ' ')
    .replace(/"/g, '&quot;')
    .trim();
}

function sanitizeHtml(html?: string): string | undefined {
  if (!html) return undefined;

  const cleaned = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '');

  const withSanitizedAttributes = cleaned.replace(
    /<\s*([a-zA-Z][\w:-]*)\s*([^<>]*)>/g,
    (match, rawTag, attrs) => {
      const tag = rawTag.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) return '';

      const allowedAttrs = ALLOWED_ATTRS[tag] ?? new Set<string>();
      const sanitizedAttrs: string[] = [];
      const attributeRegex = /([a-zA-Z][\w:-]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
      let attrMatch;

      while ((attrMatch = attributeRegex.exec(attrs)) !== null) {
        const name = attrMatch[1]?.toLowerCase();
        if (!name || !allowedAttrs.has(name)) continue;

        const rawValue = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
        if (!rawValue) continue;
        if (name === 'href' && !/^(https?:\/\/|mailto:|tel:)/i.test(rawValue.trim())) {
          continue;
        }

        const value = sanitizeAttributeValue(rawValue);
        if (/javascript:/i.test(value)) continue;
        sanitizedAttrs.push(`${name}="${value}"`);
      }

      const attrString = sanitizedAttrs.length > 0 ? ` ${sanitizedAttrs.join(' ')}` : '';
      return `<${tag}${attrString}>`;
    },
  );

  const withoutDisallowedTags = withSanitizedAttributes.replace(
    /<\/\s*([a-zA-Z][\w:-]*)\s*>/g,
    (match, rawTag) => (ALLOWED_TAGS.has(rawTag.toLowerCase()) ? `</${rawTag.toLowerCase()}>` : ''),
  );

  return withoutDisallowedTags
    .replace(/<(?!\/?[a-z][a-z0-9]*\b)[^>]*>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .trim() || undefined;
}

function extractJsonPayload(text: string): string {
  const codeBlock = text.match(/```json\s*([\s\S]*?)\s*```/i)
  if (codeBlock?.[1]) return codeBlock[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in model response')
  }

  return text.slice(start, end + 1).trim()
}

function clampLength(value: string | undefined, max = 2400): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`
}

function parseCurrency(raw?: string | null): string | undefined {
  if (!raw) return undefined

  const normalized = raw.trim().toLowerCase()
  const match = normalized.match(/(usd|cad|eur|gbp)|[\$£€]/i)
  if (!match) return undefined

  const token = match[0]
  if (token === '$') return '$'
  if (token.toUpperCase() === 'USD') return 'USD'
  if (token.toUpperCase() === 'CAD') return 'CAD'
  if (token.toUpperCase() === 'EUR') return 'EUR'
  if (token.toUpperCase() === 'GBP' || token === '£') return 'GBP'

  return token.toUpperCase()
}

function parsePeriod(raw?: string | null): string | undefined {
  if (!raw) return undefined
  const value = raw.toLowerCase().trim()
  if (value.startsWith('hour')) return 'hour'
  if (value.startsWith('month')) return 'month'
  if (value.startsWith('day')) return 'day'
  if (value.startsWith('other')) return 'other'
  if (value.startsWith('year') || value.includes('annual') || value.includes('salary')) return 'year'
  return value
}

function parseNumberish(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return undefined
    const normalized = trimmed.replace(/,/g, '')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? String(parsed) : undefined
  }

  return undefined
}

function parseResponsePayload(parsed: ParsedJson): {
  salaryRaw?: string
  salaryMin?: string
  salaryMax?: string
  salaryCurrency?: string
  salaryPeriod?: string
  requirementsText?: string
  requirementsHtml?: string
  responsibilitiesText?: string
  responsibilitiesHtml?: string
  summaryText?: string
  normalizedDescriptionText?: string
  normalizedDescriptionHtml?: string
  otherJobData?: Record<string, unknown>
} {
  const normalized = {
    salaryRaw: parsed.salaryRaw?.trim() || undefined,
    salaryMin: parseNumberish(parsed.salaryMin),
    salaryMax: parseNumberish(parsed.salaryMax),
    salaryCurrency: parseCurrency(parsed.salaryCurrency),
    salaryPeriod: parsePeriod(parsed.salaryPeriod),
    requirementsText: clampLength(parsed.requirementsText?.trim()),
    requirementsHtml: sanitizeHtml(parsed.requirementsHtml?.trim()),
    responsibilitiesText: clampLength(parsed.responsibilitiesText?.trim()),
    responsibilitiesHtml: sanitizeHtml(parsed.responsibilitiesHtml?.trim()),
    summaryText: clampLength(parsed.summaryText?.trim(), 1200),
    normalizedDescriptionText: clampLength(parsed.normalizedDescriptionText?.trim(), 2800),
    normalizedDescriptionHtml: sanitizeHtml(parsed.normalizedDescriptionHtml?.trim()),
    otherJobData: parsed.otherJobData ?? undefined,
  }

  const salaryFromRange =
    normalized.salaryMin || normalized.salaryMax
      ? `${normalized.salaryMin ?? ''}${normalized.salaryMax ? `-${normalized.salaryMax}` : ''}`.trim()
      : undefined

  if (!normalized.salaryRaw && salaryFromRange) {
    normalized.salaryRaw = salaryFromRange
  }

  return normalized
}

function buildPrompt(job: ScrapedJobInput, maxInputChars: number): string {
  const descriptionText = stripHtmlTags(job.descriptionHtml)
  return [
    'You are a strict job-posting normalization engine.',
    'Return only valid JSON matching exactly this schema and nothing else:',
    '{',
    '  "salaryRaw": "string|null",',
    '  "salaryMin": "number|string|null",',
    '  "salaryMax": "number|string|null",',
    '  "salaryCurrency": "USD|CAD|EUR|GBP|$|£|€|null",',
    '  "salaryPeriod": "year|hour|month|day|other|null",',
    '  "requirementsText": "core requirements as short plain text",',
    '  "requirementsHtml": "requirements as safe HTML <ul><li>...</li></ul>",',
    '  "responsibilitiesText": "core responsibilities as short plain text",',
    '  "responsibilitiesHtml": "responsibilities as safe HTML <ul><li>...</li></ul>",',
    '  "summaryText": "one short paragraph summary",',
    '  "normalizedDescriptionText": "cleaned full description text",',
    '  "normalizedDescriptionHtml": "safe HTML equivalent of cleaned description",',
    '  "otherJobData": {"optional": "additional details"}',
    '}',
    'Rules:',
    '- Do not add facts not present in the input.',
    '- Use null for unknown fields.',
    '- Keep requirements and responsibilities concise.',
    '- Remove fluff and repeated boilerplate.',
    `Title: ${required(job.title, 'title')}`,
    `Department: ${job.department ?? 'unknown'}`,
    `Location: ${job.location ?? 'unknown'}`,
    `Salary raw: ${job.salaryRaw ?? 'unknown'}`,
    `Description: ${descriptionText.slice(0, maxInputChars)}`,
  ].join('\n')
}

function classifyError(err: unknown): AiFailureCode {
  if (err instanceof Error) {
    if (err.name === 'TimeoutError') return 'timeout'
    const message = err.message.toLowerCase()
    if (message.includes('timed out') || message.includes('aborted')) return 'timeout'
    if (
      message.includes('econnrefused') ||
      message.includes('fetch failed') ||
      message.includes('failed to connect') ||
      message.includes('bad gateway')
    ) {
      return 'provider_unavailable'
    }
  }

  return 'request_failed'
}

async function callOllama(apiUrl: string, payload: OllamaChatRequest, timeoutMs: number): Promise<string> {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`ollama request failed: ${response.status} ${detail || ''}`.trim())
  }

  const parsed = (await response.json()) as OllamaChatResponse
  if (parsed.error) {
    throw new Error(`ollama error: ${parsed.error}`)
  }

  const raw = parsed.message?.content || parsed.response || ''
  if (!raw.trim()) {
    throw new Error('empty response from model')
  }

  return raw
}

function buildPayload(job: ScrapedJobInput, options: AiNormalizeOptions): OllamaChatRequest {
  return {
    model: options.model,
    stream: false,
    options: {
      temperature: 0,
      num_predict: options.requestMaxTokens,
    },
    messages: [
      {
        role: 'system',
        content: buildPrompt(
          {
            title: job.title,
            location: job.location,
            department: job.department,
            salaryRaw: job.salaryRaw,
            descriptionHtml: job.descriptionHtml,
          },
          options.maxInputChars,
        ),
      },
      {
        role: 'user',
        content: 'Return strictly valid JSON only.',
      },
    ],
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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

export async function normalizeJobPosting(
  job: ScrapedJobInput,
  options: AiNormalizeOptions,
): Promise<NormalizeJobPostingResult> {
  if (!options.enabled) {
    return {
      success: false,
      error: {
        code: 'provider_unavailable',
        message: 'AI normalization is disabled',
      },
    }
  }

  if (!job.descriptionHtml || !job.descriptionHtml.trim()) {
    return {
      success: false,
      error: {
        code: 'bad_schema',
        message: 'No descriptionHtml provided',
      },
    }
  }

  const payload = buildPayload(job, options)
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= options.maxRetries + 1; attempt += 1) {
    try {
      const raw = await callOllama(options.apiUrl, payload, options.timeoutMs)
      const parsedText = extractJsonPayload(raw)
      const parsed = JSON.parse(parsedText) as ParsedJson

      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid JSON payload')
      }

      const normalized = parseResponsePayload(parsed)
      const salaryParsed = parseSalaryRange(normalized.salaryRaw)

      const salaryMin = normalized.salaryMin ?? salaryParsed.min
      const salaryMax = normalized.salaryMax ?? salaryParsed.max
      const salaryCurrency = normalized.salaryCurrency ?? salaryParsed.currency
      const salaryPeriod = normalized.salaryPeriod ?? salaryParsed.period
      const normalizedSalaryRaw =
        normalized.salaryRaw
        ?? (salaryMin && salaryMax ? `${salaryMin}-${salaryMax}` : salaryMin)

      const warnings: string[] = []
      if (!salaryMin && !salaryMax && !normalizedSalaryRaw) warnings.push('salary not extracted')
      if (!normalized.requirementsText && !normalized.responsibilitiesText) {
        warnings.push('requirements or responsibilities missing')
      }
      if (!normalized.summaryText) warnings.push('summary missing')

      return {
        success: true,
        data: {
          salaryRaw: normalizedSalaryRaw,
          salaryMin,
          salaryMax,
          salaryCurrency,
          salaryPeriod,
          requirementsText: normalized.requirementsText,
          requirementsHtml: normalized.requirementsHtml,
          responsibilitiesText: normalized.responsibilitiesText,
          responsibilitiesHtml: normalized.responsibilitiesHtml,
          summaryText: normalized.summaryText,
          normalizedDescriptionText: normalized.normalizedDescriptionText,
          normalizedDescriptionHtml: normalized.normalizedDescriptionHtml,
          otherJobData: normalized.otherJobData,
          provider: 'ollama',
          model: options.model,
          normalizedAt: new Date().toISOString(),
          rawModelResponse: raw,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      if (attempt > options.maxRetries) {
        break
      }

      if (
        error instanceof SyntaxError ||
        (error instanceof Error &&
          /No JSON object found|Invalid JSON payload/.test(error.message))
      ) {
        return {
          success: false,
          error: {
            code: 'bad_schema',
            message: lastError?.message ?? 'Bad schema in model response',
          },
        }
      }

      await sleep(options.retryBaseDelayMs * 2 ** (attempt - 1))
    }
  }

  return {
    success: false,
    error: {
      code: classifyError(lastError),
      message: lastError?.message ?? 'Unknown normalization error',
    },
  }
}

export async function normalizeDescriptionOnly(descriptionHtml: string, options: AiNormalizeOptions): Promise<NormalizeJobPostingResult> {
  return normalizeJobPosting(
    {
      title: 'Unknown role',
      descriptionHtml,
    },
    options,
  )
}
