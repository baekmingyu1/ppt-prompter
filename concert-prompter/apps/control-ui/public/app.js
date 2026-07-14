const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';
const MAX_BACKGROUND_IMAGE_MB = Number(PROMPTER_CONFIG.maxBackgroundImageMb || 10);
const MAX_BACKGROUND_IMAGE_BYTES = MAX_BACKGROUND_IMAGE_MB * 1024 * 1024;

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const connectionStatus = document.getElementById('connectionStatus');
const songSelect = document.getElementById('songSelect');
const prevSongButton = document.getElementById('prevSongButton');
const songStartButton = document.getElementById('songStartButton');
const nextSongButton = document.getElementById('nextSongButton');
const songTitle = document.getElementById('songTitle');
const lineCounter = document.getElementById('lineCounter');
const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');
const controlPptPreview = document.getElementById('controlPptPreview');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const blankOnButton = document.getElementById('blankOnButton');
const blankOffButton = document.getElementById('blankOffButton');
const pptInput = document.getElementById('pptInput');
const pptSelect = document.getElementById('pptSelect');
const deletePptButton = document.getElementById('deletePptButton');
const pptStatus = document.getElementById('pptStatus');
const lyricsModeButton = document.getElementById('lyricsModeButton');
const pptModeButton = document.getElementById('pptModeButton');
const prevPptButton = document.getElementById('prevPptButton');
const nextPptButton = document.getElementById('nextPptButton');
const singerControlToggleButton = document.getElementById('singerControlToggleButton');
const singerControlStatus = document.getElementById('singerControlStatus');
const singerLineCounter = document.getElementById('singerLineCounter');
const singerMessageInput = document.getElementById('singerMessageInput');
const singerCurrentLyric = document.getElementById('singerCurrentLyric');
const singerNextLyric = document.getElementById('singerNextLyric');
const singerPrevButton = document.getElementById('singerPrevButton');
const singerNextButton = document.getElementById('singerNextButton');
const lyricsList = document.getElementById('lyricsList');
const fontSizeAudienceInput = document.getElementById('fontSizeAudienceInput');
const fontSizeAudienceValue = document.getElementById('fontSizeAudienceValue');
const fontWeightAudienceInput = document.getElementById('fontWeightAudienceInput');
const fontWeightAudienceValue = document.getElementById('fontWeightAudienceValue');
const fontColorAudienceInput = document.getElementById('fontColorAudienceInput');
const verticalPositionAudienceInput = document.getElementById('verticalPositionAudienceInput');
const verticalPositionAudienceValue = document.getElementById('verticalPositionAudienceValue');
const pptVerticalPositionAudienceInput = document.getElementById('pptVerticalPositionAudienceInput');
const pptVerticalPositionAudienceValue = document.getElementById('pptVerticalPositionAudienceValue');
const audienceBackgroundInput = document.getElementById('audienceBackgroundInput');
const audienceBackgroundStatus = document.getElementById('audienceBackgroundStatus');
const audienceBackgroundClearButton = document.getElementById('audienceBackgroundClearButton');
const audienceBackgroundHint = document.getElementById('audienceBackgroundHint');

const fontSizeSingerInput = document.getElementById('fontSizeSingerInput');
const fontSizeSingerValue = document.getElementById('fontSizeSingerValue');
const fontWeightSingerInput = document.getElementById('fontWeightSingerInput');
const fontWeightSingerValue = document.getElementById('fontWeightSingerValue');
const fontColorSingerInput = document.getElementById('fontColorSingerInput');
const verticalPositionSingerInput = document.getElementById('verticalPositionSingerInput');
const verticalPositionSingerValue = document.getElementById('verticalPositionSingerValue');
const pptVerticalPositionSingerInput = document.getElementById('pptVerticalPositionSingerInput');
const pptVerticalPositionSingerValue = document.getElementById('pptVerticalPositionSingerValue');
const controlCurrentFontSizeInput = document.getElementById('controlCurrentFontSizeInput');
const controlCurrentFontSizeValue = document.getElementById('controlCurrentFontSizeValue');
const controlNextFontSizeInput = document.getElementById('controlNextFontSizeInput');
const controlNextFontSizeValue = document.getElementById('controlNextFontSizeValue');
const singerPreviewCurrentFontSizeInput = document.getElementById('singerPreviewCurrentFontSizeInput');
const singerPreviewCurrentFontSizeValue = document.getElementById('singerPreviewCurrentFontSizeValue');
const singerPreviewNextFontSizeInput = document.getElementById('singerPreviewNextFontSizeInput');
const singerPreviewNextFontSizeValue = document.getElementById('singerPreviewNextFontSizeValue');
const lineCountSelect = document.getElementById('lineCountSelect');
const displayStatus = document.getElementById('displayStatus');
const settingsToggleButton = document.getElementById('settingsToggleButton');
const displaySettingsBody = document.getElementById('displaySettingsBody');
const audienceLink = document.getElementById('audienceLink');
const singerLink = document.getElementById('singerLink');

