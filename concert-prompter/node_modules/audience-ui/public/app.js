const LYRICS_SERVICE_URL = 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);
const lyric = document.getElementById('lyric');

function applyDisplaySettings(settings = {}) {
  if (settings.fontSizeVw) {
    lyric.style.fontSize = `${settings.fontSizeVw}vw`;
  }

  if (settings.fontColor) {
    lyric.style.color = settings.fontColor;
  }

  if (settings.fontWeight) {
    lyric.style.fontWeight = settings.fontWeight;
  }
}

function applyBackground(settings = {}) {
  try {
    if (settings.backgroundImage) {
      document.body.style.backgroundImage = `url(${settings.backgroundImage})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
    } else {
      document.body.style.backgroundImage = '';
    }
  } catch (e) {
    // ignore
  }
}

function render(payload) {
  applyDisplaySettings(payload.displaySettings);
  applyBackground(payload.displaySettings);

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
