import { createApp } from './server.js';
import { config } from './config.js';
import { startScheduler } from './scheduler.js';

const app = createApp();
startScheduler();

app.listen(config.server.port, config.server.host, () => {
  console.log(`roc-job-radar backend listening on ${config.server.host}:${config.server.port}`);
});
