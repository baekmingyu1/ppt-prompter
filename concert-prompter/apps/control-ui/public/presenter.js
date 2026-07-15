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
const presenterProgramSelect = document.getElementById('presenterProgramSelect');

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

function getProgramTypeLabel(type) {
  if (type === 'song') return '곡';
  if (type === 'ppt') return 'PPT';
  return '메모';
}

function renderProgramSelect(payload) {
  const items = payload.program?.items || [];
  const currentItemId = payload.program?.currentItemId || '';

  presenterProgramSelect.innerHTML = '';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = items.length ? '순서 선택' : '순서표 없음';
  presenterProgramSelect.appendChild(emptyOption);

  items.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.disabled = Boolean(item.missing);
    option.textContent = `${index + 1}. ${getProgramTypeLabel(item.type)} - ${item.title}${item.missing ? ' (삭제됨)' : ''}`;
    presenterProgramSelect.appendChild(option);
  });

  presenterProgramSelect.disabled = items.length === 0;
  presenterProgramSelect.value = currentItemId || '';
}

function applyProgramItem(programItemId) {
  if (!programItemId) return;

  socket.emit('control:applyProgramItem', {
    programItemId
  });
}

function getCurrentProgramItem(payload) {
  const items = payload.program?.items || [];
  return items.find((item) => item.id === payload.program?.currentItemId) || null;
}

function getAdjacentProgramItem(payload, delta) {
  const items = payload.program?.items || [];
  const currentIndex = items.findIndex((item) => item.id === payload.program?.currentItemId);
  let nextIndex = currentIndex + delta;

  while (nextIndex >= 0 && nextIndex < items.length) {
    if (!items[nextIndex].missing) {
      return items[nextIndex];
    }
    nextIndex += delta;
  }

  return null;
}

function renderProgramItemPreview(frame, item, emptyText = '다음 순서 없음') {
  if (!item || item.missing) {
    renderTextFrame(frame, [emptyText]);
    return;
  }

  if (item.type === 'ppt') {
    renderPptFrame(frame, item.slides?.[0], item.title || 'PPT');
    return;
  }

  if (item.type === 'song') {
    const lineCount = Number(latestState?.state?.displaySettings?.lineCount || 1);
    renderTextFrame(frame, item.lyrics?.slice(0, lineCount), item.title || '가사');
    return;
  }

  renderTextFrame(frame, [`[메모]\n${item.title}`]);
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
  const nextProgramItem = getAdjacentProgramItem(payload, 1);
  const totalSlides = slides.length;
  const progress = totalSlides ? `${slideIndex + 1} / ${totalSlides}` : '0 / 0';

  presenterCurrentLabel.textContent = payload.ppt?.filename || 'PPT';
  presenterNextLabel.textContent = '다음 슬라이드';
  presenterProgress.textContent = progress;
  presenterFooterProgress.textContent = `슬라이드 ${progress}`;
  presenterNotes.textContent = '';

  renderPptFrame(presenterCurrentFrame, currentSlide);
  if (nextSlide) {
    renderPptFrame(presenterNextFrame, nextSlide, '다음 슬라이드 없음');
  } else {
    renderProgramItemPreview(presenterNextFrame, nextProgramItem);
  }

  presenterPrevButton.disabled = slideIndex <= 0;
  presenterNextButton.disabled = !totalSlides || (slideIndex >= totalSlides - 1 && !nextProgramItem);
}

