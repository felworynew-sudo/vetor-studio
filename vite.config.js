import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function runNodeScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });

    child.on('error', reject);
    child.on('close', (code) => {
      const log = `${stdout}\n${stderr}`.trim();

      if (code === 0) {
        resolve(log);
        return;
      }

      const error = new Error(`Команда завершилась с кодом ${code}.`);
      error.log = log;
      reject(error);
    });
  });
}

// Токен GitHub для публикации ищется по порядку: переменная окружения,
// затем файл github-token.txt рядом с проектом или на уровень выше (корень флешки).
function readGithubToken() {
  if (process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim()) {
    return process.env.GITHUB_TOKEN.trim();
  }
  const relCandidates = [
    '../github-token.txt',
    './github-token.txt',
    '../.github-token',
    './.github-token',
  ];
  for (const rel of relCandidates) {
    const p = path.join(process.cwd(), rel);
    try {
      if (existsSync(p)) {
        const value = readFileSync(p, 'utf8').trim();
        if (value) return value;
      }
    } catch {
      // ignore and try the next candidate
    }
  }
  return '';
}

// isomorphic-git не применяет нормализацию окончаний строк (core.autocrlf / text=auto),
// поэтому на Windows он считает изменёнными все CRLF-файлы. Пропускаем те, где отличие
// от HEAD только в CRLF↔LF — это повторяет поведение системного `git add -A` с text=auto.
async function isOnlyEolDiff(git, dir, filepath, headOid) {
  try {
    const { blob } = await git.readBlob({ fs, dir, oid: headOid, filepath });
    const work = fs.readFileSync(path.join(dir, filepath));
    if (blob.includes(0) || work.includes(0)) return false; // бинарник — не трогаем EOL
    const norm = (b) => Buffer.from(b).toString('latin1').replace(/\r\n/g, '\n');
    return norm(blob) === norm(work);
  } catch {
    return false;
  }
}

// Публикация без системного git: add/commit/push через isomorphic-git (чистый JS).
async function publishWithIsomorphicGit() {
  const git = (await import('isomorphic-git')).default;
  const http = (await import('isomorphic-git/http/node')).default;
  const dir = process.cwd();
  const logLines = [];

  const headOid = await git.resolveRef({ fs, dir, ref: 'HEAD' }).catch(() => null);

  // Ставим в индекс изменённое (statusMatrix уважает .gitignore).
  const matrix = await git.statusMatrix({ fs, dir });
  let changed = 0;
  for (const [filepath, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) continue; // без изменений
    if (workdir === 0) {
      await git.remove({ fs, dir, filepath });
      changed += 1;
      continue;
    }
    // Файл существовал и «изменился» — но, возможно, это только CRLF↔LF шум.
    if (head === 1 && headOid && (await isOnlyEolDiff(git, dir, filepath, headOid))) {
      continue;
    }
    await git.add({ fs, dir, filepath });
    changed += 1;
  }

  const date = new Date().toISOString().slice(0, 10);
  if (changed > 0) {
    const name = (await git.getConfig({ fs, dir, path: 'user.name' })) || 'Vetor Studio';
    const email = (await git.getConfig({ fs, dir, path: 'user.email' })) || 'felworynew@gmail.com';
    const sha = await git.commit({
      fs, dir,
      message: `Update site content ${date}`,
      author: { name, email },
    });
    logLines.push(`Коммит ${sha.slice(0, 7)}: Update site content ${date}`);
  } else {
    logLines.push('Нет изменений для коммита.');
  }

  const token = readGithubToken();
  if (!token) {
    const err = new Error('Не найден токен GitHub.');
    err.log = 'Создай файл github-token.txt в корне флешки с токеном доступа (см. README-portable.txt).';
    throw err;
  }

  let url = await git.getConfig({ fs, dir, path: 'remote.origin.url' });
  if (!url) {
    const err = new Error('Не настроен remote origin.');
    err.log = 'В репозитории нет remote.origin.url.';
    throw err;
  }
  url = url.replace(/^https:\/\/[^@/]+@/, 'https://'); // убираем встроенный логин

  const pushResult = await git.push({
    fs, http, dir,
    url,
    ref: 'master',
    remoteRef: 'master',
    onAuth: () => ({ username: token }),
  });

  if (pushResult && pushResult.ok === false) {
    const err = new Error('git push отклонён сервером.');
    err.log = JSON.stringify(pushResult.errors || pushResult, null, 2);
    throw err;
  }
  logLines.push('Запушено в origin/master.');

  return logLines.join('\n');
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk.toString('utf8');
    });

    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function stripStudioFields(value) {
  if (Array.isArray(value)) {
    return value.map(stripStudioFields);
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.startsWith('_'))
      .map(([key, item]) => [key, stripStudioFields(item)]),
  );
}

function writeJsonFile(relativePath, data) {
  writeFileSync(
    path.join(process.cwd(), relativePath),
    `${JSON.stringify(stripStudioFields(data), null, 2)}\n`,
    'utf8',
  );
}

function writeDefaultExportFile(relativePath, exportName, data) {
  writeFileSync(
    path.join(process.cwd(), relativePath),
    `const ${exportName} = ${JSON.stringify(stripStudioFields(data), null, 2)};\n\nexport default ${exportName};\n`,
    'utf8',
  );
}

