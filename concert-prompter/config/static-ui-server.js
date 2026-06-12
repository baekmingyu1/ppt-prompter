import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClientConfig, getPortEnv } from './runtime.js';

export function createStaticUiServer({
  importMetaUrl,
  serviceName,
  defaultPort,
  clientConfigDefaults
}) {
  const port = getPortEnv('PORT', defaultPort);
  const filename = fileURLToPath(importMetaUrl);
  const dirname = path.dirname(filename);
  const app = express();
  const clientConfig = getClientConfig(clientConfigDefaults);

  app.get('/config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`window.__PROMPTER_CONFIG__ = ${JSON.stringify(clientConfig)};`);
  });

  app.use(express.static(path.join(dirname, 'public')));

  app.get('/health', (req, res) => {
    res.json({
      ok: true,
      service: serviceName,
      port
    });
  });

  return {
    app,
    port,
    listen() {
      return app.listen(port, () => {
        console.log(`[${serviceName}] running on http://localhost:${port}`);
      });
    }
  };
}
