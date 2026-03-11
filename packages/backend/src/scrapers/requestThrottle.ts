interface RequestThrottler {
  waitForNextSlot(): Promise<void>;
}

const TEST_MODE = process.env.NODE_ENV === 'test';

/**
 * Creates a simple per-adapter delay gate for outbound requests.
 */
export function createRequestThrottler(minIntervalMs = 1_000): RequestThrottler {
  let lastRequestAt = 0;
  const intervalMs = TEST_MODE ? 0 : minIntervalMs;

  return {
    async waitForNextSlot(): Promise<void> {
      const now = Date.now();
      const elapsed = now - lastRequestAt;
      const waitMs = Math.max(0, intervalMs - elapsed);
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      lastRequestAt = Date.now();
    },
  };
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0 || TEST_MODE) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