function renderLyricsPresenter(payload) {
  const lineCount = Number(payload.state?.displaySettings?.lineCount || 1);
  const lineIndex = Number(payload.state?.lineIndex || 0);
  const lyrics = payload.lyrics || [];
  const totalGroups = Math.max(Math.ceil(lyrics.length / lineCount), 1);
  const currentGroup = Math.floor(lineIndex / lineCount) + 1;
  const progress = `${currentGroup} / ${totalGroups}`;
  const nextProgramItem = getAdjacentProgramItem(payload, 1);
  const isLastGroup = lineIndex + lineCount >= lyrics.length;

  presenterCurrentLabel.textContent = payload.song?.title || '가사';
  presenterNextLabel.textContent = isLastGroup && nextProgramItem ? '다음 순서' : '다음 가사';
  presenterProgress.textContent = progress;
  presenterFooterProgress.textContent = `가사 ${progress}`;
  presenterNotes.textContent = payload.song?.artist || '';

  renderTextFrame(presenterCurrentFrame, payload.currentLines, '현재 가사 없음');
  if (isLastGroup && nextProgramItem) {
    renderProgramItemPreview(presenterNextFrame, nextProgramItem);
  } else {
    renderTextFrame(presenterNextFrame, payload.nextLines, '다음 가사 없음');
  }

  presenterPrevButton.disabled = lineIndex <= 0;
  presenterNextButton.disabled = isLastGroup && !nextProgramItem;
}

function render(payload) {
  latestState = payload;
  renderProgramSelect(payload);
  renderModeState(payload);

  const currentProgramItem = getCurrentProgramItem(payload);
  if (currentProgramItem?.type === 'note') {
    presenterCurrentLabel.textContent = '메모';
    presenterNextLabel.textContent = '다음 순서';
    presenterProgress.textContent = '-';
    presenterFooterProgress.textContent = currentProgramItem.title;
    presenterNotes.textContent = '';
    renderTextFrame(presenterCurrentFrame, [`[메모]\n${currentProgramItem.title}`]);
    renderProgramItemPreview(presenterNextFrame, getAdjacentProgramItem(payload, 1));
    presenterPrevButton.disabled = !getAdjacentProgramItem(payload, -1);
    presenterNextButton.disabled = !getAdjacentProgramItem(payload, 1);
    return;
  }

  if (payload.viewMode === 'ppt' && payload.ppt?.slides?.length) {
    renderPptPresenter(payload);
    return;
  }

  renderLyricsPresenter(payload);
}

function movePrevious() {
  const currentProgramItem = latestState ? getCurrentProgramItem(latestState) : null;
  const previousProgramItem = latestState ? getAdjacentProgramItem(latestState, -1) : null;

  if (currentProgramItem?.type === 'note' && previousProgramItem) {
    applyProgramItem(previousProgramItem.id);
    return;
  }

  if (latestState?.viewMode === 'ppt' && latestState?.ppt?.slides?.length) {
    socket.emit('control:prevPptSlide');
    return;
  }

  socket.emit('control:prev');
}

function moveNext() {
  const nextProgramItem = latestState ? getAdjacentProgramItem(latestState, 1) : null;
  const currentProgramItem = latestState ? getCurrentProgramItem(latestState) : null;

  if (currentProgramItem?.type === 'note' && nextProgramItem) {
    applyProgramItem(nextProgramItem.id);
    return;
  }

  if (latestState?.viewMode === 'ppt' && latestState?.ppt?.slides?.length) {
    const slideIndex = Number(latestState.ppt?.slideIndex || 0);
    const totalSlides = latestState.ppt.slides.length;
    if (slideIndex >= totalSlides - 1 && nextProgramItem) {
      applyProgramItem(nextProgramItem.id);
      return;
    }

    socket.emit('control:nextPptSlide');
    return;
  }

  if (latestState?.program?.currentItemId) {
    const lineCount = Number(latestState.state?.displaySettings?.lineCount || 1);
    const lineIndex = Number(latestState.state?.lineIndex || 0);
    const totalLines = latestState.lyrics?.length || 0;
    const isLastGroup = lineIndex + lineCount >= totalLines;

    if (isLastGroup && nextProgramItem) {
      applyProgramItem(nextProgramItem.id);
      return;
    }
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

presenterProgramSelect.addEventListener('change', () => {
  applyProgramItem(presenterProgramSelect.value);
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLSelectElement) {
    return;
  }

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
