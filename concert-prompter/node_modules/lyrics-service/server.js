import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const PORT = Number(process.env.PORT || 4000);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SONGS_PATH = path.join(__dirname, 'data', 'songs.json');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let songs = [];
let state = {
  songId: null,
  lineIndex: 0,
  blank: false,
  displaySettings: {
    fontSizeVw: 6,
    fontColor: '#ffffff',
    lineCount: 1
  },
  updatedAt: new Date().toISOString()
};

async function loadSongs() {
  const raw = await fs.readFile(SONGS_PATH, 'utf-8');
  songs = JSON.parse(raw);

  if (!Array.isArray(songs) || songs.length === 0) {
    throw new Error('songs.json에 곡 데이터가 없습니다.');
  }

  if (!state.songId) {
    state.songId = songs[0].id;
  }
}

async function saveSongs() {
  await fs.writeFile(SONGS_PATH, `${JSON.stringify(songs, null, 2)}\n`, 'utf-8');
}

function getCurrentSong() {
  return songs.find((song) => song.id === state.songId) || songs[0];
}

function clampLineIndex(index, song) {
  const maxIndex = Math.max((song.lyrics || []).length - 1, 0);
  return Math.min(Math.max(index, 0), maxIndex);
}

function touchState() {
  state.updatedAt = new Date().toISOString();
}

function getVisibleLines(lyrics, startIndex, count) {
  return lyrics.slice(startIndex, startIndex + count);
}

function normalizeDisplaySettings(settings = {}) {
  const fontSizeVw = Number(settings.fontSizeVw);
  const lineCount = Number(settings.lineCount);
  const fontColor = String(settings.fontColor || '').trim();

  if (!Number.isFinite(fontSizeVw) || fontSizeVw < 3 || fontSizeVw > 12) {
    throw new Error('폰트 크기는 3부터 12 사이여야 합니다.');
  }

  if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > 4) {
    throw new Error('노출 줄 수는 1부터 4 사이의 정수여야 합니다.');
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(fontColor)) {
    throw new Error('폰트 색상은 #RRGGBB 형식이어야 합니다.');
  }

  return {
    fontSizeVw,
    fontColor,
    lineCount
  };
}

function updateDisplaySettings(settings) {
  state.displaySettings = normalizeDisplaySettings({
    ...state.displaySettings,
    ...settings
  });
  touchState();
}

function buildControlPayload() {
  const song = getCurrentSong();
  const lyrics = song.lyrics || [];
  const lineCount = state.displaySettings.lineCount;
  const currentLines = state.blank ? [] : getVisibleLines(lyrics, state.lineIndex, lineCount);
  const nextLines = state.blank ? [] : getVisibleLines(lyrics, state.lineIndex + lineCount, lineCount);
  const current = state.blank ? '' : lyrics[state.lineIndex] || '';
  const next = nextLines[0] || '';

  return {
    role: 'control',
    state,
    songs: songs.map((item) => ({
      id: item.id,
      title: item.title,
      artist: item.artist,
      totalLines: (item.lyrics || []).length
    })),
    song: {
      id: song.id,
      title: song.title,
      artist: song.artist,
      totalLines: lyrics.length
    },
    current,
    next,
    currentLines,
    nextLines,
    lyrics
  };
}

function buildAudiencePayload() {
  const song = getCurrentSong();
  const lyrics = song.lyrics || [];
  const lineCount = state.displaySettings.lineCount;
  const currentLines = state.blank ? [] : getVisibleLines(lyrics, state.lineIndex, lineCount);

  return {
    role: 'audience',
    blank: state.blank,
    songTitle: song.title,
    artist: song.artist,
    lineIndex: state.lineIndex,
    totalLines: lyrics.length,
    displaySettings: state.displaySettings,
    current: currentLines[0] || '',
    currentLines
  };
}

function buildSingerPayload() {
  const song = getCurrentSong();
  const lyrics = song.lyrics || [];
  const lineCount = state.displaySettings.lineCount;
  const currentLines = state.blank ? [] : getVisibleLines(lyrics, state.lineIndex, lineCount);
  const nextLines = state.blank ? [] : getVisibleLines(lyrics, state.lineIndex + lineCount, lineCount);

  return {
    role: 'singer',
    blank: state.blank,
    songTitle: song.title,
    artist: song.artist,
    lineIndex: state.lineIndex,
    totalLines: lyrics.length,
    displaySettings: state.displaySettings,
    current: currentLines[0] || '',
    next: nextLines[0] || '',
    currentLines,
    nextLines
  };
}

function emitState() {
  io.to('control').emit('state', buildControlPayload());
  io.to('audience').emit('state', buildAudiencePayload());
  io.to('singer').emit('state', buildSingerPayload());
}

function setSong(songId) {
  const exists = songs.some((song) => song.id === songId);

  if (!exists) {
    throw new Error(`존재하지 않는 songId입니다: ${songId}`);
  }

  state.songId = songId;
  state.lineIndex = 0;
  state.blank = false;
  touchState();
}

function moveLine(delta) {
  const song = getCurrentSong();
  state.lineIndex = clampLineIndex(state.lineIndex + delta * state.displaySettings.lineCount, song);
  state.blank = false;
  touchState();
}

