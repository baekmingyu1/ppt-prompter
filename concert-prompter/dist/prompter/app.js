function isLocalDev() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '4000';
}

function getBasePath() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments[0] === 'prompter' ? '/prompter' : '';
}

const BASE_PATH = getBasePath();
const CONFIG = window.PROMPTER_CONFIG || {};
const LYRICS_SERVICE_URL = isLocalDev() ? 'http://localhost:4000' : CONFIG.backendUrl || window.location.origin;

const socket = io(LYRICS_SERVICE_URL, {
  path: CONFIG.socketPath || `${BASE_PATH}/socket.io`
});

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
const fontSizeInput = document.getElementById('fontSizeInput');
const fontSizeValue = document.getElementById('fontSizeValue');
const fontColorInput = document.getElementById('fontColorInput');
const lineCountSelect = document.getElementById('lineCountSelect');
const displayStatus = document.getElementById('displayStatus');
const audienceLink = document.getElementById('audienceLink');
const singerLink = document.getElementById('singerLink');

let latestState = null;
let settingsRenderLocked = false;

if (!isLocalDev()) {
  audienceLink.href = `${window.location.origin}${BASE_PATH}/audience/`;
  singerLink.href = `${window.location.origin}${BASE_PATH}/singer/`;
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

  settingsRenderLocked = true;
  fontSizeInput.value = settings.fontSizeVw;
  fontSizeValue.textContent = `${settings.fontSizeVw}vw`;
  fontColorInput.value = settings.fontColor;
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

[fontSizeInput, fontColorInput, lineCountSelect].forEach((element) => {
  element.addEventListener('input', () => {
    if (settingsRenderLocked) {
      return;
    }

    const payload = {
      fontSizeVw: Number(fontSizeInput.value),
      fontColor: fontColorInput.value,
      lineCount: Number(lineCountSelect.value)
    };

    fontSizeValue.textContent = `${payload.fontSizeVw}vw`;
    setDisplayStatus('설정 중');

    socket.emit('control:updateDisplaySettings', payload, (response) => {
      if (!response?.ok) {
        setDisplayStatus(response?.message || '설정 실패', 'error');
        return;
      }

      setDisplayStatus('설정 적용됨', 'saved');
    });
  });
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
