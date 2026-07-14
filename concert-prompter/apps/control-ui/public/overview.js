const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const overviewGrid = document.getElementById('overviewGrid');
const overviewEmptyState = document.getElementById('overviewEmptyState');
const overviewEmptyTitle = document.getElementById('overviewEmptyTitle');
const overviewEmptyMessage = document.getElementById('overviewEmptyMessage');
const overviewSubtitle = document.getElementById('overviewSubtitle');
const overviewJumpLabel = document.getElementById('overviewJumpLabel');
const overviewJumpDisplay = document.getElementById('overviewJumpDisplay');
const overviewLyricsModeButton = document.getElementById('overviewLyricsModeButton');
const overviewPptModeButton = document.getElementById('overviewPptModeButton');

let latestState = null;
let overviewMode = 'lyrics';
let jumpBuffer = '';
let jumpEnabled = false;

function getAssetUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url || '';
  }

  return `${LYRICS_SERVICE_URL}${url}`;
}

function updateJumpDisplay() {
  if (!jumpEnabled) {
    overviewJumpDisplay.textContent = '이동 불가';
    overviewJumpDisplay.classList.add('is-disabled');
    return;
  }

  overviewJumpDisplay.classList.remove('is-disabled');

  if (!jumpBuffer) {
    overviewJumpDisplay.textContent = '입력 대기';
    return;
  }

  overviewJumpDisplay.textContent = jumpBuffer;
}

function clearJumpBuffer() {
  jumpBuffer = '';
  updateJumpDisplay();
}

