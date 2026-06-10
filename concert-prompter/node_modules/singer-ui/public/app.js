const LYRICS_SERVICE_URL = 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);

const currentLyric = document.getElementById('currentLyric');
const nextLyric = document.getElementById('nextLyric');

function render(payload) {
  if (payload.blank) {
    currentLyric.textContent = '';
    nextLyric.textContent = '';
    return;
  }

  currentLyric.textContent = payload.current || '';
  nextLyric.textContent = payload.next || '';
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'singer'
  });
});

socket.on('state', (payload) => {
  render(payload);
});

document.addEventListener('dblclick', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  }
});
