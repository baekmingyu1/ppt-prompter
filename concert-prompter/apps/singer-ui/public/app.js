const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');
const pptSlide = document.getElementById('pptSlide');
const lyricSections = Array.from(document.querySelectorAll('.current-section, .next-section'));

function getAssetUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url || '';
  }

  return `${LYRICS_SERVICE_URL}${url}`;
}

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

  document.documentElement.style.setProperty('--singer-lyric-y', `${singerSettings.verticalPositionPercent || 50}%`);
  document.documentElement.style.setProperty('--singer-ppt-y', `${singerSettings.pptVerticalPositionPercent || 50}%`);
}

function render(payload) {
  applyDisplaySettings(payload.displaySettings);

  if (payload.blank) {
    lyricSections.forEach((section) => {
      section.hidden = false;
    });
    pptSlide.hidden = true;
    pptSlide.removeAttribute('src');
    currentLyric.textContent = '';
    nextLyric.textContent = '';
    return;
  }

  if (payload.viewMode === 'ppt' && !payload.separateControlEnabled) {
    lyricSections.forEach((section) => {
      section.hidden = true;
    });
    pptSlide.hidden = false;
    pptSlide.src = getAssetUrl(payload.ppt?.currentSlide?.url);
    return;
  }

  lyricSections.forEach((section) => {
    section.hidden = false;
  });
  pptSlide.hidden = true;
  pptSlide.removeAttribute('src');

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
