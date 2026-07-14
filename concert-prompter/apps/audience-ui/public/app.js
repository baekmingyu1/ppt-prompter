const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();
const lyric = document.getElementById('lyric');
const pptSlide = document.getElementById('pptSlide');
const lyricMeasure = document.createElement('div');
let audienceFontSizeVw = 6;
let latestPayload = null;

lyricMeasure.className = 'lyric lyric-measure';
lyric.parentElement.appendChild(lyricMeasure);

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
  const pptVerticalPositionPercent = Number(settings.pptVerticalPositionPercent || 50);

  audienceFontSizeVw = fontSizeVw;
  lyric.style.fontSize = `${audienceFontSizeVw}vw`;
  lyric.style.fontWeight = String(fontWeight);
  lyric.style.color = fontColor;
  lyric.style.top = `${verticalPositionPercent}%`;
  pptSlide.style.top = `${pptVerticalPositionPercent}%`;
}

function getLongestLine(lines = []) {
  return lines.reduce((longest, line) => {
    const nextLine = String(line || '');
    return nextLine.length > longest.length ? nextLine : longest;
  }, '');
}

function fitLyricsToSongWidth() {
  requestAnimationFrame(() => {
    if (lyric.hidden) return;

    const lines = latestPayload?.lyrics?.length
      ? latestPayload.lyrics
      : latestPayload?.currentLines || [];
    const longestLine = getLongestLine(lines);

    if (!longestLine) {
      lyric.style.fontSize = `${audienceFontSizeVw}vw`;
      return;
    }

    let nextFontSize = audienceFontSizeVw;
    lyricMeasure.style.fontSize = `${nextFontSize}vw`;
    lyricMeasure.style.fontWeight = lyric.style.fontWeight;
    lyricMeasure.textContent = longestLine;

    while (lyricMeasure.scrollWidth > lyricMeasure.clientWidth && nextFontSize > 2.5) {
      nextFontSize = Math.max(nextFontSize - 0.1, 2.5);
      lyricMeasure.style.fontSize = `${nextFontSize.toFixed(1)}vw`;
    }

    lyric.style.fontSize = `${nextFontSize.toFixed(1)}vw`;
  });
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
  latestPayload = payload;
  applyDisplaySettings(payload.displaySettings);
  applyBackground(payload.displaySettings);

  if (payload.blank) {
    lyric.hidden = false;
    pptSlide.hidden = true;
    pptSlide.removeAttribute('src');
    lyric.textContent = '';
    return;
  }

  if (payload.viewMode === 'ppt') {
    lyric.hidden = true;
    pptSlide.hidden = false;
    pptSlide.src = getAssetUrl(payload.ppt?.currentSlide?.url);
    return;
  }

  lyric.hidden = false;
  pptSlide.hidden = true;
  pptSlide.removeAttribute('src');

  lyric.textContent = payload.currentLines?.length ? payload.currentLines.join('\n') : '';
  fitLyricsToSongWidth();
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

window.addEventListener('resize', fitLyricsToSongWidth);
