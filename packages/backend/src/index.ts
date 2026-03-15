import { createApp } from './server.js';
import { config } from './config.js';
import { initializeScheduler } from './scheduler.js';
import { clearStaleRunningRuns } from './scrapers/pipeline.js';
import { startAiReadinessMonitor } from './startup/ensureOllama.js';

await clearStaleRunningRuns();
startAiReadinessMonitor();

const app = createApp();
initializeScheduler();

app.listen(config.server.port, config.server.host, () => {
  console.log(`roc-job-radar backend listening on ${config.server.host}:${config.server.port}`);
});
