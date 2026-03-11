interface CacheEntry {
  content: string | null; // null = fetch failed, assume allowed
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Check whether the given career URL is allowed by the employer's robots.txt.
 * Results are cached per origin for 24 hours.
 * If robots.txt cannot be fetched, we fail open (assume allowed).
 */
export async function checkRobots(
  careerUrl: string,
  userAgent: string,
  timeoutMs = 10_000,
): Promise<boolean> {
  const url = new URL(careerUrl);
  const origin = url.origin;
  const path = url.pathname;

  const cached = cache.get(origin);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.content === null || isPathAllowed(cached.content, path);
  }

  const content = await fetchRobots(origin, userAgent, timeoutMs);
  cache.set(origin, { content, fetchedAt: Date.now() });

  return content === null || isPathAllowed(content, path);
}

/** Exposed for testing only. */
export function clearRobotsCache(): void {
  cache.clear();
}

async function fetchRobots(
  origin: string,
  userAgent: string,
  timeoutMs: number,
): Promise<string | null> {
  try {
    const res = await fetch(`${origin}/robots.txt`, {
      headers: { 'User-Agent': userAgent },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Parse robots.txt content and check whether `path` is allowed.
 * Handles `User-agent: *` blocks. Allow overrides Disallow when the
 * Allow path is at least as specific (longer or equal length).
 */
export function isPathAllowed(content: string, path: string): boolean {
  const lines = content
    .split('\n')
    .map((l) => l.split('#')[0].trim())
    .filter(Boolean);

  let inWildcardBlock = false;
  const disallows: string[] = [];
  const allows: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (lower.startsWith('user-agent:')) {
      const agent = line.slice('user-agent:'.length).trim();
      inWildcardBlock = agent === '*';
    } else if (inWildcardBlock && lower.startsWith('disallow:')) {
      disallows.push(line.slice('disallow:'.length).trim());
    } else if (inWildcardBlock && lower.startsWith('allow:')) {
      allows.push(line.slice('allow:'.length).trim());
    }
  }

  const matchingDisallows = disallows.filter((d) => d !== '' && path.startsWith(d));
  if (matchingDisallows.length === 0) return true;

  const longestDisallow = matchingDisallows.reduce((a, b) => (a.length >= b.length ? a : b));
  const matchingAllows = allows.filter((a) => a !== '' && path.startsWith(a));
  if (matchingAllows.length === 0) return false;

  const longestAllow = matchingAllows.reduce((a, b) => (a.length >= b.length ? a : b));
  return longestAllow.length >= longestDisallow.length;
}
