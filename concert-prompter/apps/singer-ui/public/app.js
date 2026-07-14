const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');
const pptSlide = document.getElementById('pptSlide');
const lyricSections = Array.from(document.querySelectorAll('.current-section, .next-section'));
const currentLyricMeasure = document.createElement('div');
const nextLyricMeasure = document.createElement('div');
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
    currentLyric.style.fontSize = `${singerFontSizeVw}vw`;
    nextLyric.style.fontSize = `${Math.max(singerFontSizeVw * 0.58, 2.2)}vw`;
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

function getLongestLine(lines = []) {
  return lines.reduce((longest, line) => {
    const nextLine = String(line || '');
    return nextLine.length > longest.length ? nextLine : longest;
  }, '');
}

function fitLyricElementToWidth(element, measure, lines, baseFontSizeVw, minFontSizeVw) {
  const longestLine = getLongestLine(lines);

  if (!longestLine) {
    element.style.fontSize = `${baseFontSizeVw.toFixed(1)}vw`;
    return;
  }

  let nextFontSize = baseFontSizeVw;
  measure.style.fontSize = `${nextFontSize.toFixed(1)}vw`;
  measure.style.fontWeight = element.style.fontWeight;
  measure.textContent = longestLine;

  while (measure.scrollWidth > measure.clientWidth && nextFontSize > minFontSizeVw) {
    nextFontSize = Math.max(nextFontSize - 0.1, minFontSizeVw);
    measure.style.fontSize = `${nextFontSize.toFixed(1)}vw`;
  }

  element.style.fontSize = `${nextFontSize.toFixed(1)}vw`;
}

function fitSingerLyricsToWidth() {
  requestAnimationFrame(() => {
    if (currentLyric.hidden) return;

    const songLines = latestPayload?.lyrics?.length ? latestPayload.lyrics : latestPayload?.currentLines || [];
    const currentBase = singerFontSizeVw;
    const nextBase = Math.max(singerFontSizeVw * 0.58, 2.2);

    fitLyricElementToWidth(currentLyric, currentLyricMeasure, songLines, currentBase, 2.5);
    fitLyricElementToWidth(nextLyric, nextLyricMeasure, songLines, nextBase, 1.8);
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
