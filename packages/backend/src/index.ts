import { createApp } from './server.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.server.port, '0.0.0.0', () => {
  console.log(`roc-job-radar backend listening on port ${config.server.port}`);
});
