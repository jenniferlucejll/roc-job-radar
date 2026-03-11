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

  it('schedules the scrape pipeline using configured cron expression', async () => {
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

    scheduler.startScheduler();

    expect(validate).toHaveBeenCalledWith('*/10 * * * *');
    expect(schedule).toHaveBeenCalledWith('*/10 * * * *', expect.any(Function));
    expect(typeof scheduledCallback!).toBe('function');

    triggerPipeline.mockReturnValue(true);
    scheduledCallback!();

    expect(triggerPipeline).toHaveBeenCalledTimes(1);
  });

  it('does not schedule when cron expression is invalid', async () => {
    const cron = await import('node-cron');
    const scheduler = await import('../src/scheduler.js');
    const schedule = cron.schedule as unknown as vi.Mock;
    const validate = cron.validate as unknown as vi.Mock;

    validate.mockReturnValue(false);

    scheduler.startScheduler();

    expect(schedule).not.toHaveBeenCalled();
  });

  it('is idempotent when started multiple times', async () => {
    const cron = await import('node-cron');
    const scheduler = await import('../src/scheduler.js');
    const schedule = cron.schedule as unknown as vi.Mock;
    const validate = cron.validate as unknown as vi.Mock;

    validate.mockReturnValue(true);
    schedule.mockReturnValue({ stop: vi.fn() });

    scheduler.startScheduler();
    scheduler.startScheduler();
    scheduler.startScheduler();

    expect(schedule).toHaveBeenCalledTimes(1);
  });
});
