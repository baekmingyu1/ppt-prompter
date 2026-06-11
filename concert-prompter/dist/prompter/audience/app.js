function isLocalDev() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '4000';
}

function getBasePath() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments[0] === 'prompter' ? '/prompter' : '';
}

const BASE_PATH = getBasePath();
const CONFIG = window.PROMPTER_CONFIG || {};
const LYRICS_SERVICE_URL = isLocalDev() ? 'http://localhost:4000' : CONFIG.backendUrl || window.location.origin;

const socket = io(LYRICS_SERVICE_URL, {
  path: CONFIG.socketPath || `${BASE_PATH}/socket.io`
});
const lyric = document.getElementById('lyric');

function applyDisplaySettings(settings = {}) {
  if (settings.fontSizeVw) {
    lyric.style.fontSize = `${settings.fontSizeVw}vw`;
  }

  if (settings.fontColor) {
    lyric.style.color = settings.fontColor;
  }
}

function render(payload) {
  applyDisplaySettings(payload.displaySettings);

  if (payload.blank) {
    lyric.textContent = '';
    return;
  }

  lyric.textContent = payload.currentLines?.length ? payload.currentLines.join('\n') : '';
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'audience'
  });
});

socket.on('state', (payload) => {
  render(payload);
});

document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  }
});