const baseDefaultPalette = {
  bg: '#0d0d11',
  bgSoft: '#12131a',
  bgEnd: '#0f1015',
  surface: '#15171f',
  surfaceStrong: '#1c1f2a',
  surfaceSoft: '#14161e',
  text: '#f5f7fb',
  textMuted: '#a8afbc',
  textSoft: '#7c8494',
  accent: '#ff5c63',
  orbRight: '#6166ff',
};

const ghostPalette = {
  bg: '#210732',
  bgSoft: '#2b0c45',
  bgEnd: '#12031f',
  surface: '#210732',
  surfaceStrong: '#2a0b43',
  surfaceSoft: '#29103f',
  text: '#f6f0ff',
  textMuted: '#c7b5d8',
  textSoft: '#9d85b4',
  accent: '#9ae923',
  orbRight: '#6516dc',
};

const electricBluePalette = {
  bg: '#0c0034',
  bgSoft: '#11074a',
  bgEnd: '#07001f',
  surface: '#10105a',
  surfaceStrong: '#151176',
  surfaceSoft: '#0f0a4a',
  text: '#f8f7ff',
  textMuted: '#c8c1e8',
  textSoft: '#968dc0',
  accent: '#f1ff1a',
  orbRight: '#0058c0',
};

const paletteFields = [
  { key: 'bg', ru: 'Фон', en: 'Background' },
  { key: 'bgEnd', ru: 'Низ фона', en: 'Background end' },
  { key: 'surface', ru: 'Карточки', en: 'Cards' },
  { key: 'surfaceStrong', ru: 'Модалки', en: 'Modals' },
  { key: 'surfaceSoft', ru: 'Мягкие панели', en: 'Soft panels' },
  { key: 'text', ru: 'Основной текст', en: 'Primary text' },
  { key: 'textMuted', ru: 'Вторичный текст', en: 'Muted text' },
  { key: 'textSoft', ru: 'Тихий текст', en: 'Soft text' },
  { key: 'accent', ru: 'Акцент', en: 'Accent' },
  { key: 'orbRight', ru: 'Второе свечение', en: 'Second glow' },
];

function writePaletteFile(activePalette) {
  const moduleText = [
    `export const defaultPalette = ${JSON.stringify(baseDefaultPalette, null, 2)};`,
    '',
    `export const ghostPalette = ${JSON.stringify(ghostPalette, null, 2)};`,
    '',
    `export const electricBluePalette = ${JSON.stringify(electricBluePalette, null, 2)};`,
    '',
    `export const activePalette = ${JSON.stringify(stripStudioFields(activePalette), null, 2)};`,
    '',
    `export const paletteFields = ${JSON.stringify(paletteFields, null, 2)};`,
    '',
    "export const paletteStorageKey = 'portfolio-color-palette';",
    '',
  ].join('\n');

  writeFileSync(path.join(process.cwd(), 'src/data/palette.js'), moduleText, 'utf8');
}

async function persistEditableData(request) {
  const rawBody = await readRequestBody(request);

  if (!rawBody.trim()) {
    return;
  }

  const payload = JSON.parse(rawBody);

  if (payload.siteConfig) writeJsonFile('src/data/siteConfig.json', payload.siteConfig);
  if (payload.tagsConfig) writeJsonFile('src/data/tags.json', payload.tagsConfig);
  if (payload.videoItems) writeJsonFile('src/data/videos.json', payload.videoItems);
  if (payload.musicItems) writeJsonFile('src/data/music.json', payload.musicItems);
  if (payload.blogPosts) {
    writeJsonFile('src/data/blog.json', payload.blogPosts);
    writeJsonFile('public/data/blog.json', payload.blogPosts);
  }
  if (payload.galleryItems) writeJsonFile('src/data/gallery.json', payload.galleryItems);
  if (payload.pricing) writeJsonFile('src/data/pricing.json', payload.pricing);
  if (payload.sectionCopy) writeDefaultExportFile('src/data/sectionCopy.js', 'sectionCopy', payload.sectionCopy);
  if (payload.palette) writePaletteFile(payload.palette);
}

function localPublishPlugin() {
  return {
    name: 'local-publish',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__publish-cloudflare', async (request, response, next) => {
        if (request.method !== 'POST') {
          next();
          return;
        }

        response.setHeader('Content-Type', 'application/json; charset=utf-8');

        try {
          await persistEditableData(request);

          const publishLog = await publishWithIsomorphicGit();

          response.statusCode = 200;
          response.end(JSON.stringify({
            ok: true,
            url: 'https://vetor-studio.ru/',
            log: publishLog
              + '\n\n✓ Сайт обновится через ~2 минуты (GitHub Actions).',
          }));
        } catch (error) {
          response.statusCode = 500;
          response.end(JSON.stringify({
            ok: false,
            message: 'Публикация не выполнилась. Проверь подключение к GitHub и попробуй ещё раз.',
            log: error.log || error.message,
          }));
        }
      });
    },
  };
}

export default defineConfig(({ command }) => ({
  plugins: [react(), localPublishPlugin()],
  base: process.env.VITE_BASE_PATH
    || (command === 'build' ? 'https://vetor-studio.ru/' : '/'),
  server: {
    host: true,
    port: 5173,
    allowedHosts: ['.trycloudflare.com'],
  },
}));
