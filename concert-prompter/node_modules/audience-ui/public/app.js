const LYRICS_SERVICE_URL = window.location.port === '4000' ? window.location.origin : 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);
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
