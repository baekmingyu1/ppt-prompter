const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const presenterElapsed = document.getElementById('presenterElapsed');
const presenterClock = document.getElementById('presenterClock');
const presenterLyricsModeButton = document.getElementById('presenterLyricsModeButton');
const presenterPptModeButton = document.getElementById('presenterPptModeButton');
const presenterCurrentLabel = document.getElementById('presenterCurrentLabel');
const presenterNextLabel = document.getElementById('presenterNextLabel');
const presenterProgress = document.getElementById('presenterProgress');
const presenterFooterProgress = document.getElementById('presenterFooterProgress');
const presenterCurrentFrame = document.getElementById('presenterCurrentFrame');
const presenterNextFrame = document.getElementById('presenterNextFrame');
const presenterNotes = document.getElementById('presenterNotes');
const presenterPrevButton = document.getElementById('presenterPrevButton');
const presenterNextButton = document.getElementById('presenterNextButton');

const startedAt = Date.now();
let latestState = null;

function getAssetUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url || '';
  }

  return `${LYRICS_SERVICE_URL}${url}`;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function updateTime() {
  presenterElapsed.textContent = formatDuration(Date.now() - startedAt);
  presenterClock.textContent = new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date());
}

function syncViewMode(mode) {
  socket.emit('control:setViewMode', {
    mode
  });
}

function getLinesText(lines, fallback = '-') {
  return Array.isArray(lines) && lines.length ? lines.join('\n') : fallback;
}

function renderTextFrame(frame, lines, emptyText = '-') {
  frame.innerHTML = '';
  const text = document.createElement('div');
  text.className = 'presenter-lyrics-text';
  text.textContent = getLinesText(lines, emptyText);
  frame.appendChild(text);
}

function renderPptFrame(frame, slide, emptyText = 'PPT 없음') {
  frame.innerHTML = '';

  if (!slide?.url) {
    renderTextFrame(frame, [emptyText]);
    return;
  }

  const image = document.createElement('img');
  image.className = 'presenter-slide-image';
  image.src = getAssetUrl(slide.url);
  image.alt = 'PPT slide';
  frame.appendChild(image);
}

function renderModeState(payload) {
  const isPptMode = payload.viewMode === 'ppt';
  const hasPpt = Array.isArray(payload.ppt?.slides) && payload.ppt.slides.length > 0;

  presenterLyricsModeButton.classList.toggle('primary', !isPptMode);
  presenterPptModeButton.classList.toggle('primary', isPptMode);
  presenterLyricsModeButton.setAttribute('aria-selected', String(!isPptMode));
  presenterPptModeButton.setAttribute('aria-selected', String(isPptMode));
  presenterPptModeButton.disabled = !hasPpt;
}

function renderPptPresenter(payload) {
  const slides = payload.ppt?.slides || [];
  const slideIndex = Number(payload.ppt?.slideIndex || 0);
  const currentSlide = payload.ppt?.currentSlide || slides[slideIndex];
  const nextSlide = slides[slideIndex + 1];
  const totalSlides = slides.length;
  const progress = totalSlides ? `${slideIndex + 1} / ${totalSlides}` : '0 / 0';

  presenterCurrentLabel.textContent = payload.ppt?.filename || 'PPT';
  presenterNextLabel.textContent = '다음 슬라이드';
  presenterProgress.textContent = progress;
  presenterFooterProgress.textContent = `슬라이드 ${progress}`;
  presenterNotes.textContent = '';

  renderPptFrame(presenterCurrentFrame, currentSlide);
  renderPptFrame(presenterNextFrame, nextSlide, '다음 슬라이드 없음');

  presenterPrevButton.disabled = slideIndex <= 0;
  presenterNextButton.disabled = !totalSlides || slideIndex >= totalSlides - 1;
}

function renderLyricsPresenter(payload) {
  const lineCount = Number(payload.state?.displaySettings?.lineCount || 1);
  const lineIndex = Number(payload.state?.lineIndex || 0);
  const lyrics = payload.lyrics || [];
  const totalGroups = Math.max(Math.ceil(lyrics.length / lineCount), 1);
  const currentGroup = Math.floor(lineIndex / lineCount) + 1;
  const progress = `${currentGroup} / ${totalGroups}`;

  presenterCurrentLabel.textContent = payload.song?.title || '가사';
  presenterNextLabel.textContent = '다음 가사';
  presenterProgress.textContent = progress;
  presenterFooterProgress.textContent = `가사 ${progress}`;
  presenterNotes.textContent = payload.song?.artist || '';

  renderTextFrame(presenterCurrentFrame, payload.currentLines, '현재 가사 없음');
  renderTextFrame(presenterNextFrame, payload.nextLines, '다음 가사 없음');

  presenterPrevButton.disabled = lineIndex <= 0;
  presenterNextButton.disabled = lineIndex + lineCount >= lyrics.length;
}

function render(payload) {
  latestState = payload;
  renderModeState(payload);

  if (payload.viewMode === 'ppt' && payload.ppt?.slides?.length) {
    renderPptPresenter(payload);
    return;
  }

  renderLyricsPresenter(payload);
}

function movePrevious() {
  if (latestState?.viewMode === 'ppt' && latestState?.ppt?.slides?.length) {
    socket.emit('control:prevPptSlide');
    return;
  }

  socket.emit('control:prev');
}

function moveNext() {
  if (latestState?.viewMode === 'ppt' && latestState?.ppt?.slides?.length) {
    socket.emit('control:nextPptSlide');
    return;
  }

  socket.emit('control:next');
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'control'
  });
});

socket.on('state', (payload) => {
  render(payload);
});

socket.on('errorMessage', (payload) => {
  alert(payload.message || '오류가 발생했습니다.');
});

presenterLyricsModeButton.addEventListener('click', () => {
  syncViewMode('lyrics');
});

presenterPptModeButton.addEventListener('click', () => {
  if (latestState?.ppt?.slides?.length) {
    syncViewMode('ppt');
  }
});

presenterPrevButton.addEventListener('click', movePrevious);
presenterNextButton.addEventListener('click', moveNext);

document.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    movePrevious();
    return;
  }

  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    moveNext();
  }
});

updateTime();
setInterval(updateTime, 1000);