async function postJson(path, payload) {
  const response = await fetch(`${LYRICS_SERVICE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return response.json();
}

async function syncViewMode(mode) {
  try {
    const json = await postJson('/api/control/view-mode', { mode });

    if (!json.ok) {
      alert(json.message || '화면 전환에 실패했습니다.');
      return false;
    }

    return true;
  } catch {
    alert('화면 전환 중 오류가 발생했습니다.');
    return false;
  }
}

async function goToLine(lineIndex) {
  try {
    const modeChanged = await syncViewMode('lyrics');

    if (!modeChanged) {
      return;
    }

    const json = await postJson('/api/control/line', { lineIndex });

    if (!json.ok) {
      alert(json.message || '가사 이동에 실패했습니다.');
      return;
    }

    clearJumpBuffer();
  } catch {
    alert('가사 이동 중 오류가 발생했습니다.');
  }
}

async function goToSlide(slideIndex) {
  try {
    const modeChanged = await syncViewMode('ppt');

    if (!modeChanged) {
      return;
    }

    const json = await postJson('/api/control/ppt/slide', { slideIndex });

    if (!json.ok) {
      alert(json.message || '슬라이드 이동에 실패했습니다.');
      return;
    }

    clearJumpBuffer();
  } catch {
    alert('슬라이드 이동 중 오류가 발생했습니다.');
  }
}

async function moveOverviewSelection(delta) {
  if (!latestState) {
    return;
  }

  if (overviewMode === 'ppt') {
    const slides = latestState.ppt?.slides || [];
    if (!slides.length) {
      return;
    }

    const currentSlideIndex = Number(latestState.ppt?.slideIndex || 0);
    const nextSlideIndex = Math.min(Math.max(currentSlideIndex + delta, 0), slides.length - 1);

    if (nextSlideIndex !== currentSlideIndex) {
      await goToSlide(nextSlideIndex);
    }
    return;
  }

  const lyrics = latestState.lyrics || [];
  if (!lyrics.length) {
    return;
  }

  const lineCount = Number(latestState.state?.displaySettings?.lineCount || 1);
  const totalGroups = Math.ceil(lyrics.length / lineCount);
  const currentGroupIndex = Math.floor(Number(latestState.state?.lineIndex || 0) / lineCount);
  const nextGroupIndex = Math.min(Math.max(currentGroupIndex + delta, 0), totalGroups - 1);

  if (nextGroupIndex !== currentGroupIndex) {
    await goToLine(nextGroupIndex * lineCount);
  }
}

function setOverviewMode(mode) {
  overviewMode = mode === 'ppt' ? 'ppt' : 'lyrics';
  overviewLyricsModeButton.classList.toggle('primary', overviewMode === 'lyrics');
  overviewPptModeButton.classList.toggle('primary', overviewMode === 'ppt');
  overviewLyricsModeButton.setAttribute('aria-selected', String(overviewMode === 'lyrics'));
  overviewPptModeButton.setAttribute('aria-selected', String(overviewMode === 'ppt'));

  if (latestState) {
    renderOverview(latestState);
  }
}

function renderEmptyState(title, message) {
  overviewGrid.innerHTML = '';
  overviewGrid.hidden = true;
  overviewEmptyState.hidden = false;
  overviewEmptyTitle.textContent = title;
  overviewEmptyMessage.textContent = message;
  jumpEnabled = false;
  clearJumpBuffer();
}

function renderLyricsOverview(payload) {
  const lyrics = Array.isArray(payload.lyrics) ? payload.lyrics : [];
  const lineCount = Number(payload.state?.displaySettings?.lineCount || 1);
  const currentLineIndex = Number(payload.state?.lineIndex || 0);
  const hasLyrics = lyrics.length > 0;
  const totalGroups = Math.ceil(lyrics.length / lineCount);

  overviewGrid.innerHTML = '';
  overviewGrid.classList.add('overview-lyrics-grid');
  overviewGrid.classList.remove('overview-ppt-grid');
  overviewEmptyState.hidden = true;
  overviewGrid.hidden = !hasLyrics;

  if (!hasLyrics) {
    renderEmptyState('가사가 없습니다', '선택된 곡에 등록된 가사가 없습니다.');
    return;
  }

  const currentGroupNumber = Math.floor(currentLineIndex / lineCount) + 1;
  overviewSubtitle.textContent = `${payload.song?.title || '-'} ${currentGroupNumber} / ${totalGroups}`;
  overviewJumpLabel.textContent = '묶음 번호 입력';
  jumpEnabled = true;
  updateJumpDisplay();

  for (let index = 0; index < lyrics.length; index += lineCount) {
    const groupLines = lyrics.slice(index, index + lineCount);
    const groupEndIndex = index + groupLines.length - 1;
    const groupNumber = Math.floor(index / lineCount) + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'overview-lyric-card';
    button.setAttribute('aria-label', `${groupNumber}번 묶음으로 이동`);

    if (currentLineIndex >= index && currentLineIndex <= groupEndIndex) {
      button.classList.add('active');
    }

    const number = document.createElement('span');
    number.className = 'overview-lyric-number';
    number.textContent = String(groupNumber);

    const text = document.createElement('span');
    text.className = 'overview-lyric-text';
    text.textContent = groupLines
      .map((line) => line || '(빈 줄)')
      .join('\n');

    button.appendChild(number);
    button.appendChild(text);
    button.addEventListener('click', () => {
      goToLine(index);
    });

    overviewGrid.appendChild(button);
  }
}

function renderPptOverview(payload) {
  const ppt = payload.ppt || {};
  const slides = Array.isArray(ppt.slides) ? ppt.slides : [];
  const currentSlideIndex = Number(ppt.slideIndex || 0);
  const hasSlides = slides.length > 0;

  overviewGrid.innerHTML = '';
  overviewGrid.classList.add('overview-ppt-grid');
  overviewGrid.classList.remove('overview-lyrics-grid');
  overviewEmptyState.hidden = true;
  overviewGrid.hidden = !hasSlides;

  if (!hasSlides) {
    renderEmptyState('업로드된 PPT가 없습니다', '제어 화면에서 PPT를 업로드한 뒤 다시 열어주세요.');
    return;
  }

  overviewSubtitle.textContent = `${ppt.filename || 'PPT'} ${currentSlideIndex + 1} / ${slides.length}`;
  overviewJumpLabel.textContent = '페이지 번호 입력';
  jumpEnabled = true;
  updateJumpDisplay();

  slides.forEach((slide, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'overview-slide-card';
    button.setAttribute('aria-label', `${index + 1}번 슬라이드로 이동`);

    if (index === currentSlideIndex) {
      button.classList.add('active');
      button.setAttribute('aria-current', 'true');
    }

    const frame = document.createElement('div');
    frame.className = 'overview-slide-frame';

    const image = document.createElement('img');
    image.className = 'overview-slide-image';
    image.src = getAssetUrl(slide.url);
    image.alt = `슬라이드 ${index + 1}`;
    image.loading = 'lazy';

    const number = document.createElement('span');
    number.className = 'overview-slide-number';
    number.textContent = String(index + 1);

    frame.appendChild(image);
    button.appendChild(frame);
    button.appendChild(number);
    button.addEventListener('click', () => {
      goToSlide(index);
    });

    overviewGrid.appendChild(button);
  });

  requestAnimationFrame(() => {
    const activeSlide = overviewGrid.querySelector('.overview-slide-card.active');
    activeSlide?.scrollIntoView({
      block: 'center',
      inline: 'center'
    });
  });
}

function renderOverview(payload) {
  const hasPpt = Array.isArray(payload.ppt?.slides) && payload.ppt.slides.length > 0;
  overviewPptModeButton.disabled = !hasPpt;

  if (overviewMode === 'ppt' && !hasPpt) {
    overviewMode = 'lyrics';
  }

  if (overviewMode === 'ppt') {
    renderPptOverview(payload);
    return;
  }

  renderLyricsOverview(payload);
}

async function submitJumpBuffer() {
  if (!jumpEnabled || !jumpBuffer || !latestState) {
    return;
  }

  const inputValue = Number(jumpBuffer);

  if (!Number.isInteger(inputValue)) {
    clearJumpBuffer();
    return;
  }

  if (overviewMode === 'ppt') {
    if (!latestState.ppt?.slides?.length) {
      clearJumpBuffer();
      return;
    }

    const slideNumber = Math.min(Math.max(inputValue, 1), latestState.ppt.slides.length);
    await goToSlide(slideNumber - 1);
    return;
  }

  if (!latestState.lyrics?.length) {
    clearJumpBuffer();
    return;
  }

  const lineCount = Number(latestState.state?.displaySettings?.lineCount || 1);
  const totalGroups = Math.ceil(latestState.lyrics.length / lineCount);
  const groupNumber = Math.min(Math.max(inputValue, 1), totalGroups);
  await goToLine((groupNumber - 1) * lineCount);
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'control'
  });
});

socket.on('state', (payload) => {
  latestState = payload;
  overviewMode = payload.viewMode === 'ppt' && Array.isArray(payload.ppt?.slides) && payload.ppt.slides.length > 0
    ? 'ppt'
    : 'lyrics';

  setOverviewMode(overviewMode);
});

socket.on('errorMessage', (payload) => {
  alert(payload.message || '오류가 발생했습니다.');
});

overviewLyricsModeButton.addEventListener('click', () => {
  syncViewMode('lyrics');
});

overviewPptModeButton.addEventListener('click', () => {
  if (latestState?.ppt?.slides?.length) {
    syncViewMode('ppt');
  }
});

document.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
    return;
  }

  if (/^[0-9]$/.test(event.key) && jumpEnabled) {
    event.preventDefault();
    jumpBuffer = `${jumpBuffer}${event.key}`.slice(0, 4);
    updateJumpDisplay();
    return;
  }

  if (event.key === 'Backspace' && jumpEnabled) {
    event.preventDefault();
    jumpBuffer = jumpBuffer.slice(0, -1);
    updateJumpDisplay();
    return;
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    moveOverviewSelection(-1);
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    moveOverviewSelection(1);
    return;
  }

  if (event.key === 'Escape') {
    clearJumpBuffer();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    submitJumpBuffer();
  }
});