function getScreenUrl(configuredUrl, localPort, servicePath) {
  if (configuredUrl && !configuredUrl.startsWith('/')) {
    return configuredUrl;
  }

  if (window.location.port === '3000') {
    return `${window.location.protocol}//${window.location.hostname}:${localPort}/`;
  }

  return configuredUrl || `${LYRICS_SERVICE_URL}${servicePath}`;
}

if (audienceLink) {
  audienceLink.href = getScreenUrl(PROMPTER_CONFIG.audienceUrl, 3001, '/audience/');
}

if (singerLink) {
  singerLink.href = getScreenUrl(PROMPTER_CONFIG.singerUrl, 3002, '/singer/');
}

function getAssetUrl(url) {
  if (!url || url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url || '';
  }

  return `${LYRICS_SERVICE_URL}${url}`;
}

if (audienceBackgroundHint) {
  audienceBackgroundHint.textContent = `최대 ${MAX_BACKGROUND_IMAGE_MB}MB`;
}

let latestState = null;
let settingsRenderLocked = false;
let pendingControlDisplaySettings = null;

function isControlDisplaySettingsInput(element) {
  return [
    controlCurrentFontSizeInput,
    controlNextFontSizeInput,
    singerPreviewCurrentFontSizeInput,
    singerPreviewNextFontSizeInput
  ].includes(element);
}

function getControlDisplaySettingsFromInputs() {
  return {
    currentFontSizePx: Number(controlCurrentFontSizeInput.value),
    nextFontSizePx: Number(controlNextFontSizeInput.value),
    singerPreviewCurrentFontSizePx: Number(singerPreviewCurrentFontSizeInput.value),
    singerPreviewNextFontSizePx: Number(singerPreviewNextFontSizeInput.value)
  };
}

function controlDisplaySettingsMatch(left, right) {
  return left.currentFontSizePx === right.currentFontSizePx
    && left.nextFontSizePx === right.nextFontSizePx
    && left.singerPreviewCurrentFontSizePx === right.singerPreviewCurrentFontSizePx
    && left.singerPreviewNextFontSizePx === right.singerPreviewNextFontSizePx;
}

function renderSongs(payload) {
  songSelect.innerHTML = '';

  payload.songs.forEach((song) => {
    const option = document.createElement('option');
    option.value = song.id;
    option.textContent = `${song.title} - ${song.artist || ''}`;
    songSelect.appendChild(option);
  });

  songSelect.value = payload.song.id;

  const currentSongIndex = payload.songs.findIndex((song) => song.id === payload.song.id);
  prevSongButton.disabled = currentSongIndex <= 0;
  songStartButton.disabled = payload.state.lineIndex <= 0;
  nextSongButton.disabled = currentSongIndex === -1 || currentSongIndex >= payload.songs.length - 1;
}

function renderLyricsList(payload) {
  lyricsList.innerHTML = '';

  payload.lyrics.forEach((line, index) => {
    const li = document.createElement('li');
    li.textContent = line || '(빈 줄)';

    const firstVisibleIndex = payload.state.lineIndex;
    const lastVisibleIndex = firstVisibleIndex + payload.state.displaySettings.lineCount - 1;

    if (index >= firstVisibleIndex && index <= lastVisibleIndex) {
      li.classList.add('active');
    }

    li.addEventListener('click', () => {
      socket.emit('control:setLine', {
        lineIndex: index
      });
    });

    lyricsList.appendChild(li);
  });

  const activeLine = lyricsList.querySelector('.active');

  if (activeLine) {
    requestAnimationFrame(() => {
      const scrollContainer = lyricsList.closest('.lyrics-scroll');
      if (!scrollContainer) return;

      const targetTop = activeLine.offsetTop - (scrollContainer.clientHeight / 2) + (activeLine.offsetHeight / 2);
      scrollContainer.scrollTop = Math.max(targetTop, 0);
    });
  }
}