function setLineIndex(index) {
  const song = getCurrentSong();
  state.lineIndex = clampLineIndex(index, song);
  state.blank = false;
  touchState();
}

function toggleBlank(blank) {
  state.blank = Boolean(blank);
  touchState();
}

async function updateSong({ songId, title, artist, lyrics }) {
  const song = songs.find((item) => item.id === songId);

  if (!song) {
    throw new Error(`존재하지 않는 songId입니다: ${songId}`);
  }

  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('곡 제목은 필수입니다.');
  }

  if (!Array.isArray(lyrics) || lyrics.length === 0) {
    throw new Error('가사는 한 줄 이상 입력해야 합니다.');
  }

  song.title = title.trim();
  song.artist = typeof artist === 'string' ? artist.trim() : '';
  song.lyrics = lyrics.map((line) => String(line).trim()).filter(Boolean);

  if (song.lyrics.length === 0) {
    throw new Error('가사는 한 줄 이상 입력해야 합니다.');
  }

  if (state.songId === song.id) {
    state.lineIndex = clampLineIndex(state.lineIndex, song);
    state.blank = false;
  }

  touchState();
  await saveSongs();
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'lyrics-service',
    port: PORT
  });
});

app.get('/api/songs', (req, res) => {
  res.json({
    songs
  });
});

app.get('/api/state/control', (req, res) => {
  res.json(buildControlPayload());
});

app.get('/api/state/audience', (req, res) => {
  res.json(buildAudiencePayload());
});

app.get('/api/state/singer', (req, res) => {
  res.json(buildSingerPayload());
});

app.post('/api/control/song', (req, res) => {
  try {
    const { songId } = req.body;
    setSong(songId);
    emitState();

    res.json({
      ok: true,
      state
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});

app.post('/api/control/next', (req, res) => {
  moveLine(1);
  emitState();

  res.json({
    ok: true,
    state
  });
});

app.post('/api/control/prev', (req, res) => {
  moveLine(-1);
  emitState();

  res.json({
    ok: true,
    state
  });
});

app.post('/api/control/line', (req, res) => {
  const lineIndex = Number(req.body.lineIndex);

  if (!Number.isInteger(lineIndex)) {
    res.status(400).json({
      ok: false,
      message: 'lineIndex는 정수여야 합니다.'
    });
    return;
  }

  setLineIndex(lineIndex);
  emitState();

  res.json({
    ok: true,
    state
  });
});

app.post('/api/control/blank', (req, res) => {
  toggleBlank(req.body.blank);
  emitState();

  res.json({
    ok: true,
    state
  });
});

app.post('/api/control/display-settings', (req, res) => {
  try {
    updateDisplaySettings(req.body);
    emitState();

    res.json({
      ok: true,
      state
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});

app.post('/api/control/song/update', async (req, res) => {
  try {
    await updateSong(req.body);
    emitState();

    res.json({
      ok: true,
      state
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});

io.on('connection', (socket) => {
  socket.on('join', (payload = {}) => {
    const role = payload.role;

    if (!['control', 'audience', 'singer'].includes(role)) {
      socket.emit('errorMessage', {
        message: 'role은 control, audience, singer 중 하나여야 합니다.'
      });
      return;
    }

    socket.join(role);

    if (role === 'control') {
      socket.emit('state', buildControlPayload());
    }

    if (role === 'audience') {
      socket.emit('state', buildAudiencePayload());
    }

    if (role === 'singer') {
      socket.emit('state', buildSingerPayload());
    }
  });

  socket.on('control:next', () => {
    moveLine(1);
    emitState();
  });

  socket.on('control:prev', () => {
    moveLine(-1);
    emitState();
  });

  socket.on('control:setSong', ({ songId }) => {
    try {
      setSong(songId);
      emitState();
    } catch (error) {
      socket.emit('errorMessage', {
        message: error.message
      });
    }
  });

  socket.on('control:setLine', ({ lineIndex }) => {
    const parsedLineIndex = Number(lineIndex);

    if (!Number.isInteger(parsedLineIndex)) {
      socket.emit('errorMessage', {
        message: 'lineIndex는 정수여야 합니다.'
      });
      return;
    }

    setLineIndex(parsedLineIndex);
    emitState();
  });

  socket.on('control:blank', ({ blank }) => {
    toggleBlank(blank);
    emitState();
  });

  socket.on('control:updateDisplaySettings', (payload, callback) => {
    try {
      updateDisplaySettings(payload);
      emitState();

      if (typeof callback === 'function') {
        callback({
          ok: true
        });
      }
    } catch (error) {
      if (typeof callback === 'function') {
        callback({
          ok: false,
          message: error.message
        });
        return;
      }

      socket.emit('errorMessage', {
        message: error.message
      });
    }
  });

  socket.on('control:updateSong', async (payload, callback) => {
    try {
      await updateSong(payload);
      emitState();

      if (typeof callback === 'function') {
        callback({
          ok: true
        });
      }
    } catch (error) {
      if (typeof callback === 'function') {
        callback({
          ok: false,
          message: error.message
        });
        return;
      }

      socket.emit('errorMessage', {
        message: error.message
      });
    }
  });
});

await loadSongs();

server.listen(PORT, () => {
  console.log(`[lyrics-service] running on http://localhost:${PORT}`);
});
