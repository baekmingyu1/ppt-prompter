import './load-env.js';

export function getPositiveNumberEnv(key, fallback) {
  const value = Number(process.env[key]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getPortEnv(key, fallback) {
  const port = Number(process.env[key]);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

export function getClientConfig(defaults = {}) {
  return {
    lyricsServiceUrl: process.env.LYRICS_SERVICE_URL || defaults.lyricsServiceUrl || '',
    audienceUrl: process.env.AUDIENCE_URL || defaults.audienceUrl || '/audience/',
    singerUrl: process.env.SINGER_URL || defaults.singerUrl || '/singer/',
    maxBackgroundImageMb: getPositiveNumberEnv('MAX_BACKGROUND_IMAGE_MB', 10)
  };
}