function renderDisplaySettings(payload) {
  const settings = payload.state.displaySettings || {};
  const audience = settings.audience || settings;
  const singer = settings.singer || settings;
  const control = settings.control || {};
  const serverControlDisplaySettings = {
    currentFontSizePx: Number(control.currentFontSizePx || 20),
    nextFontSizePx: Number(control.nextFontSizePx || 20),
    singerPreviewCurrentFontSizePx: Number(control.singerPreviewCurrentFontSizePx || 20),
    singerPreviewNextFontSizePx: Number(control.singerPreviewNextFontSizePx || 20)
  };

  if (
    pendingControlDisplaySettings
    && controlDisplaySettingsMatch(pendingControlDisplaySettings, serverControlDisplaySettings)
  ) {
    pendingControlDisplaySettings = null;
  }

  const controlDisplaySettings = pendingControlDisplaySettings && isControlDisplaySettingsInput(document.activeElement)
    ? pendingControlDisplaySettings
    : serverControlDisplaySettings;

  settingsRenderLocked = true;
  fontSizeAudienceInput.value = audience.fontSizeVw;
  fontSizeAudienceValue.textContent = `${audience.fontSizeVw}vw`;
  fontWeightAudienceInput.value = audience.fontWeight || 800;
  fontWeightAudienceValue.textContent = String(audience.fontWeight || 800);
  fontColorAudienceInput.value = audience.fontColor || '#ffffff';
  verticalPositionAudienceInput.value = audience.verticalPositionPercent || 50;
  verticalPositionAudienceValue.textContent = `${audience.verticalPositionPercent || 50}%`;
  pptVerticalPositionAudienceInput.value = audience.pptVerticalPositionPercent || 50;
  pptVerticalPositionAudienceValue.textContent = `${audience.pptVerticalPositionPercent || 50}%`;
  audienceBackgroundStatus.textContent = audience.backgroundImage ? '현재 배경 적용됨' : '현재 배경 없음';
  audienceBackgroundClearButton.disabled = !audience.backgroundImage;

  fontSizeSingerInput.value = singer.fontSizeVw;
  fontSizeSingerValue.textContent = `${singer.fontSizeVw}vw`;
  fontWeightSingerInput.value = singer.fontWeight || 900;
  fontWeightSingerValue.textContent = String(singer.fontWeight || 900);
  fontColorSingerInput.value = singer.fontColor || '#ffffff';
  verticalPositionSingerInput.value = singer.verticalPositionPercent || 50;
  verticalPositionSingerValue.textContent = `${singer.verticalPositionPercent || 50}%`;
  pptVerticalPositionSingerInput.value = singer.pptVerticalPositionPercent || 50;
  pptVerticalPositionSingerValue.textContent = `${singer.pptVerticalPositionPercent || 50}%`;

  controlCurrentFontSizeInput.value = controlDisplaySettings.currentFontSizePx;
  controlCurrentFontSizeValue.textContent = `${controlDisplaySettings.currentFontSizePx}px`;
  controlNextFontSizeInput.value = controlDisplaySettings.nextFontSizePx;
  controlNextFontSizeValue.textContent = `${controlDisplaySettings.nextFontSizePx}px`;
  singerPreviewCurrentFontSizeInput.value = controlDisplaySettings.singerPreviewCurrentFontSizePx;
  singerPreviewCurrentFontSizeValue.textContent = `${controlDisplaySettings.singerPreviewCurrentFontSizePx}px`;
  singerPreviewNextFontSizeInput.value = controlDisplaySettings.singerPreviewNextFontSizePx;
  singerPreviewNextFontSizeValue.textContent = `${controlDisplaySettings.singerPreviewNextFontSizePx}px`;
  applyControlDisplaySettings(
    controlDisplaySettings.currentFontSizePx,
    controlDisplaySettings.nextFontSizePx,
    controlDisplaySettings.singerPreviewCurrentFontSizePx,
    controlDisplaySettings.singerPreviewNextFontSizePx
  );

  lineCountSelect.value = String(settings.lineCount || audience.lineCount || singer.lineCount || 1);
  settingsRenderLocked = false;
}

