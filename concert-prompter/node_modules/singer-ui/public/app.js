const LYRICS_SERVICE_URL = 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);

const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');

function applyDisplaySettings(settings = {}) {
  const singerSettings = settings.singer || settings;

  if (singerSettings.fontSizeVw) {
    currentLyric.style.fontSize = `${singerSettings.fontSizeVw}vw`;
    nextLyric.style.fontSize = `${Math.max(singerSettings.fontSizeVw * 0.58, 2.2)}vw`;
  }

  if (singerSettings.fontColor) {
    currentLyric.style.color = singerSettings.fontColor;
  }

  if (singerSettings.fontWeight) {
    currentLyric.style.fontWeight = singerSettings.fontWeight;
    nextLyric.style.fontWeight = Math.max(singerSettings.fontWeight - 200, 300);
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
