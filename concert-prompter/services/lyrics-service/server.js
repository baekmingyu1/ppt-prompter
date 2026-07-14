import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  getClientConfig,
  getPortEnv,
  getPositiveNumberEnv
} from '../../config/runtime.js';

const PORT = getPortEnv('PORT', 4000);
const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SONGS_PATH = process.env.SONGS_PATH || path.join(__dirname, 'data', 'songs.json');
const PPTS_PATH = process.env.PPTS_PATH || path.join(__dirname, 'data', 'ppts.json');
const PROGRAM_PATH = process.env.PROGRAM_PATH || path.join(__dirname, 'data', 'program.json');
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CONTROL_UI_PATH = path.join(PROJECT_ROOT, 'apps', 'control-ui', 'public');
const AUDIENCE_UI_PATH = path.join(PROJECT_ROOT, 'apps', 'audience-ui', 'public');
const SINGER_UI_PATH = path.join(PROJECT_ROOT, 'apps', 'singer-ui', 'public');
const UPLOADS_PATH = path.join(__dirname, 'uploads');
const PPT_UPLOADS_PATH = path.join(UPLOADS_PATH, 'ppt');
const MAX_PPT_UPLOAD_MB = getPositiveNumberEnv('MAX_PPT_UPLOAD_MB', 50);
const MAX_PPT_UPLOAD_BYTES = MAX_PPT_UPLOAD_MB * 1024 * 1024;
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT || `${Math.ceil(MAX_PPT_UPLOAD_MB * 1.4)}mb`;
const MAX_BACKGROUND_IMAGE_MB = getPositiveNumberEnv('MAX_BACKGROUND_IMAGE_MB', 10);
const MAX_BACKGROUND_IMAGE_BYTES = MAX_BACKGROUND_IMAGE_MB * 1024 * 1024;
const SOCKET_MAX_BUFFER_MB = getPositiveNumberEnv('SOCKET_MAX_BUFFER_MB', 20);
const SOCKET_MAX_BUFFER_BYTES = SOCKET_MAX_BUFFER_MB * 1024 * 1024;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

const app = express();
const server = http.createServer(app);

function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

const clientConfig = getClientConfig({
  lyricsServiceUrl: '',
  audienceUrl: '/audience/',
  singerUrl: '/singer/'
});

app.use(cors({
  origin: CORS_ORIGIN
}));
app.use(express.json({
  limit: JSON_BODY_LIMIT
}));

app.get('/config.js', (req, res) => {
  setNoStore(res);
  res.type('application/javascript');
  res.send(`window.__PROMPTER_CONFIG__ = ${JSON.stringify(clientConfig)};`);
});

app.get('/', (req, res) => {
  res.redirect('/control/');
});

app.use('/control', express.static(CONTROL_UI_PATH, {
  setHeaders: setNoStore
}));
app.use('/audience', express.static(AUDIENCE_UI_PATH, {
  setHeaders: setNoStore
}));
app.use('/singer', express.static(SINGER_UI_PATH, {
  setHeaders: setNoStore
}));
app.use('/uploads', express.static(UPLOADS_PATH));

app.get('/control', (req, res) => {
  res.redirect('/control/');
});

app.get('/audience', (req, res) => {
  res.redirect('/audience/');
});

app.get('/singer', (req, res) => {
  res.redirect('/singer/');
});

app.get('/control/edit', (req, res) => {
  res.sendFile(path.join(CONTROL_UI_PATH, 'edit.html'));
});

app.get('/control/overview', (req, res) => {
  res.sendFile(path.join(CONTROL_UI_PATH, 'overview.html'));
});

app.get('/control/presenter', (req, res) => {
  res.sendFile(path.join(CONTROL_UI_PATH, 'presenter.html'));
});

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: SOCKET_MAX_BUFFER_BYTES
});

const DEFAULT_DISPLAY_SETTINGS = {
  lineCount: 1,
  audience: {
    fontSizeVw: 6,
    fontWeight: 800,
    fontColor: '#ffffff',
    backgroundImage: '',
    verticalPositionPercent: 50,
    pptVerticalPositionPercent: 50
  },
  singer: {
    fontSizeVw: 6,
    fontWeight: 900,
    fontColor: '#ffffff',
    verticalPositionPercent: 50,
    pptVerticalPositionPercent: 50
  },
  control: {
    currentFontSizePx: 20,
    nextFontSizePx: 20,
    singerPreviewCurrentFontSizePx: 20,
    singerPreviewNextFontSizePx: 20
  }
};

