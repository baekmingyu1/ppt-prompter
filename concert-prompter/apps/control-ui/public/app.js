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

let latestState = null;

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

    if (index === payload.state.lineIndex) {
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

function render(payload) {
  latestState = payload;

  renderSongs(payload);
  renderLyricsList(payload);

  songTitle.textContent = `${payload.song.title} - ${payload.song.artist || ''}`;
  lineCounter.textContent = `${payload.state.lineIndex + 1} / ${payload.song.totalLines}`;

  currentLyric.textContent = payload.state.blank ? '(빈 화면)' : payload.current || '-';
  nextLyric.textContent = payload.state.blank ? '(빈 화면)' : payload.next || '-';
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
