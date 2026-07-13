const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();
const lyric = document.getElementById('lyric');
const pptSlide = document.getElementById('pptSlide');

function getAssetUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url || '';
  }

  return `${LYRICS_SERVICE_URL}${url}`;
}

function applyDisplaySettings(settings = {}) {
  const fontSizeVw = Number(settings.fontSizeVw || 6);
  const fontWeight = Number(settings.fontWeight || 800);
  const fontColor = settings.fontColor || '#ffffff';
  const verticalPositionPercent = Number(settings.verticalPositionPercent || 50);

  lyric.style.fontSize = `${fontSizeVw}vw`;
  lyric.style.fontWeight = String(fontWeight);
  lyric.style.color = fontColor;
  lyric.style.top = `${verticalPositionPercent}%`;
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

  if (payload.viewMode === 'ppt') {
    lyric.hidden = true;
    pptSlide.hidden = false;
    pptSlide.src = getAssetUrl(payload.ppt?.currentSlide?.url);
    return;
  }

  lyric.hidden = false;
  pptSlide.hidden = true;
  pptSlide.removeAttribute('src');

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
