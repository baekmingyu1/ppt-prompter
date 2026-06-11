const LYRICS_SERVICE_URL = window.location.port === '4000' ? window.location.origin : 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);

const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');

function applyDisplaySettings(settings = {}) {
  if (settings.fontSizeVw) {
    currentLyric.style.fontSize = `${settings.fontSizeVw}vw`;
    nextLyric.style.fontSize = `${Math.max(settings.fontSizeVw * 0.58, 2.2)}vw`;
  }

  if (settings.fontColor) {
    currentLyric.style.color = settings.fontColor;
  }
}

function render(payload) {
  applyDisplaySettings(payload.displaySettings);

  if (payload.blank) {
    currentLyric.textContent = '';
    nextLyric.textContent = '';
    return;
  }

  currentLyric.textContent = payload.currentLines?.length ? payload.currentLines.join('\n') : '';
  nextLyric.textContent = payload.nextLines?.length ? payload.nextLines.join('\n') : '';
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'singer'
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
