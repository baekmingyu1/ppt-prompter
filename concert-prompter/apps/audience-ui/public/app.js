const LYRICS_SERVICE_URL = 'http://localhost:4000';

const socket = io(LYRICS_SERVICE_URL);
const lyric = document.getElementById('lyric');

function render(payload) {
  if (payload.blank) {
    lyric.textContent = '';
    return;
  }

  lyric.textContent = payload.current || '';
}

socket.on('connect', () => {
  socket.emit('join', {
    role: 'audience'
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