function applyControlDisplaySettings(currentFontSizePx, nextFontSizePx, singerPreviewCurrentFontSizePx = 20, singerPreviewNextFontSizePx = 20) {
  currentLyric.style.fontSize = `${currentFontSizePx}px`;
  nextLyric.style.fontSize = `${nextFontSizePx}px`;
  singerCurrentLyric.style.fontSize = `${singerPreviewCurrentFontSizePx}px`;
  singerNextLyric.style.fontSize = `${singerPreviewNextFontSizePx}px`;
}

function setDisplayStatus(message, type = '') {
  displayStatus.textContent = message;
  displayStatus.classList.remove('saved', 'error');

  if (type) {
    displayStatus.classList.add(type);
  }
}

function setDisplaySettingsExpanded(expanded) {
  displaySettingsBody.hidden = !expanded;
  displaySettingsBody.classList.toggle('collapsed', !expanded);
  settingsToggleButton.textContent = expanded ? '접기' : '펼치기';
  settingsToggleButton.setAttribute('aria-expanded', String(expanded));
}

function getLinesText(lines, fallback = '-') {
  return lines?.length ? lines.join('\n') : fallback;
}

function getLineCounterText(payload) {
  const start = payload.state.lineIndex + 1;
  const end = Math.min(
    payload.state.lineIndex + payload.state.displaySettings.lineCount,
    payload.song.totalLines
  );

  return start === end ? `${start} / ${payload.song.totalLines}` : `${start}-${end} / ${payload.song.totalLines}`;
}

function updateCurrentLyricScrollState() {
  requestAnimationFrame(() => {
    const hasOverflow = currentLyric.scrollHeight > currentLyric.clientHeight + 12;
    currentLyric.classList.toggle('is-scrollable', hasOverflow);
    if (!hasOverflow) {
      currentLyric.scrollTop = 0;
    }
  });
}

function updateSingerLyricScrollState() {
  requestAnimationFrame(() => {
    const hasOverflow = singerCurrentLyric.scrollHeight > singerCurrentLyric.clientHeight + 12;
    singerCurrentLyric.classList.toggle('is-scrollable', hasOverflow);
    if (!hasOverflow) {
      singerCurrentLyric.scrollTop = 0;
    }
  });
}

function getSingerLineCounterText(payload) {
  const singerState = payload.singerControl || {};
  if (singerState.enabled) {
    return '별도 문구 표시 중';
  }

  const singerLineIndex = singerState.lineIndex || 0;
  const start = singerLineIndex + 1;
  const end = Math.min(
    singerLineIndex + payload.state.displaySettings.lineCount,
    payload.song.totalLines
  );

  return start === end ? `${start} / ${payload.song.totalLines}` : `${start}-${end} / ${payload.song.totalLines}`;
}

function renderSingerControl(payload) {
  const singerState = payload.singerControl || {};
  const isEnabled = Boolean(singerState.enabled);

  singerControlStatus.textContent = isEnabled ? '가수용 별도 제어 중' : '관객용과 연동 중';
  singerControlToggleButton.textContent = isEnabled ? 'ON' : 'OFF';
  singerControlToggleButton.classList.toggle('primary', isEnabled);
  singerLineCounter.textContent = getSingerLineCounterText(payload);
  if (document.activeElement !== singerMessageInput) {
    singerMessageInput.value = singerState.message || '';
  }
  singerCurrentLyric.textContent = payload.state.blank ? '(鍮??붾㈃)' : getLinesText(singerState.currentLines);
  singerNextLyric.textContent = isEnabled ? '' : (payload.state.blank ? '(鍮??붾㈃)' : getLinesText(singerState.nextLines));
  updateSingerLyricScrollState();
}

