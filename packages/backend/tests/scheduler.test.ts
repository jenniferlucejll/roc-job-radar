import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node-cron', () => ({
  schedule: vi.fn(),
  validate: vi.fn(),
}));

vi.mock('../src/scrapers/pipeline.js', () => ({
  triggerPipeline: vi.fn(),
}));

vi.mock('../src/config.js', () => ({
  config: {
    scraper: { cron: '*/10 * * * *' },
  },
}));

describe('scheduler', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('does not arm scheduled scraping on startup initialization', async () => {
    const cron = await import('node-cron');
    const scheduler = await import('../src/scheduler.js');

    const schedule = cron.schedule as unknown as vi.Mock;
    const validate = cron.validate as unknown as vi.Mock;

    validate.mockReturnValue(true);
    scheduler.initializeScheduler();

    expect(schedule).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
    expect(scheduler.getScrapeControlState()).toEqual({
      scheduledScrapingEnabled: false,
      schedulerArmed: false,
      resetsOnRestart: true,
    });
  });

  it('arms scheduled scraping only when explicitly enabled', async () => {
    const cron = await import('node-cron');
    const pipeline = await import('../src/scrapers/pipeline.js');
    const scheduler = await import('../src/scheduler.js');

    const schedule = cron.schedule as unknown as vi.Mock;
    const validate = cron.validate as unknown as vi.Mock;
    const triggerPipeline = pipeline.triggerPipeline as unknown as vi.Mock;

    validate.mockReturnValue(true);

    let scheduledCallback: () => void;
    schedule.mockImplementation((_cron: string, callback: () => void) => {
      scheduledCallback = callback;
      return { stop: vi.fn() };
    });

    scheduler.initializeScheduler();
    const state = scheduler.setScheduledScrapingEnabled(true);

    expect(validate).toHaveBeenCalledWith('*/10 * * * *');
    expect(schedule).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    expect(state).toEqual({
      scheduledScrapingEnabled: true,
      schedulerArmed: true,
      resetsOnRestart: true,
    });

    triggerPipeline.mockResolvedValue('scrape-123');
    scheduledCallback!();

    expect(triggerPipeline).toHaveBeenCalledTimes(1);
  });

  it('does not arm scheduled scraping when cron expression is invalid', async () => {
    const cron = await import('node-cron');
    const scheduler = await import('../src/scheduler.js');
    const schedule = cron.schedule as unknown as vi.Mock;
    const validate = cron.validate as unknown as vi.Mock;

    validate.mockReturnValue(false);
    scheduler.initializeScheduler();

    expect(() => scheduler.setScheduledScrapingEnabled(true)).toThrow(
      '[scheduler] Invalid cron expression: */10 * * * *',
    );
    expect(schedule).not.toHaveBeenCalled();
  });

  it('disables and re-enables scheduled scraping idempotently', async () => {
    const cron = await import('node-cron');
    const scheduler = await import('../src/scheduler.js');
    const schedule = cron.schedule as unknown as vi.Mock;
    const validate = cron.validate as unknown as vi.Mock;
    const stop = vi.fn();

    validate.mockReturnValue(true);
    schedule.mockReturnValue({ stop });

    scheduler.initializeScheduler();
    scheduler.setScheduledScrapingEnabled(true);
    scheduler.setScheduledScrapingEnabled(true);
    scheduler.setScheduledScrapingEnabled(false);
    scheduler.setScheduledScrapingEnabled(false);
    scheduler.setScheduledScrapingEnabled(true);

    expect(schedule).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(scheduler.getScrapeControlState()).toEqual({
      scheduledScrapingEnabled: true,
      schedulerArmed: true,
      resetsOnRestart: true,
    });
  });
});
