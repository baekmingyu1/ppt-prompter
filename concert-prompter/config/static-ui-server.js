import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getClientConfig, getPortEnv } from './runtime.js';

function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

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
  const publicPath = path.join(dirname, 'public');
  const clientConfig = getClientConfig(clientConfigDefaults);

  app.get('/config.js', (req, res) => {
    setNoStore(res);
    res.type('application/javascript');
    res.send(`window.__PROMPTER_CONFIG__ = ${JSON.stringify(clientConfig)};`);
  });

  app.use(express.static(publicPath, {
    setHeaders: setNoStore
  }));

  app.get(['/control', '/control/', '/audience', '/audience/', '/singer', '/singer/'], (req, res) => {
    res.redirect('/');
  });

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
