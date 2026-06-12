import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import '../../config/load-env.js';

function getPositiveNumberEnv(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const PORT = Number(process.env.PORT || 3002);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const clientConfig = {
  lyricsServiceUrl: process.env.LYRICS_SERVICE_URL || 'http://localhost:4000',
  audienceUrl: process.env.AUDIENCE_URL || 'http://localhost:4000/audience/',
  singerUrl: process.env.SINGER_URL || 'http://localhost:4000/singer/',
  maxBackgroundImageMb: getPositiveNumberEnv('MAX_BACKGROUND_IMAGE_MB', 10)
};

app.get('/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.__PROMPTER_CONFIG__ = ${JSON.stringify(clientConfig)};`);
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'singer-ui',
    port: PORT
  });
});

app.listen(PORT, () => {
  console.log(`[singer-ui] running on http://localhost:${PORT}`);
});
