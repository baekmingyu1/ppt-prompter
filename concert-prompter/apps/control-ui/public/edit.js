function isLocalDev() {
  return ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '4000';
}

function getBasePath() {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments[0] === 'prompter' ? '/prompter' : '';
}

const BASE_PATH = getBasePath();
const LYRICS_SERVICE_URL = isLocalDev() ? 'http://localhost:4000' : window.location.origin;

const socket = io(LYRICS_SERVICE_URL, {
  path: `${BASE_PATH}/socket.io`
});

const connectionStatus = document.getElementById('connectionStatus');
const songSelect = document.getElementById('songSelect');
const editTitle = document.getElementById('editTitle');
const editArtist = document.getElementById('editArtist');
const editLyrics = document.getElementById('editLyrics');
const resetEditButton = document.getElementById('resetEditButton');
const saveEditButton = document.getElementById('saveEditButton');
const saveStatus = document.getElementById('saveStatus');
const lineSummary = document.getElementById('lineSummary');

let latestState = null;
let editorDirty = false;
let editorSongId = null;

function getEditorLines() {
  return editLyrics.value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function updateLineSummary() {
  lineSummary.textContent = `${getEditorLines().length}줄`;
}

function setSaveStatus(message, type = '') {
  saveStatus.textContent = message;
  saveStatus.classList.remove('saved', 'error');

  if (type) {
    saveStatus.classList.add(type);
  }
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

function fillEditor(payload) {
  editTitle.value = payload.song.title || '';
  editArtist.value = payload.song.artist || '';
  editLyrics.value = (payload.lyrics || []).join('\n');
  editorSongId = payload.song.id;
  editorDirty = false;
  updateLineSummary();
  setSaveStatus('저장 대기');
}

function renderEditor(payload) {
  if (editorDirty && editorSongId === payload.song.id) {
    return;
  }

  fillEditor(payload);
}

function render(payload) {
  latestState = payload;
  renderSongs(payload);
  renderEditor(payload);
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

[editTitle, editArtist, editLyrics].forEach((element) => {
  element.addEventListener('input', () => {
    editorDirty = true;
    updateLineSummary();
    setSaveStatus('수정 중');
  });
});

resetEditButton.addEventListener('click', () => {
  if (!latestState) {
    return;
  }

  fillEditor(latestState);
});

saveEditButton.addEventListener('click', () => {
  if (!latestState) {
    return;
  }

  const lyrics = getEditorLines();

  saveEditButton.disabled = true;
  setSaveStatus('저장 중');

  socket.emit(
    'control:updateSong',
    {
      songId: latestState.song.id,
      title: editTitle.value,
      artist: editArtist.value,
      lyrics
    },
    (response) => {
      saveEditButton.disabled = false;

      if (!response?.ok) {
        setSaveStatus(response?.message || '저장 실패', 'error');
        return;
      }

      editorDirty = false;
      setSaveStatus('저장 완료', 'saved');
    }
  );
});