function renderPptControl(payload) {
  const ppt = payload.ppt || {};
  const hasPpt = Array.isArray(ppt.slides) && ppt.slides.length > 0;
  const isPptMode = payload.viewMode === 'ppt';
  const pptLibrary = Array.isArray(ppt.library) ? ppt.library : [];

  if (pptSelect) {
    pptSelect.innerHTML = '';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '저장된 PPT 없음';
    pptSelect.appendChild(emptyOption);

    pptLibrary.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.filename || 'PPT'} (${item.totalSlides || 0})`;
      pptSelect.appendChild(option);
    });

    pptSelect.value = ppt.id || '';
    pptSelect.disabled = pptLibrary.length === 0;
  }

  if (deletePptButton) {
    deletePptButton.disabled = !ppt.id || pptLibrary.length === 0;
  }

  pptStatus.textContent = hasPpt
    ? `${ppt.filename || 'PPT'} ${Number(ppt.slideIndex || 0) + 1} / ${ppt.slides.length}`
    : 'PPT 없음';

  lyricsModeButton.classList.toggle('primary', !isPptMode);
  pptModeButton.classList.toggle('primary', isPptMode);
  pptModeButton.disabled = !hasPpt;
  prevPptButton.disabled = !hasPpt || Number(ppt.slideIndex || 0) <= 0;
  nextPptButton.disabled = !hasPpt || Number(ppt.slideIndex || 0) >= ppt.slides.length - 1;
  currentLyric.closest('.current-box')?.classList.toggle('is-ppt-preview', isPptMode && hasPpt);
  nextLyric.closest('.next-box')?.classList.toggle('is-ppt-mode', isPptMode && hasPpt);

  if (isPptMode && hasPpt) {
    currentLyric.hidden = true;
    nextLyric.textContent = 'PPT 화면 표시 중';
    controlPptPreview.hidden = false;
    controlPptPreview.src = getAssetUrl(ppt.currentSlide?.url);
    return;
  }

  currentLyric.hidden = false;
  controlPptPreview.hidden = true;
  controlPptPreview.removeAttribute('src');
}

function renderBlankControl(payload) {
  const isBlank = Boolean(payload.state.blank);
  blankOnButton.classList.toggle('is-selected', isBlank);
  blankOffButton.classList.toggle('is-selected', !isBlank);
  blankOnButton.setAttribute('aria-pressed', String(isBlank));
  blankOffButton.setAttribute('aria-pressed', String(!isBlank));
}

function render(payload) {
  latestState = payload;

  renderSongs(payload);
  renderLyricsList(payload);
  renderDisplaySettings(payload);

  songTitle.textContent = `${payload.song.title} - ${payload.song.artist || ''}`;
  lineCounter.textContent = getLineCounterText(payload);

  currentLyric.textContent = payload.state.blank ? '(빈 화면)' : getLinesText(payload.currentLines);
  nextLyric.textContent = payload.state.blank ? '(빈 화면)' : getLinesText(payload.nextLines);
  updateCurrentLyricScrollState();
  renderSingerControl(payload);
  renderPptControl(payload);
  renderBlankControl(payload);
}

socket.on('connect', () => {
  connectionStatus.textContent = '연결됨';
  connectionStatus.classList.add('connected');

  socket.emit('join', {
    role: 'control'
  });
});

socket.on('disconnect', () => {
  connectionStatus.textContent = '연결 끊김';
  connectionStatus.classList.remove('connected');
});

socket.on('state', (payload) => {
  render(payload);
});

socket.on('errorMessage', (payload) => {
  alert(payload.message || '오류가 발생했습니다.');
});

songSelect.addEventListener('change', () => {
  socket.emit('control:setSong', {
    songId: songSelect.value
  });
});

function moveSong(delta) {
  if (!latestState?.songs?.length) return;

  const currentSongIndex = latestState.songs.findIndex((song) => song.id === latestState.song.id);
  const nextSongIndex = currentSongIndex + delta;
  const nextSong = latestState.songs[nextSongIndex];

  if (!nextSong) return;

  socket.emit('control:setSong', {
    songId: nextSong.id
  });
}

prevSongButton.addEventListener('click', () => {
  moveSong(-1);
});

nextSongButton.addEventListener('click', () => {
  moveSong(1);
});

songStartButton.addEventListener('click', () => {
  socket.emit('control:setLine', {
    lineIndex: 0
  });
});

prevButton.addEventListener('click', () => {
  socket.emit('control:prev');
});

nextButton.addEventListener('click', () => {
  socket.emit('control:next');
});

blankOnButton.addEventListener('click', () => {
  socket.emit('control:blank', {
    blank: true
  });
});

blankOffButton.addEventListener('click', () => {
  socket.emit('control:blank', {
    blank: false
  });
});

lyricsModeButton.addEventListener('click', () => {
  socket.emit('control:setViewMode', {
    mode: 'lyrics'
  });
});

pptModeButton.addEventListener('click', () => {
  socket.emit('control:setViewMode', {
    mode: 'ppt'
  });
});

if (pptSelect) {
  pptSelect.addEventListener('change', () => {
    if (!pptSelect.value) {
      return;
    }

    socket.emit('control:selectPpt', {
      pptId: pptSelect.value
    });
  });
}

if (deletePptButton) {
  deletePptButton.addEventListener('click', () => {
    const pptId = latestState?.ppt?.id || pptSelect?.value || '';
    const filename = latestState?.ppt?.filename || '선택한 PPT';

    if (!pptId) {
      return;
    }

    if (!confirm(`"${filename}" PPT를 삭제할까요?`)) {
      return;
    }

    deletePptButton.disabled = true;
    socket.emit('control:deletePpt', {
      pptId
    }, (response) => {
      if (!response?.ok) {
        alert(response?.message || 'PPT 삭제 실패');
      }
    });
  });
}

prevPptButton.addEventListener('click', () => {
  socket.emit('control:prevPptSlide');
});

nextPptButton.addEventListener('click', () => {
  socket.emit('control:nextPptSlide');
});

singerControlToggleButton.addEventListener('click', () => {
  socket.emit('control:setSingerControl', {
    enabled: !(latestState?.singerControl?.enabled || false)
  });
});

singerPrevButton.addEventListener('click', () => {
  singerMessageInput.value = '';
  socket.emit('control:setSingerMessage', {
    message: ''
  });
});

singerNextButton.addEventListener('click', () => {
  socket.emit('control:setSingerMessage', {
    message: singerMessageInput.value
  });
});

settingsToggleButton.addEventListener('click', () => {
  const expanded = settingsToggleButton.getAttribute('aria-expanded') === 'true';
  setDisplaySettingsExpanded(!expanded);
});

function sendDisplaySettings(settings, target = null) {
  setDisplayStatus('설정 중');

  const payload = target ? { target, settings } : settings;

  socket.emit('control:updateDisplaySettings', payload, (response) => {
    if (!response?.ok) {
      setDisplayStatus(response?.message || '설정 실패', 'error');
      return;
    }

    setDisplayStatus('설정 적용됨', 'saved');
  });
}

[fontSizeAudienceInput, fontWeightAudienceInput, fontColorAudienceInput, verticalPositionAudienceInput, pptVerticalPositionAudienceInput].forEach((el) => {
  el.addEventListener('input', () => {
    if (settingsRenderLocked) return;

    const payload = {
      fontSizeVw: Number(fontSizeAudienceInput.value),
      fontWeight: Number(fontWeightAudienceInput.value),
      fontColor: fontColorAudienceInput.value,
      verticalPositionPercent: Number(verticalPositionAudienceInput.value),
      pptVerticalPositionPercent: Number(pptVerticalPositionAudienceInput.value)
    };

    fontSizeAudienceValue.textContent = `${payload.fontSizeVw}vw`;
    fontWeightAudienceValue.textContent = String(payload.fontWeight);
    verticalPositionAudienceValue.textContent = `${payload.verticalPositionPercent}%`;
    pptVerticalPositionAudienceValue.textContent = `${payload.pptVerticalPositionPercent}%`;
    sendDisplaySettings(payload, 'audience');
  });
});

[fontSizeSingerInput, fontWeightSingerInput, fontColorSingerInput, verticalPositionSingerInput, pptVerticalPositionSingerInput].forEach((el) => {
  el.addEventListener('input', () => {
    if (settingsRenderLocked) return;

    const payload = {
      fontSizeVw: Number(fontSizeSingerInput.value),
      fontWeight: Number(fontWeightSingerInput.value),
      fontColor: fontColorSingerInput.value,
      verticalPositionPercent: Number(verticalPositionSingerInput.value),
      pptVerticalPositionPercent: Number(pptVerticalPositionSingerInput.value)
    };

    fontSizeSingerValue.textContent = `${payload.fontSizeVw}vw`;
    fontWeightSingerValue.textContent = String(payload.fontWeight);
    verticalPositionSingerValue.textContent = `${payload.verticalPositionPercent}%`;
    pptVerticalPositionSingerValue.textContent = `${payload.pptVerticalPositionPercent}%`;
    sendDisplaySettings(payload, 'singer');
  });
});

[controlCurrentFontSizeInput, controlNextFontSizeInput, singerPreviewCurrentFontSizeInput, singerPreviewNextFontSizeInput].forEach((el) => {
  el.addEventListener('input', () => {
    if (settingsRenderLocked) return;

    pendingControlDisplaySettings = getControlDisplaySettingsFromInputs();

    controlCurrentFontSizeValue.textContent = `${pendingControlDisplaySettings.currentFontSizePx}px`;
    controlNextFontSizeValue.textContent = `${pendingControlDisplaySettings.nextFontSizePx}px`;
    singerPreviewCurrentFontSizeValue.textContent = `${pendingControlDisplaySettings.singerPreviewCurrentFontSizePx}px`;
    singerPreviewNextFontSizeValue.textContent = `${pendingControlDisplaySettings.singerPreviewNextFontSizePx}px`;
    applyControlDisplaySettings(
      pendingControlDisplaySettings.currentFontSizePx,
      pendingControlDisplaySettings.nextFontSizePx,
      pendingControlDisplaySettings.singerPreviewCurrentFontSizePx,
      pendingControlDisplaySettings.singerPreviewNextFontSizePx
    );

    sendDisplaySettings({
      ...latestState.state.displaySettings,
      control: {
        ...(latestState.state.displaySettings.control || {}),
        ...pendingControlDisplaySettings
      }
    });
  });
});

lineCountSelect.addEventListener('input', () => {
  if (settingsRenderLocked) return;

  const payload = { lineCount: Number(lineCountSelect.value) };
  sendDisplaySettings(payload);
});

audienceBackgroundInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 업로드할 수 있습니다.');
    audienceBackgroundInput.value = '';
    return;
  }

  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
    alert(`파일이 너무 큽니다. ${MAX_BACKGROUND_IMAGE_MB}MB 이하만 업로드할 수 있습니다.`);
    audienceBackgroundInput.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;

    try {
      const resp = await fetch(`${LYRICS_SERVICE_URL}/api/control/audience/background`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename: file.name, dataUrl })
      });

      const json = await resp.json();
      if (!json.ok) {
        alert(json.message || '업로드 실패');
        audienceBackgroundInput.value = '';
        return;
      }

      // server will emit state; show saved
      setDisplayStatus('배경 업로드 완료', 'saved');
      audienceBackgroundInput.value = '';
    } catch (err) {
      alert('업로드 중 오류가 발생했습니다.');
      audienceBackgroundInput.value = '';
    }
  };

  reader.readAsDataURL(file);
});

audienceBackgroundClearButton.addEventListener('click', () => {
  if (settingsRenderLocked) return;

  sendDisplaySettings({
    backgroundImage: ''
  }, 'audience');
});

pptInput.addEventListener('change', async (event) => {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (!/\.(ppt|pptx)$/i.test(file.name)) {
    alert('PPT 또는 PPTX 파일만 업로드할 수 있습니다.');
    pptInput.value = '';
    return;
  }

  pptStatus.textContent = 'PPT 변환 중';

  try {
    const resp = await fetch(`${LYRICS_SERVICE_URL}/api/control/ppt/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Filename': encodeURIComponent(file.name)
      },
      body: file
    });

    const json = await resp.json();
    if (!json.ok) {
      alert(json.message || 'PPT 업로드 실패');
      pptStatus.textContent = 'PPT 업로드 실패';
      pptInput.value = '';
      return;
    }

    pptStatus.textContent = 'PPT 변환 완료';
    pptInput.value = '';
  } catch (err) {
    alert('PPT 업로드 중 오류가 발생했습니다.');
    pptStatus.textContent = 'PPT 업로드 실패';
    pptInput.value = '';
  }
});

document.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
    return;
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault();
    if (latestState?.viewMode === 'ppt' && latestState?.ppt?.slides?.length) {
      socket.emit('control:nextPptSlide');
      return;
    }

    socket.emit('control:next');
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    if (latestState?.viewMode === 'ppt' && latestState?.ppt?.slides?.length) {
      socket.emit('control:prevPptSlide');
      return;
    }

    socket.emit('control:prev');
  }

  if (event.key === ' ') {
    event.preventDefault();
    socket.emit('control:next');
  }

  if (event.key.toLowerCase() === 'b') {
    const currentBlank = latestState?.state?.blank || false;

    socket.emit('control:blank', {
      blank: !currentBlank
    });
  }
});
