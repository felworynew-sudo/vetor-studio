import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
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

function runGit(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('error', reject);
    child.on('close', (code) => {
      const log = `${stdout}\n${stderr}`.trim();
      if (code === 0) { resolve(log); return; }
      const error = new Error(`git ${args[0]} завершился с кодом ${code}.`);
      error.log = log;
      reject(error);
    });
  });
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
  if (payload.blogPosts) writeJsonFile('src/data/blog.json', payload.blogPosts);
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

          const date = new Date().toISOString().slice(0, 10);
          await runGit(['add', '-A']);

          let commitLog = '';
          try {
            commitLog = await runGit(['commit', '-m', `Update site content ${date}`]);
          } catch (err) {
            if (!(err.log || '').includes('nothing to commit')) throw err;
            commitLog = 'Нет изменений для коммита.';
          }

          const pushLog = await runGit(['push']);

          response.statusCode = 200;
          response.end(JSON.stringify({
            ok: true,
            url: 'https://vetor-studio.ru/',
            log: [commitLog, pushLog].filter(Boolean).join('\n')
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
