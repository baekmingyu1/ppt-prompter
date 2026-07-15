const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');
const pptSlide = document.getElementById('pptSlide');
const lyricSections = Array.from(document.querySelectorAll('.current-section, .next-section'));
const currentLyricMeasure = document.createElement('div');
const nextLyricMeasure = document.createElement('div');
const NEXT_LYRIC_FONT_RATIO = 0.75;
let singerFontSizeVw = 6;
let latestPayload = null;

currentLyricMeasure.className = 'current-lyric lyric-measure';
nextLyricMeasure.className = 'next-lyric lyric-measure';
currentLyric.parentElement.appendChild(currentLyricMeasure);
nextLyric.parentElement.appendChild(nextLyricMeasure);

function getAssetUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url || '';
  }

  return `${LYRICS_SERVICE_URL}${url}`;
}

function applyDisplaySettings(settings = {}) {
  const singerSettings = settings.singer || settings;

  if (singerSettings.fontSizeVw) {
    singerFontSizeVw = Number(singerSettings.fontSizeVw);
    setSingerLyricsFontSize(singerFontSizeVw);
  }

  if (singerSettings.fontColor) {
    currentLyric.style.color = singerSettings.fontColor;
  }

  if (singerSettings.fontWeight) {
    currentLyric.style.fontWeight = singerSettings.fontWeight;
    nextLyric.style.fontWeight = singerSettings.fontWeight;
  }

  document.documentElement.style.setProperty('--singer-lyric-y', `${singerSettings.verticalPositionPercent || 50}%`);
  document.documentElement.style.setProperty('--singer-ppt-y', `${singerSettings.pptVerticalPositionPercent || 50}%`);
}

function getLongestLine(lines = []) {
  return lines.reduce((longest, line) => {
    const nextLine = String(line || '');
    return nextLine.length > longest.length ? nextLine : longest;
  }, '');
}

function setSingerLyricsFontSize(fontSizeVw) {
  currentLyric.style.fontSize = `${fontSizeVw.toFixed(1)}vw`;
  nextLyric.style.fontSize = `${(fontSizeVw * NEXT_LYRIC_FONT_RATIO).toFixed(1)}vw`;
}

function getFittedFontSizeForWidth(lines, baseFontSizeVw, minFontSizeVw) {
  const longestLine = getLongestLine(lines);

  if (!longestLine) {
    return baseFontSizeVw;
  }

  let nextFontSize = baseFontSizeVw;
  currentLyricMeasure.style.fontWeight = currentLyric.style.fontWeight;
  currentLyricMeasure.textContent = longestLine;
  nextLyricMeasure.style.fontWeight = nextLyric.style.fontWeight;
  nextLyricMeasure.textContent = longestLine;

  const applyMeasureFontSize = () => {
    currentLyricMeasure.style.fontSize = `${nextFontSize.toFixed(1)}vw`;
    nextLyricMeasure.style.fontSize = `${(nextFontSize * NEXT_LYRIC_FONT_RATIO).toFixed(1)}vw`;
  };

  applyMeasureFontSize();

  while (
    (currentLyricMeasure.scrollWidth > currentLyricMeasure.clientWidth
      || nextLyricMeasure.scrollWidth > nextLyricMeasure.clientWidth)
    && nextFontSize > minFontSizeVw
  ) {
    nextFontSize = Math.max(nextFontSize - 0.1, minFontSizeVw);
    applyMeasureFontSize();
  }

  return nextFontSize;
}

function fitSingerLyricsToWidth() {
  requestAnimationFrame(() => {
    if (currentLyric.hidden) return;

    const songLines = latestPayload?.lyrics?.length
      ? latestPayload.lyrics
      : [
        ...(latestPayload?.currentLines || []),
        ...(latestPayload?.nextLines || [])
      ];
    let fittedFontSize = getFittedFontSizeForWidth(songLines, singerFontSizeVw, 2.5);

    setSingerLyricsFontSize(fittedFontSize);

    while (
      (currentLyric.scrollHeight > currentLyric.clientHeight || nextLyric.scrollHeight > nextLyric.clientHeight)
      && fittedFontSize > 2.5
    ) {
      fittedFontSize = Math.max(fittedFontSize - 0.1, 2.5);
      setSingerLyricsFontSize(fittedFontSize);
    }
  });
}

function render(payload) {
  latestPayload = payload;
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
  fitSingerLyricsToWidth();
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'singer'
  });
});

socket.on('state', (payload) => {
  render(payload);
});

window.addEventListener('resize', fitSingerLyricsToWidth);

document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  }
});
