const LYRICS_SERVICE_URL = 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);

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
const lyricsList = document.getElementById('lyricsList');
const audienceFontSizeInput = document.getElementById('audienceFontSizeInput');
const audienceFontSizeValue = document.getElementById('audienceFontSizeValue');
const audienceFontColorInput = document.getElementById('audienceFontColorInput');
const audienceBackgroundInput = document.getElementById('audienceBackgroundInput');
const audienceBackgroundName = document.getElementById('audienceBackgroundName');
const clearAudienceBackgroundButton = document.getElementById('clearAudienceBackgroundButton');
const singerFontSizeInput = document.getElementById('singerFontSizeInput');
const singerFontSizeValue = document.getElementById('singerFontSizeValue');
const singerFontColorInput = document.getElementById('singerFontColorInput');
const lineCountSelect = document.getElementById('lineCountSelect');
const displayStatus = document.getElementById('displayStatus');
const audienceLink = document.getElementById('audienceLink');
const singerLink = document.getElementById('singerLink');

const MAX_BACKGROUND_IMAGE_BYTES = 10 * 1024 * 1024;

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
}

function renderDisplaySettings(payload) {
  const settings = payload.state.displaySettings;
  const audienceSettings = settings.audience || settings;
  const singerSettings = settings.singer || settings;

  settingsRenderLocked = true;
  audienceFontSizeInput.value = audienceSettings.fontSizeVw;
  audienceFontSizeValue.textContent = `${audienceSettings.fontSizeVw}vw`;
  audienceFontColorInput.value = audienceSettings.fontColor;
  audienceBackgroundName.textContent = audienceSettings.backgroundImage ? '배경 이미지 적용됨' : '이미지 없음';
  clearAudienceBackgroundButton.disabled = !audienceSettings.backgroundImage;
  singerFontSizeInput.value = singerSettings.fontSizeVw;
  singerFontSizeValue.textContent = `${singerSettings.fontSizeVw}vw`;
  singerFontColorInput.value = singerSettings.fontColor;
  lineCountSelect.value = String(settings.lineCount);
  settingsRenderLocked = false;
}

function setDisplayStatus(message, type = '') {
  displayStatus.textContent = message;
  displayStatus.classList.remove('saved', 'error');

  if (type) {
    displayStatus.classList.add(type);
  }
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

function render(payload) {
  latestState = payload;

  renderSongs(payload);
  renderLyricsList(payload);
  renderDisplaySettings(payload);

  songTitle.textContent = `${payload.song.title} - ${payload.song.artist || ''}`;
  lineCounter.textContent = getLineCounterText(payload);

  currentLyric.textContent = payload.state.blank ? '(빈 화면)' : getLinesText(payload.currentLines);
  nextLyric.textContent = payload.state.blank ? '(빈 화면)' : getLinesText(payload.nextLines);
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

function buildDisplaySettingsPayload(overrides = {}) {
  return {
    lineCount: Number(lineCountSelect.value),
    audience: {
      fontSizeVw: Number(audienceFontSizeInput.value),
      fontColor: audienceFontColorInput.value,
      backgroundImage: latestState?.state?.displaySettings?.audience?.backgroundImage || ''
    },
    singer: {
      fontSizeVw: Number(singerFontSizeInput.value),
      fontColor: singerFontColorInput.value
    },
    ...overrides
  };
}

function updateDisplaySettings(payload) {
  setDisplayStatus('설정 중');

  socket.emit('control:updateDisplaySettings', payload, (response) => {
    if (!response?.ok) {
      setDisplayStatus(response?.message || '설정 실패', 'error');
      return;
    }

    setDisplayStatus('설정 적용됨', 'saved');
  });
}

[
  audienceFontSizeInput,
  audienceFontColorInput,
  singerFontSizeInput,
  singerFontColorInput,
  lineCountSelect
].forEach((element) => {
  element.addEventListener('input', () => {
    if (settingsRenderLocked) {
      return;
    }

    audienceFontSizeValue.textContent = `${audienceFontSizeInput.value}vw`;
    singerFontSizeValue.textContent = `${singerFontSizeInput.value}vw`;
    updateDisplaySettings(buildDisplaySettingsPayload());
  });
});

audienceBackgroundInput.addEventListener('change', () => {
  const file = audienceBackgroundInput.files?.[0];

  if (!file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    setDisplayStatus('이미지 파일만 선택할 수 있습니다.', 'error');
    audienceBackgroundInput.value = '';
    return;
  }

  if (file.size > MAX_BACKGROUND_IMAGE_BYTES) {
    setDisplayStatus('배경 이미지는 10MB 이하만 가능합니다.', 'error');
    audienceBackgroundInput.value = '';
    return;
  }

  const reader = new FileReader();

  reader.addEventListener('load', () => {
    const payload = buildDisplaySettingsPayload({
      audience: {
        fontSizeVw: Number(audienceFontSizeInput.value),
        fontColor: audienceFontColorInput.value,
        backgroundImage: reader.result
      }
    });

    audienceBackgroundName.textContent = file.name;
    updateDisplaySettings(payload);
    audienceBackgroundInput.value = '';
  });

  reader.addEventListener('error', () => {
    setDisplayStatus('이미지를 읽지 못했습니다.', 'error');
    audienceBackgroundInput.value = '';
  });

  reader.readAsDataURL(file);
});

clearAudienceBackgroundButton.addEventListener('click', () => {
  const payload = buildDisplaySettingsPayload({
    audience: {
      fontSizeVw: Number(audienceFontSizeInput.value),
      fontColor: audienceFontColorInput.value,
      backgroundImage: ''
    }
  });

  audienceBackgroundName.textContent = '이미지 없음';
  updateDisplaySettings(payload);
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
