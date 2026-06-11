const LYRICS_SERVICE_URL = 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);
const lyric = document.getElementById('lyric');

function applyDisplaySettings(settings = {}) {
  const audienceSettings = settings.audience || settings;

  if (audienceSettings.fontSizeVw) {
    lyric.style.fontSize = `${audienceSettings.fontSizeVw}vw`;
  }

  if (audienceSettings.fontColor) {
    lyric.style.color = audienceSettings.fontColor;
  }

  if (audienceSettings.backgroundImage) {
    document.body.style.backgroundImage = `linear-gradient(rgba(0, 0, 0, 0.42), rgba(0, 0, 0, 0.42)), url("${audienceSettings.backgroundImage}")`;
    return;
  }

  document.body.style.backgroundImage = '';
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
