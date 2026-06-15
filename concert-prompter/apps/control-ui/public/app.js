const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';
const MAX_BACKGROUND_IMAGE_MB = Number(PROMPTER_CONFIG.maxBackgroundImageMb || 10);
const MAX_BACKGROUND_IMAGE_BYTES = MAX_BACKGROUND_IMAGE_MB * 1024 * 1024;

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const connectionStatus = document.getElementById('connectionStatus');
const songSelect = document.getElementById('songSelect');
const songTitle = document.getElementById('songTitle');
const lineCounter = document.getElementById('lineCounter');
const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const blankOnButton = document.getElementById('blankOnButton');
const blankOffButton = document.getElementById('blankOffButton');
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
const audienceBackgroundInput = document.getElementById('audienceBackgroundInput');
const audienceBackgroundHint = document.getElementById('audienceBackgroundHint');

const fontSizeSingerInput = document.getElementById('fontSizeSingerInput');
const fontSizeSingerValue = document.getElementById('fontSizeSingerValue');
const fontWeightSingerInput = document.getElementById('fontWeightSingerInput');
const fontWeightSingerValue = document.getElementById('fontWeightSingerValue');
const fontColorSingerInput = document.getElementById('fontColorSingerInput');
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

if (audienceBackgroundHint) {
  audienceBackgroundHint.textContent = `최대 ${MAX_BACKGROUND_IMAGE_MB}MB`;
}

let latestState = null;
let settingsRenderLocked = false;

function renderSongs(payload) {
  songSelect.innerHTML = '';

  payload.songs.forEach((song) => {
    const option = document.createElement('option');
    option.value = song.id;
    option.textContent = `${song.title} - ${song.artist || ''}`;
    songSelect.appendChild(option);
  });

  songSelect.value = payload.song.id;
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
      activeLine.scrollIntoView({
        block: 'center',
        behavior: 'smooth'
      });
    });
  }
}

function renderDisplaySettings(payload) {
  const settings = payload.state.displaySettings || {};
  const audience = settings.audience || settings;
  const singer = settings.singer || settings;

  settingsRenderLocked = true;
  fontSizeAudienceInput.value = audience.fontSizeVw;
  fontSizeAudienceValue.textContent = `${audience.fontSizeVw}vw`;
  fontWeightAudienceInput.value = audience.fontWeight || 800;
  fontWeightAudienceValue.textContent = String(audience.fontWeight || 800);
  fontColorAudienceInput.value = audience.fontColor || '#ffffff';

  fontSizeSingerInput.value = singer.fontSizeVw;
  fontSizeSingerValue.textContent = `${singer.fontSizeVw}vw`;
  fontWeightSingerInput.value = singer.fontWeight || 900;
  fontWeightSingerValue.textContent = String(singer.fontWeight || 900);
  fontColorSingerInput.value = singer.fontColor || '#ffffff';

  lineCountSelect.value = String(settings.lineCount || audience.lineCount || singer.lineCount || 1);
  settingsRenderLocked = false;
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

[fontSizeAudienceInput, fontWeightAudienceInput, fontColorAudienceInput].forEach((el) => {
  el.addEventListener('input', () => {
    if (settingsRenderLocked) return;

    const payload = {
      fontSizeVw: Number(fontSizeAudienceInput.value),
      fontWeight: Number(fontWeightAudienceInput.value),
      fontColor: fontColorAudienceInput.value
    };

    fontSizeAudienceValue.textContent = `${payload.fontSizeVw}vw`;
    fontWeightAudienceValue.textContent = String(payload.fontWeight);
    sendDisplaySettings(payload, 'audience');
  });
});

[fontSizeSingerInput, fontWeightSingerInput, fontColorSingerInput].forEach((el) => {
  el.addEventListener('input', () => {
    if (settingsRenderLocked) return;

    const payload = {
      fontSizeVw: Number(fontSizeSingerInput.value),
      fontWeight: Number(fontWeightSingerInput.value),
      fontColor: fontColorSingerInput.value
    };

    fontSizeSingerValue.textContent = `${payload.fontSizeVw}vw`;
    fontWeightSingerValue.textContent = String(payload.fontWeight);
    sendDisplaySettings(payload, 'singer');
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

document.addEventListener('keydown', (event) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) {
    return;
  }

  if (event.key === 'ArrowRight' || event.key === ' ') {
    event.preventDefault();
    socket.emit('control:next');
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    socket.emit('control:prev');
  }

  if (event.key.toLowerCase() === 'b') {
    const currentBlank = latestState?.state?.blank || false;

    socket.emit('control:blank', {
      blank: !currentBlank
    });
  }
});
