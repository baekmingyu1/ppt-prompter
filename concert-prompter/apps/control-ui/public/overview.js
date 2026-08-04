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
const overviewProgramSelect = document.getElementById('overviewProgramSelect');

let latestState = null;
let overviewMode = 'lyrics';
let jumpBuffer = '';
let jumpEnabled = false;
let programOverviewEntries = [];

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

function getProgramTypeLabel(type) {
  if (type === 'song') return '곡';
  if (type === 'ppt') return 'PPT';
  if (type === 'video') return '영상';
  return '메모';
}

function renderProgramSelect(payload) {
  const items = payload.program?.items || [];
  const currentItemId = payload.program?.currentItemId || '';

  overviewProgramSelect.innerHTML = '';

  const emptyOption = document.createElement('option');
  emptyOption.value = '';
  emptyOption.textContent = items.length ? '순서 선택' : '순서표 없음';
  overviewProgramSelect.appendChild(emptyOption);

  items.forEach((item, index) => {
    const option = document.createElement('option');
    option.value = item.id;
    option.disabled = Boolean(item.missing);
    option.textContent = `${index + 1}. ${getProgramTypeLabel(item.type)} - ${item.title}${item.missing ? ' (삭제됨)' : ''}`;
    overviewProgramSelect.appendChild(option);
  });

  overviewProgramSelect.disabled = items.length === 0;
  overviewProgramSelect.value = currentItemId || '';
}

function applyProgramItem(programItemId) {
  if (!programItemId) return;

  socket.emit('control:applyProgramItem', {
    programItemId
  });
}

function applyProgramEntry(entry) {
  if (!entry?.programItemId) return;

  socket.emit('control:applyProgramItem', {
    programItemId: entry.programItemId,
    lineIndex: entry.lineIndex,
    slideIndex: entry.slideIndex
  });
  clearJumpBuffer();
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

  if (programOverviewEntries.length) {
    const currentIndex = programOverviewEntries.findIndex((entry) => entry.active);
    const fallbackIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = Math.min(Math.max(fallbackIndex + delta, 0), programOverviewEntries.length - 1);

    if (nextIndex !== currentIndex) {
      applyProgramEntry(programOverviewEntries[nextIndex]);
    }
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

function buildProgramOverviewEntries(payload) {
  const items = payload.program?.items || [];
  const lineCount = Number(payload.state?.displaySettings?.lineCount || 1);
  const currentItemId = payload.program?.currentItemId || '';
  const currentLineIndex = Number(payload.state?.lineIndex || 0);
  const currentSlideIndex = Number(payload.ppt?.slideIndex || 0);
  const entries = [];

  items.forEach((item, itemIndex) => {
    if (item.missing) return;

    if (item.type === 'song') {
      const lyrics = Array.isArray(item.lyrics) ? item.lyrics : [];
      for (let lineIndex = 0; lineIndex < lyrics.length; lineIndex += lineCount) {
        const groupLines = lyrics.slice(lineIndex, lineIndex + lineCount);
        const groupEndIndex = lineIndex + groupLines.length - 1;
        entries.push({
          type: 'song',
          programItemId: item.id,
          title: item.title,
          itemNumber: itemIndex + 1,
          lineIndex,
          lines: groupLines,
          firstSongCard: lineIndex === 0,
          active: item.id === currentItemId && currentLineIndex >= lineIndex && currentLineIndex <= groupEndIndex
        });
      }
      return;
    }

    if (item.type === 'ppt') {
      const slides = Array.isArray(item.slides) ? item.slides : [];
      slides.forEach((slide, slideIndex) => {
        entries.push({
          type: 'ppt',
          programItemId: item.id,
          title: item.title,
          itemNumber: itemIndex + 1,
          slideIndex,
          slide,
          active: item.id === currentItemId && currentSlideIndex === slideIndex
        });
      });
      return;
    }

    if (item.type === 'video') {
      entries.push({
        type: 'video',
        programItemId: item.id,
        title: item.title,
        itemNumber: itemIndex + 1,
        filename: item.filename,
        source: item.source,
        active: item.id === currentItemId
      });
      return;
    }

    entries.push({
      type: 'note',
      programItemId: item.id,
      title: item.title,
      itemNumber: itemIndex + 1,
      active: item.id === currentItemId
    });
  });

  return entries;
}

function renderProgramOverview(payload) {
  programOverviewEntries = buildProgramOverviewEntries(payload);
  overviewGrid.innerHTML = '';
  overviewGrid.classList.add('overview-lyrics-grid');
  overviewGrid.classList.remove('overview-ppt-grid');
  overviewEmptyState.hidden = true;
  overviewGrid.hidden = programOverviewEntries.length === 0;
  overviewSubtitle.textContent = `예배 순서표 ${programOverviewEntries.length}개 카드`;
  overviewJumpLabel.textContent = '순서 카드 번호';
  jumpEnabled = programOverviewEntries.length > 0;
  updateJumpDisplay();

  if (!programOverviewEntries.length) {
    renderEmptyState('순서표 내용이 없습니다', '제어 화면에서 예배 순서표에 곡 또는 PPT를 추가해 주세요.');
    return;
  }

  programOverviewEntries.forEach((entry, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = entry.type === 'ppt' ? 'overview-slide-card' : 'overview-program-lyric-card';
    button.classList.toggle('active', entry.active);
    button.classList.toggle('first-song-card', entry.firstSongCard);
    button.setAttribute('aria-label', `${index + 1}번 순서 카드로 이동`);

    if (entry.type === 'ppt') {
      const frame = document.createElement('div');
      frame.className = 'overview-slide-frame';
      const image = document.createElement('img');
      image.className = 'overview-slide-image';
      image.src = getAssetUrl(entry.slide?.url);
      image.alt = `${entry.title} 슬라이드 ${entry.slideIndex + 1}`;
      image.loading = 'lazy';
      const number = document.createElement('span');
      number.className = 'overview-slide-number';
      number.textContent = `${index + 1}`;
      frame.appendChild(image);
      button.append(frame, number);
    } else {
      const text = document.createElement('span');
      text.className = 'overview-lyric-text';
      if (entry.type === 'note') {
        text.textContent = `[메모] ${entry.title}`;
      } else if (entry.type === 'video') {
        text.textContent = `[${entry.source === 'youtube' ? 'YouTube' : '영상'}] ${entry.title || entry.filename || '영상'}`;
      } else {
        text.textContent = entry.lines.map((line) => line || '(빈 줄)').join('\n');
      }
      const number = document.createElement('span');
      number.className = 'overview-slide-number';
      number.textContent = String(index + 1);
      button.append(text, number);
    }

    button.addEventListener('click', () => {
      applyProgramEntry(entry);
    });
    overviewGrid.appendChild(button);
  });

  requestAnimationFrame(() => {
    const activeCard = overviewGrid.querySelector('.active');
    activeCard?.scrollIntoView({
      block: 'center',
      inline: 'center'
    });
  });
}

function renderOverview(payload) {
  const hasProgram = Array.isArray(payload.program?.items) && payload.program.items.length > 0;
  if (hasProgram) {
    renderProgramOverview(payload);
    return;
  }

  programOverviewEntries = [];
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

  if (programOverviewEntries.length) {
    const cardNumber = Math.min(Math.max(inputValue, 1), programOverviewEntries.length);
    applyProgramEntry(programOverviewEntries[cardNumber - 1]);
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
  renderProgramSelect(payload);
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

overviewProgramSelect.addEventListener('change', () => {
  applyProgramItem(overviewProgramSelect.value);
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