let songs = [];
let ppts = [];
let programItems = [];
let state = {
  songId: null,
  programItemId: '',
  lineIndex: 0,
  viewMode: 'lyrics',
  ppt: {
    id: '',
    filename: '',
    slideIndex: 0,
    slides: []
  },
  singerControl: {
    enabled: false,
    lineIndex: 0,
    message: ''
  },
  emergencyMessage: '',
  blank: false,
  displaySettings: JSON.parse(JSON.stringify(DEFAULT_DISPLAY_SETTINGS)),
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

async function loadPpts() {
  try {
    const raw = await fs.readFile(PPTS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    ppts = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    ppts = [];
    await savePpts();
  }

  const libraryChanged = await reconcilePptLibraryFromUploads();
  if (libraryChanged) {
    await savePpts();
  }

  if (ppts.length > 0 && !state.ppt.id) {
    setPptById(ppts[0].id, {
      switchToPptMode: false
    });
  }
}

async function loadProgram() {
  try {
    const raw = await fs.readFile(PROGRAM_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    programItems = Array.isArray(parsed) ? parsed.map(normalizeProgramItem).filter(Boolean) : [];
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    programItems = [];
    await saveProgram();
  }
}

async function saveSongs() {
  await fs.writeFile(SONGS_PATH, `${JSON.stringify(songs, null, 2)}\n`, 'utf-8');
}

async function savePpts() {
  await fs.mkdir(path.dirname(PPTS_PATH), {
    recursive: true
  });
  await fs.writeFile(PPTS_PATH, `${JSON.stringify(ppts, null, 2)}\n`, 'utf-8');
}

async function saveProgram() {
  await fs.mkdir(path.dirname(PROGRAM_PATH), {
    recursive: true
  });
  await fs.writeFile(PROGRAM_PATH, `${JSON.stringify(programItems, null, 2)}\n`, 'utf-8');
}

async function reconcilePptLibraryFromUploads() {
  let uploadDirs = [];

  try {
    uploadDirs = await fs.readdir(PPT_UPLOADS_PATH, {
      withFileTypes: true
    });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }

  let changed = false;
  const knownIds = new Set(ppts.map((ppt) => ppt.id));

  for (const item of uploadDirs) {
    if (!item.isDirectory() || knownIds.has(item.name)) {
      continue;
    }

    const uploadDir = path.join(PPT_UPLOADS_PATH, item.name);
    const slideDir = path.join(uploadDir, 'slides');
    let slideFiles = [];

    try {
      slideFiles = (await fs.readdir(slideDir))
        .filter((slideFile) => slideFile.toLowerCase().endsWith('.png'))
        .sort((a, b) => a.localeCompare(b, undefined, {
          numeric: true,
          sensitivity: 'base'
        }));
    } catch {
      continue;
    }

    if (slideFiles.length === 0) {
      continue;
    }

    const sourceFile = (await fs.readdir(uploadDir))
      .find((file) => /^source\.(ppt|pptx)$/i.test(file));
    const stat = await fs.stat(uploadDir);

    ppts.push({
      id: item.name,
      filename: sourceFile || 'presentation.pptx',
      createdAt: stat.birthtime?.toISOString?.() || new Date().toISOString(),
      slideIndex: 0,
      slides: slideFiles.map((slideFile, index) => ({
        index,
        url: `/uploads/ppt/${item.name}/slides/${encodeURIComponent(slideFile)}`
      }))
    });
    changed = true;
  }

  return changed;
}

function createSongId() {
  const numbers = songs
    .map((song) => {
      const match = String(song.id || '').match(/^song-(\d+)$/);
      return match ? Number(match[1]) : 0;
    })
    .filter((value) => Number.isFinite(value));
  const nextNumber = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `song-${String(nextNumber).padStart(3, '0')}`;
}

function createProgramItemId() {
  return `program-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProgramItem(item) {
  if (!item || typeof item !== 'object') return null;

  const type = ['song', 'ppt', 'note'].includes(item.type) ? item.type : 'note';
  const title = String(item.title || '').trim();
  const refId = String(item.refId || '').trim();

  if (type !== 'note' && !refId) return null;
  if (type === 'note' && !title) return null;

  return {
    id: String(item.id || createProgramItemId()),
    type,
    title: title || '',
    refId,
    createdAt: item.createdAt || new Date().toISOString()
  };
}

function getProgramPayload() {
  return programItems.map((item) => {
    const song = item.type === 'song' ? songs.find((entry) => entry.id === item.refId) : null;
    const ppt = item.type === 'ppt' ? ppts.find((entry) => entry.id === item.refId) : null;
    const missing = (item.type === 'song' && !song) || (item.type === 'ppt' && !ppt);
    const title = item.title
      || (song ? `${song.title} - ${song.artist || ''}` : '')
      || (ppt ? ppt.filename : '')
      || '메모';

    return {
      ...item,
      title,
      missing
    };
  });
}

function getProgramItemIndex(programItemId) {
  return programItems.findIndex((item) => item.id === programItemId);
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

function getCurrentPptSlide() {
  return state.ppt.slides[state.ppt.slideIndex] || null;
}

function normalizeViewMode(mode) {
  return mode === 'ppt' ? 'ppt' : 'lyrics';
}

function clampPptSlideIndex(index) {
  const maxIndex = Math.max(state.ppt.slides.length - 1, 0);
  return Math.min(Math.max(index, 0), maxIndex);
}

function getPptLibraryPayload() {
  return ppts.map((ppt) => ({
    id: ppt.id,
    filename: ppt.filename,
    totalSlides: Array.isArray(ppt.slides) ? ppt.slides.length : 0,
    createdAt: ppt.createdAt
  }));
}

function setPptById(pptId, options = {}) {
  const ppt = ppts.find((item) => item.id === pptId);

  if (!ppt) {
    throw new Error(`Unknown pptId: ${pptId}`);
  }

  state.ppt = {
    id: ppt.id,
    filename: ppt.filename,
    slideIndex: 0,
    slides: Array.isArray(ppt.slides) ? ppt.slides : []
  };

  if (options.switchToPptMode !== false) {
    state.viewMode = 'ppt';
  }

  touchState();
}

function getPptUploadDir(pptId) {
  const uploadDir = path.resolve(PPT_UPLOADS_PATH, String(pptId || ''));
  const uploadsRoot = path.resolve(PPT_UPLOADS_PATH);

  if (uploadDir !== uploadsRoot && uploadDir.startsWith(`${uploadsRoot}${path.sep}`)) {
    return uploadDir;
  }

  throw new Error('Invalid pptId.');
}

function getDataUrlParts(dataUrl) {
  const raw = String(dataUrl || '');
  const commaIndex = raw.indexOf(',');

  if (commaIndex === -1 || !raw.startsWith('data:')) {
    throw new Error('Invalid data URL.');
  }

  const metadata = raw.slice(0, commaIndex);
  const body = raw.slice(commaIndex + 1);

  if (!metadata.includes(';base64')) {
    throw new Error('Only base64 data URLs are supported.');
  }

  return {
    metadata,
    body
  };
}

function getSafePptExtension(filename) {
  const extension = path.extname(String(filename || '')).toLowerCase();

  if (!['.ppt', '.pptx'].includes(extension)) {
    throw new Error('PPT 또는 PPTX 파일만 업로드할 수 있습니다.');
  }

  return extension;
}

async function convertPptToImages(inputPath, outputDir) {
  const script = `
$ErrorActionPreference = 'Stop'
$inputPath = [System.IO.Path]::GetFullPath('${inputPath.replaceAll("'", "''")}')
$outputDir = [System.IO.Path]::GetFullPath('${outputDir.replaceAll("'", "''")}')
$powerPoint = $null
$presentation = $null
try {
  New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
  $powerPoint = New-Object -ComObject PowerPoint.Application
  $presentation = $powerPoint.Presentations.Open($inputPath, $true, $false, $false)
  $presentation.Export($outputDir, 'PNG', 1920, 1080)
} finally {
  if ($presentation -ne $null) { $presentation.Close() | Out-Null }
  if ($powerPoint -ne $null) { $powerPoint.Quit() | Out-Null }
}
`;

  await execFileAsync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    windowsHide: true,
    timeout: 120000
  });
}

async function uploadPpt({ filename, fileBuffer }) {
  const extension = getSafePptExtension(filename);
  const pptBuffer = Buffer.isBuffer(fileBuffer) ? fileBuffer : Buffer.from(fileBuffer || []);

  if (pptBuffer.byteLength === 0) {
    throw new Error('PPT 파일이 비어 있습니다.');
  }

  if (pptBuffer.byteLength > MAX_PPT_UPLOAD_BYTES) {
    throw new Error(`PPT 파일은 ${MAX_PPT_UPLOAD_MB}MB 이하만 업로드할 수 있습니다.`);
  }

  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const uploadDir = path.join(PPT_UPLOADS_PATH, uploadId);
  const inputPath = path.join(uploadDir, `source${extension}`);
  const slideDir = path.join(uploadDir, 'slides');

  await fs.mkdir(uploadDir, {
    recursive: true
  });
  await fs.writeFile(inputPath, pptBuffer);
  await convertPptToImages(inputPath, slideDir);

  const slideFiles = (await fs.readdir(slideDir))
    .filter((item) => item.toLowerCase().endsWith('.png'))
    .sort((a, b) => a.localeCompare(b, undefined, {
      numeric: true,
      sensitivity: 'base'
    }));

  if (slideFiles.length === 0) {
    throw new Error('PPT 슬라이드 변환 결과가 없습니다.');
  }

  const pptEntry = {
    id: uploadId,
    filename: String(filename || 'presentation.pptx'),
    createdAt: new Date().toISOString(),
    slideIndex: 0,
    slides: slideFiles.map((item, index) => ({
      index,
      url: `/uploads/ppt/${uploadId}/slides/${encodeURIComponent(item)}`
    }))
  };
  ppts.push(pptEntry);
  state.ppt = {
    id: pptEntry.id,
    filename: pptEntry.filename,
    slideIndex: 0,
    slides: pptEntry.slides
  };
  state.viewMode = 'ppt';
  touchState();
  await savePpts();
}

function getSingerMessageLines() {
  return String(state.singerControl.message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function getEffectiveSingerLineIndex(song = getCurrentSong()) {
  const baseIndex = state.singerControl.enabled ? state.singerControl.lineIndex : state.lineIndex;
  return clampLineIndex(baseIndex, song);
}

function syncSingerLineIndex(song = getCurrentSong()) {
  state.singerControl.lineIndex = state.singerControl.enabled
    ? clampLineIndex(state.singerControl.lineIndex, song)
    : state.lineIndex;
}

function normalizeRoleSettings(settings = {}, role) {
  const fontSizeVw = Number(settings.fontSizeVw);
  const fontWeight = Number(settings.fontWeight);
  const fontColor = String(settings.fontColor || '').trim();
  const verticalPositionPercent = Number(settings.verticalPositionPercent);
  const pptVerticalPositionPercent = Number(settings.pptVerticalPositionPercent ?? 50);

  if (!Number.isFinite(fontSizeVw) || fontSizeVw < 3 || fontSizeVw > 12) {
    throw new Error('폰트 크기는 3부터 12 사이여야 합니다.');
  }

  if (!Number.isInteger(fontWeight) || fontWeight < 300 || fontWeight > 900 || fontWeight % 100 !== 0) {
    throw new Error('폰트 굵기는 300부터 900 사이의 100 단위여야 합니다.');
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(fontColor)) {
    throw new Error('폰트 색상은 #RRGGBB 형식이어야 합니다.');
  }

  if (!Number.isFinite(verticalPositionPercent) || verticalPositionPercent < 10 || verticalPositionPercent > 90) {
    throw new Error('vertical position must be between 10 and 90.');
  }

  if (!Number.isFinite(pptVerticalPositionPercent) || pptVerticalPositionPercent < 10 || pptVerticalPositionPercent > 90) {
    throw new Error('PPT vertical position must be between 10 and 90.');
  }

  const normalized = {
    fontSizeVw,
    fontWeight,
    fontColor,
    verticalPositionPercent,
    pptVerticalPositionPercent
  };

  if (role === 'audience') {
    const backgroundImage = String(settings.backgroundImage || '');

    if (backgroundImage && !backgroundImage.startsWith('data:image/')) {
      throw new Error('배경 이미지는 이미지 파일만 사용할 수 있습니다.');
    }

    if (backgroundImage && getDataUrlByteLength(backgroundImage) > MAX_BACKGROUND_IMAGE_BYTES) {
      throw new Error(`배경 이미지는 ${MAX_BACKGROUND_IMAGE_MB}MB 이하만 사용할 수 있습니다.`);
    }

    normalized.backgroundImage = backgroundImage;
  }

  return normalized;
}

function normalizeControlSettings(settings = {}) {
  const currentFontSizePx = Number(settings.currentFontSizePx);
  const nextFontSizePx = Number(settings.nextFontSizePx);
  const singerPreviewCurrentFontSizePx = Number(settings.singerPreviewCurrentFontSizePx);
  const singerPreviewNextFontSizePx = Number(settings.singerPreviewNextFontSizePx);

  if (!Number.isFinite(currentFontSizePx) || currentFontSizePx < 12 || currentFontSizePx > 72) {
    throw new Error('control current font size must be between 12 and 72.');
  }

  if (!Number.isFinite(nextFontSizePx) || nextFontSizePx < 12 || nextFontSizePx > 72) {
    throw new Error('control next font size must be between 12 and 72.');
  }

  if (!Number.isFinite(singerPreviewCurrentFontSizePx) || singerPreviewCurrentFontSizePx < 12 || singerPreviewCurrentFontSizePx > 72) {
    throw new Error('singer preview current font size must be between 12 and 72.');
  }

  if (!Number.isFinite(singerPreviewNextFontSizePx) || singerPreviewNextFontSizePx < 12 || singerPreviewNextFontSizePx > 72) {
    throw new Error('singer preview next font size must be between 12 and 72.');
  }

  return {
    currentFontSizePx,
    nextFontSizePx,
    singerPreviewCurrentFontSizePx,
    singerPreviewNextFontSizePx
  };
}

function getDataUrlByteLength(dataUrl) {
  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex === -1) {
    return Buffer.byteLength(dataUrl, 'utf8');
  }

  const metadata = dataUrl.slice(0, commaIndex);
  const body = dataUrl.slice(commaIndex + 1);

  if (metadata.includes(';base64')) {
    return Buffer.byteLength(body, 'base64');
  }

  try {
    return Buffer.byteLength(decodeURIComponent(body), 'utf8');
  } catch {
    throw new Error('배경 이미지 데이터 형식이 올바르지 않습니다.');
  }
}

function normalizeDisplaySettings(settings = {}) {
  const migratedSettings = {
    ...DEFAULT_DISPLAY_SETTINGS,
    ...settings,
    audience: {
      ...DEFAULT_DISPLAY_SETTINGS.audience,
      ...(settings.audience || {})
    },
    singer: {
      ...DEFAULT_DISPLAY_SETTINGS.singer,
      ...(settings.singer || {})
    },
    control: {
      ...DEFAULT_DISPLAY_SETTINGS.control,
      ...(settings.control || {})
    }
  };

  if (settings.fontSizeVw !== undefined || settings.fontColor !== undefined || settings.fontWeight !== undefined) {
    migratedSettings.audience.fontSizeVw = Number(settings.fontSizeVw ?? migratedSettings.audience.fontSizeVw);
    migratedSettings.audience.fontWeight = Number(settings.fontWeight ?? migratedSettings.audience.fontWeight);
    migratedSettings.audience.fontColor = String(settings.fontColor ?? migratedSettings.audience.fontColor);
    migratedSettings.singer.fontSizeVw = Number(settings.fontSizeVw ?? migratedSettings.singer.fontSizeVw);
    migratedSettings.singer.fontWeight = Number(settings.fontWeight ?? migratedSettings.singer.fontWeight);
    migratedSettings.singer.fontColor = String(settings.fontColor ?? migratedSettings.singer.fontColor);
  }

  const lineCount = Number(migratedSettings.lineCount);

  if (!Number.isInteger(lineCount) || lineCount < 1 || lineCount > 4) {
    throw new Error('노출 줄 수는 1부터 4 사이의 정수여야 합니다.');
  }

  return {
    lineCount,
    audience: normalizeRoleSettings(migratedSettings.audience, 'audience'),
    singer: normalizeRoleSettings(migratedSettings.singer, 'singer'),
    control: normalizeControlSettings(migratedSettings.control)
  };
}

function buildDisplaySettingsUpdate(payload = {}) {
  if (payload.target && payload.settings) {
    if (!['audience', 'singer', 'control'].includes(payload.target)) {
      throw new Error('target은 audience, singer 또는 control이어야 합니다.');
    }

    const nextSettings = {
      ...state.displaySettings,
      audience: {
        ...state.displaySettings.audience
      },
      singer: {
        ...state.displaySettings.singer
      },
      control: {
        ...state.displaySettings.control
      }
    };

    if (payload.settings.lineCount !== undefined) {
      nextSettings.lineCount = payload.settings.lineCount;
    }

    nextSettings[payload.target] = {
      ...nextSettings[payload.target],
      ...payload.settings
    };
    delete nextSettings[payload.target].lineCount;

    return nextSettings;
  }

  return {
    ...state.displaySettings,
    ...payload
  };
}

function updateDisplaySettings(settings) {
  state.displaySettings = normalizeDisplaySettings(buildDisplaySettingsUpdate(settings));
  touchState();
}

function getEmergencyLines() {
  const message = String(state.emergencyMessage || '').trim();
  return message ? message.split(/\r?\n/).filter(Boolean) : [];
}

function buildControlPayload() {
  const song = getCurrentSong();
  const lyrics = song.lyrics || [];
  const lineCount = state.displaySettings.lineCount;
  const emergencyLines = state.blank ? [] : getEmergencyLines();
  const currentLines = state.blank ? [] : (emergencyLines.length ? emergencyLines : getVisibleLines(lyrics, state.lineIndex, lineCount));
  const nextLines = state.blank ? [] : getVisibleLines(lyrics, state.lineIndex + lineCount, lineCount);
  const singerLineIndex = getEffectiveSingerLineIndex(song);
  const singerMessageLines = getSingerMessageLines();
  const singerCurrentLines = state.blank
    ? []
    : (emergencyLines.length ? emergencyLines : (state.singerControl.enabled ? singerMessageLines : getVisibleLines(lyrics, singerLineIndex, lineCount)));
  const singerNextLines = state.singerControl.enabled
    ? []
    : (state.blank ? [] : getVisibleLines(lyrics, singerLineIndex + lineCount, lineCount));
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
    program: {
      currentItemId: state.programItemId,
      items: getProgramPayload()
    },
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
    lyrics,
    viewMode: state.viewMode,
    ppt: {
      ...state.ppt,
      currentSlide: getCurrentPptSlide(),
      library: getPptLibraryPayload()
    },
    singerControl: {
      enabled: state.singerControl.enabled,
      lineIndex: singerLineIndex,
      message: state.singerControl.message,
      current: singerCurrentLines[0] || '',
      next: singerNextLines[0] || '',
      currentLines: singerCurrentLines,
      nextLines: singerNextLines
    }
  };
}

function buildAudiencePayload() {
  const song = getCurrentSong();
  const lyrics = song.lyrics || [];
  const lineCount = state.displaySettings.lineCount;
  const emergencyLines = state.blank ? [] : getEmergencyLines();
  const currentLines = state.blank ? [] : (emergencyLines.length ? emergencyLines : getVisibleLines(lyrics, state.lineIndex, lineCount));

  return {
    role: 'audience',
    blank: state.blank,
    songTitle: song.title,
    artist: song.artist,
    lineIndex: state.lineIndex,
    totalLines: lyrics.length,
    viewMode: state.viewMode,
    ppt: {
      id: state.ppt.id,
      filename: state.ppt.filename,
      slideIndex: state.ppt.slideIndex,
      totalSlides: state.ppt.slides.length,
      currentSlide: getCurrentPptSlide()
    },
    displaySettings: {
      ...state.displaySettings.audience,
      lineCount: state.displaySettings.lineCount
    },
    current: currentLines[0] || '',
    currentLines,
    lyrics
  };
}

function buildSingerPayload() {
  const song = getCurrentSong();
  const lyrics = song.lyrics || [];
  const lineCount = state.displaySettings.lineCount;
  const lineIndex = getEffectiveSingerLineIndex(song);
  const messageLines = getSingerMessageLines();
  const emergencyLines = state.blank ? [] : getEmergencyLines();
  const currentLines = state.blank
    ? []
    : (emergencyLines.length ? emergencyLines : (state.singerControl.enabled ? messageLines : getVisibleLines(lyrics, lineIndex, lineCount)));
  const nextLines = state.blank || state.singerControl.enabled
    ? []
    : getVisibleLines(lyrics, lineIndex + lineCount, lineCount);

  return {
    role: 'singer',
    blank: state.blank,
    songTitle: song.title,
    artist: song.artist,
    lineIndex,
    totalLines: lyrics.length,
    viewMode: state.viewMode,
    ppt: {
      id: state.ppt.id,
      filename: state.ppt.filename,
      slideIndex: state.ppt.slideIndex,
      totalSlides: state.ppt.slides.length,
      currentSlide: getCurrentPptSlide()
    },
    separateControlEnabled: state.singerControl.enabled,
    displaySettings: {
      ...state.displaySettings.singer,
      lineCount: state.displaySettings.lineCount
    },
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
  syncSingerLineIndex(getCurrentSong());
  touchState();
}

function moveLine(delta) {
  const song = getCurrentSong();
  state.lineIndex = clampLineIndex(state.lineIndex + delta * state.displaySettings.lineCount, song);
  syncSingerLineIndex(song);
  touchState();
}

function setLineIndex(index) {
  const song = getCurrentSong();
  state.lineIndex = clampLineIndex(index, song);
  syncSingerLineIndex(song);
  touchState();
}

function setSingerControlEnabled(enabled) {
  state.singerControl.enabled = Boolean(enabled);
  state.singerControl.lineIndex = state.lineIndex;
  touchState();
}

function setSingerMessage(message) {
  const nextMessage = String(message || '').slice(0, 1000);
  state.singerControl.message = nextMessage;
  state.singerControl.enabled = Boolean(nextMessage.trim());
  touchState();
}

function toggleBlank(blank) {
  state.blank = Boolean(blank);
  touchState();
}

function setEmergencyMessage(message) {
  const nextMessage = String(message || '').trim().slice(0, 500);
  state.emergencyMessage = nextMessage;

  if (nextMessage) {
    state.viewMode = 'lyrics';
  }

  touchState();
}

function setViewMode(mode) {
  state.viewMode = normalizeViewMode(mode);
  touchState();
}

function movePptSlide(delta) {
  if (state.ppt.slides.length === 0) return;

  state.ppt.slideIndex = clampPptSlideIndex(state.ppt.slideIndex + delta);
  state.viewMode = 'ppt';
  touchState();
}

function setPptSlideIndex(index) {
  if (state.ppt.slides.length === 0) return;

  state.ppt.slideIndex = clampPptSlideIndex(index);
  state.viewMode = 'ppt';
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
    syncSingerLineIndex(song);
  }

  touchState();
  await saveSongs();
}

async function createSong({ title, artist, lyrics }) {
  if (typeof title !== 'string' || title.trim() === '') {
    throw new Error('곡 제목은 필수입니다.');
  }

  if (!Array.isArray(lyrics) || lyrics.length === 0) {
    throw new Error('가사는 한 줄 이상 입력해야 합니다.');
  }

  const nextSong = {
    id: createSongId(),
    title: title.trim(),
    artist: typeof artist === 'string' ? artist.trim() : '',
    lyrics: lyrics.map((line) => String(line).trim()).filter(Boolean)
  };

  if (nextSong.lyrics.length === 0) {
    throw new Error('가사는 한 줄 이상 입력해야 합니다.');
  }

  songs.push(nextSong);
  state.songId = nextSong.id;
  state.lineIndex = 0;
  syncSingerLineIndex(nextSong);
  touchState();
  await saveSongs();
}

async function deleteSong(songId) {
  if (songs.length <= 1) {
    throw new Error('At least one song must remain.');
  }

  const songIndex = songs.findIndex((item) => item.id === songId);

  if (songIndex === -1) {
    throw new Error(`Unknown songId: ${songId}`);
  }

  const wasCurrentSong = state.songId === songId;
  songs.splice(songIndex, 1);

  if (wasCurrentSong) {
    const nextSong = songs[Math.min(songIndex, songs.length - 1)];
    state.songId = nextSong.id;
    state.lineIndex = 0;
    syncSingerLineIndex(nextSong);
  }

  touchState();
  await saveSongs();
}

async function deletePpt(pptId) {
  const pptIndex = ppts.findIndex((item) => item.id === pptId);

  if (pptIndex === -1) {
    throw new Error(`Unknown pptId: ${pptId}`);
  }

  const wasCurrentPpt = state.ppt.id === pptId;
  ppts.splice(pptIndex, 1);

  try {
    await fs.rm(getPptUploadDir(pptId), {
      recursive: true,
      force: true
    });
  } catch {
    // The index is the source of truth; missing files should not block cleanup.
  }

  if (wasCurrentPpt) {
    if (ppts.length > 0) {
      const nextPpt = ppts[Math.min(pptIndex, ppts.length - 1)];
      setPptById(nextPpt.id, {
        switchToPptMode: state.viewMode === 'ppt'
      });
    } else {
      state.ppt = {
        id: '',
        filename: '',
        slideIndex: 0,
        slides: []
      };
      state.viewMode = 'lyrics';
      touchState();
    }
  } else {
    touchState();
  }

  await savePpts();
}

async function addProgramItem({ type, refId, title }) {
  const normalizedType = ['song', 'ppt', 'note'].includes(type) ? type : 'note';
  const itemTitle = String(title || '').trim();
  const itemRefId = String(refId || '').trim();

  if (normalizedType === 'song' && !songs.some((song) => song.id === itemRefId)) {
    throw new Error('Unknown songId.');
  }

  if (normalizedType === 'ppt' && !ppts.some((ppt) => ppt.id === itemRefId)) {
    throw new Error('Unknown pptId.');
  }

  if (normalizedType === 'note' && !itemTitle) {
    throw new Error('메모 내용을 입력해 주세요.');
  }

  const song = normalizedType === 'song' ? songs.find((entry) => entry.id === itemRefId) : null;
  const ppt = normalizedType === 'ppt' ? ppts.find((entry) => entry.id === itemRefId) : null;
  const nextItem = {
    id: createProgramItemId(),
    type: normalizedType,
    refId: normalizedType === 'note' ? '' : itemRefId,
    title: itemTitle || (song ? `${song.title} - ${song.artist || ''}` : ppt?.filename || ''),
    createdAt: new Date().toISOString()
  };

  programItems.push(nextItem);
  await saveProgram();
  touchState();
  return nextItem;
}

async function deleteProgramItem(programItemId) {
  const itemIndex = getProgramItemIndex(programItemId);

  if (itemIndex === -1) {
    throw new Error('Unknown program item.');
  }

  programItems.splice(itemIndex, 1);

  if (state.programItemId === programItemId) {
    state.programItemId = '';
  }

  await saveProgram();
  touchState();
}

async function moveProgramItem(programItemId, direction) {
  const itemIndex = getProgramItemIndex(programItemId);
  const nextIndex = itemIndex + Number(direction);

  if (itemIndex === -1 || nextIndex < 0 || nextIndex >= programItems.length) {
    return;
  }

  const [item] = programItems.splice(itemIndex, 1);
  programItems.splice(nextIndex, 0, item);
  await saveProgram();
  touchState();
}

function applyProgramItem(programItemId) {
  const item = programItems.find((entry) => entry.id === programItemId);

  if (!item) {
    throw new Error('Unknown program item.');
  }

  state.programItemId = item.id;

  if (item.type === 'song') {
    setSong(item.refId);
    return;
  }

  if (item.type === 'ppt') {
    setPptById(item.refId);
    return;
  }

  touchState();
}

function buildBackupPayload() {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    songs,
    ppts,
    programItems,
    displaySettings: state.displaySettings
  };
}

async function restoreBackup(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup payload.');
  }

  const nextSongs = Array.isArray(payload.songs) ? payload.songs : [];
  if (nextSongs.length === 0) {
    throw new Error('백업에 곡 목록이 없습니다.');
  }

  songs = nextSongs.map((song, index) => ({
    id: String(song.id || `song-${String(index + 1).padStart(3, '0')}`),
    title: String(song.title || '').trim() || `곡 ${index + 1}`,
    artist: String(song.artist || '').trim(),
    lyrics: Array.isArray(song.lyrics)
      ? song.lyrics.map((line) => String(line).trim()).filter(Boolean)
      : ['가사를 입력해 주세요']
  }));
  ppts = Array.isArray(payload.ppts) ? payload.ppts : [];
  programItems = Array.isArray(payload.programItems)
    ? payload.programItems.map(normalizeProgramItem).filter(Boolean)
    : [];
  state.displaySettings = normalizeDisplaySettings(payload.displaySettings || state.displaySettings);
  state.songId = songs[0].id;
  state.lineIndex = 0;
  state.programItemId = '';
  state.emergencyMessage = '';
  state.blank = false;
  state.viewMode = 'lyrics';
  state.singerControl = {
    enabled: false,
    lineIndex: 0,
    message: ''
  };

  if (ppts.length > 0) {
    setPptById(ppts[0].id, {
      switchToPptMode: false
    });
  } else {
    state.ppt = {
      id: '',
      filename: '',
      slideIndex: 0,
      slides: []
    };
  }

  await saveSongs();
  await savePpts();
  await saveProgram();
  touchState();
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

app.get('/api/backup', (req, res) => {
  res.json(buildBackupPayload());
});

app.post('/api/backup/restore', async (req, res) => {
  try {
    await restoreBackup(req.body);
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

app.post('/api/control/emergency-message', (req, res) => {
  setEmergencyMessage(req.body.message);
  emitState();

  res.json({
    ok: true,
    state
  });
});

app.post('/api/control/view-mode', (req, res) => {
  setViewMode(req.body.mode);
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

app.post('/api/control/audience/background', (req, res) => {
  try {
    const dataUrl = String(req.body.dataUrl || '');

    updateDisplaySettings({
      target: 'audience',
      settings: {
        backgroundImage: dataUrl
      }
    });
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

app.post('/api/control/ppt/upload', express.raw({
  type: 'application/octet-stream',
  limit: `${MAX_PPT_UPLOAD_MB}mb`
}), async (req, res) => {
  try {
    const encodedFilename = String(req.headers['x-filename'] || '');
    const filename = encodedFilename ? decodeURIComponent(encodedFilename) : '';

    await uploadPpt({
      filename,
      fileBuffer: req.body
    });
    emitState();

    res.json({
      ok: true,
      ppt: state.ppt
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});

app.post('/api/control/ppt/select', (req, res) => {
  try {
    setPptById(String(req.body.pptId || ''));
    emitState();

    res.json({
      ok: true,
      ppt: state.ppt
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      message: error.message
    });
  }
});

app.post('/api/control/ppt/delete', async (req, res) => {
  try {
    await deletePpt(String(req.body.pptId || ''));
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

app.post('/api/control/ppt/slide', (req, res) => {
  const slideIndex = Number(req.body.slideIndex);

  if (!Number.isInteger(slideIndex)) {
    res.status(400).json({
      ok: false,
      message: 'slideIndex must be an integer.'
    });
    return;
  }

  setPptSlideIndex(slideIndex);
  emitState();

  res.json({
    ok: true,
    state
  });
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

app.post('/api/control/song/create', async (req, res) => {
  try {
    await createSong(req.body);
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

app.post('/api/control/song/delete', async (req, res) => {
  try {
    await deleteSong(String(req.body.songId || ''));
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

app.use((error, req, res, next) => {
  if (!error) {
    next();
    return;
  }

  const isPayloadTooLarge = error.type === 'entity.too.large' || error.status === 413;

  res.status(isPayloadTooLarge ? 413 : 400).json({
    ok: false,
    message: isPayloadTooLarge
      ? `업로드 파일은 ${MAX_PPT_UPLOAD_MB}MB 이하만 사용할 수 있습니다.`
      : (error.message || '요청 처리 중 오류가 발생했습니다.')
  });
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

  socket.on('control:setEmergencyMessage', ({ message }) => {
    setEmergencyMessage(message);
    emitState();
  });

  socket.on('control:setViewMode', ({ mode }) => {
    setViewMode(mode);
    emitState();
  });

  socket.on('control:nextPptSlide', () => {
    movePptSlide(1);
    emitState();
  });

  socket.on('control:prevPptSlide', () => {
    movePptSlide(-1);
    emitState();
  });

  socket.on('control:setPptSlide', ({ slideIndex }) => {
    const parsedSlideIndex = Number(slideIndex);

    if (!Number.isInteger(parsedSlideIndex)) {
      socket.emit('errorMessage', {
        message: 'slideIndex는 정수여야 합니다.'
      });
      return;
    }

    setPptSlideIndex(parsedSlideIndex);
    emitState();
  });

  socket.on('control:selectPpt', ({ pptId }) => {
    try {
      setPptById(String(pptId || ''));
      emitState();
    } catch (error) {
      socket.emit('errorMessage', {
        message: error.message
      });
    }
  });

  socket.on('control:deletePpt', async ({ pptId }, callback) => {
    try {
      await deletePpt(String(pptId || ''));
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

  socket.on('control:setSingerControl', ({ enabled }) => {
    setSingerControlEnabled(enabled);
    emitState();
  });

  socket.on('control:setSingerMessage', ({ message }) => {
    setSingerMessage(message);
    emitState();
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

  socket.on('control:createSong', async (payload, callback) => {
    try {
      await createSong(payload);
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

  socket.on('control:deleteSong', async ({ songId }, callback) => {
    try {
      await deleteSong(String(songId || ''));
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

  socket.on('control:addProgramItem', async (payload, callback) => {
    try {
      await addProgramItem(payload || {});
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

  socket.on('control:applyProgramItem', ({ programItemId }) => {
    try {
      applyProgramItem(String(programItemId || ''));
      emitState();
    } catch (error) {
      socket.emit('errorMessage', {
        message: error.message
      });
    }
  });

  socket.on('control:moveProgramItem', async ({ programItemId, direction }, callback) => {
    try {
      await moveProgramItem(String(programItemId || ''), Number(direction));
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

  socket.on('control:deleteProgramItem', async ({ programItemId }, callback) => {
    try {
      await deleteProgramItem(String(programItemId || ''));
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
await loadPpts();
await loadProgram();

server.listen(PORT, () => {
  console.log(`[lyrics-service] running on http://localhost:${PORT}`);
});
