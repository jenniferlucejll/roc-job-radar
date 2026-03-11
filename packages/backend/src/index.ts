import { createApp } from './server.js';
import { config } from './config.js';
import { startScheduler } from './scheduler.js';

const app = createApp();
startScheduler();

app.listen(config.server.port, '0.0.0.0', () => {
  console.log(`roc-job-radar backend listening on port ${config.server.port}`);
});
