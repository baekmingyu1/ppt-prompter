const PROMPTER_CONFIG = window.__PROMPTER_CONFIG__ || {};
const LYRICS_SERVICE_URL = PROMPTER_CONFIG.lyricsServiceUrl || '';

const socket = LYRICS_SERVICE_URL ? io(LYRICS_SERVICE_URL) : io();

const connectionStatus = document.getElementById('connectionStatus');
const songSelect = document.getElementById('songSelect');
const newSongButton = document.getElementById('newSongButton');
const editorHeading = document.getElementById('editorHeading');
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
let creatingSong = false;

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

  if (!creatingSong) {
    songSelect.value = payload.song.id;
  }
}

function fillEditor(payload) {
  editTitle.value = payload.song.title || '';
  editArtist.value = payload.song.artist || '';
  editLyrics.value = (payload.lyrics || []).join('\n');
  editorSongId = payload.song.id;
  editorDirty = false;
  creatingSong = false;
  editorHeading.textContent = '곡 정보 및 가사';
  updateLineSummary();
  setSaveStatus('저장 대기');
}

function startCreatingSong() {
  creatingSong = true;
  editorDirty = false;
  editorSongId = null;
  songSelect.value = '';
  editTitle.value = '';
  editArtist.value = '';
  editLyrics.value = '';
  editorHeading.textContent = '새 곡 추가';
  updateLineSummary();
  setSaveStatus('새 곡 작성 중');
  editTitle.focus();
}

function renderEditor(payload) {
  if (creatingSong) {
    return;
  }

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
  creatingSong = false;
  socket.emit('control:setSong', {
    songId: songSelect.value
  });
});

newSongButton.addEventListener('click', () => {
  startCreatingSong();
});

[editTitle, editArtist, editLyrics].forEach((element) => {
  element.addEventListener('input', () => {
    editorDirty = true;
    updateLineSummary();
    setSaveStatus(creatingSong ? '새 곡 수정 중' : '수정 중');
  });
});

resetEditButton.addEventListener('click', () => {
  if (creatingSong) {
    startCreatingSong();
    return;
  }

  if (!latestState) {
    return;
  }

  fillEditor(latestState);
});

saveEditButton.addEventListener('click', () => {
  if (!latestState && !creatingSong) {
    return;
  }

  const lyrics = getEditorLines();
  const payload = {
    title: editTitle.value,
    artist: editArtist.value,
    lyrics
  };

  saveEditButton.disabled = true;
  setSaveStatus(creatingSong ? '새 곡 저장 중' : '저장 중');

  if (creatingSong) {
    socket.emit('control:createSong', payload, (response) => {
      saveEditButton.disabled = false;

      if (!response?.ok) {
        setSaveStatus(response?.message || '새 곡 저장 실패', 'error');
        return;
      }

      creatingSong = false;
      editorDirty = false;
      setSaveStatus('새 곡 저장 완료', 'saved');
    });
    return;
  }

  socket.emit(
    'control:updateSong',
    {
      songId: latestState.song.id,
      ...payload
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
