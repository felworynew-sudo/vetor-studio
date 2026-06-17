import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright-core';

const defaultViewports = [
  { name: '320', width: 320, height: 760 },
  { name: '390', width: 390, height: 844 },
  { name: '533', width: 533, height: 749 },
  { name: '617', width: 617, height: 749 },
  { name: '789', width: 789, height: 749 },
  { name: '1440', width: 1440, height: 960 },
];

const scenarioMap = {
  home: {
    label: 'Главная',
    run: async (page, url) => {
      await openPage(page, url);
    },
  },
  detail: {
    label: 'Карточка работы',
    run: async (page, url) => {
      await openPage(page, url);
      await page.locator('.card-hitbox').first().click();
      await page.locator('.detail-modal').waitFor({ state: 'visible', timeout: 7000 });
      await waitForVisibleImages(page);
    },
  },
  price: {
    label: 'Прайс',
    run: async (page, url) => {
      await openPage(page, url);
      await page.locator('.promo-banner').scrollIntoViewIfNeeded();
      await page.locator('.promo-banner .cta-button').click();
      await page.locator('.price-modal').waitFor({ state: 'visible', timeout: 7000 });
      await waitForVisibleImages(page);
    },
  },
  blog: {
    label: 'Блог',
    run: async (page, url) => {
      await openPage(page, routeUrl(url, '/blog'));
      await page.locator('.blog-card-hitbox').first().waitFor({ state: 'visible', timeout: 7000 });
      await waitForVisibleImages(page);
    },
  },
  blogReader: {
    label: 'Чтение блога',
    run: async (page, url) => {
      await openPage(page, routeUrl(url, '/blog/clickability-and-attention'));
      await page.locator('.blog-reader-modal').waitFor({ state: 'visible', timeout: 7000 });
      await waitForVisibleImages(page);
    },
  },
  gallery: {
    label: 'Галерея',
    run: async (page, url) => {
      await openPage(page, url);
      await openTab(page, /Дизайн|Design|Галерея|Gallery/i);
    },
  },
  galleryViewer: {
    label: 'Просмотр галереи',
    run: async (page, url) => {
      await openPage(page, url);
      await openTab(page, /Дизайн|Design|Галерея|Gallery/i);
      await page.locator('.gallery-tile-hitbox').first().click();
      await page.locator('.gallery-modal').waitFor({ state: 'visible', timeout: 7000 });
      await waitForVisibleImages(page);
    },
  },
};

const defaultScenarios = ['home', 'detail', 'price', 'blog', 'blogReader', 'gallery', 'galleryViewer'];

function parseArgs() {
  const args = new Map();

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split(/=(.*)/s);
      args.set(key, value);
    } else if (arg.startsWith('--')) {
      args.set(arg.slice(2), true);
    }
  }

  return args;
}

function parseViewports(value) {
  if (!value) {
    return defaultViewports;
  }

  return String(value)
    .split(',')
    .map((rawWidth) => Number.parseInt(rawWidth.trim(), 10))
    .filter(Boolean)
    .map((width) => ({
      name: String(width),
      width,
      height: width >= 1000 ? 960 : 749,
    }));
}

function parseScenarios(value) {
  if (!value) {
    return defaultScenarios;
  }

  return String(value)
    .split(',')
    .map((scenario) => scenario.trim())
    .filter((scenario) => scenarioMap[scenario]);
}

function routeUrl(baseUrl, pathname) {
  return new URL(pathname.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString();
}

function getBrowserPath() {
  const explicitPath = process.env.SCREENSHOT_BROWSER;

  if (explicitPath && existsSync(explicitPath)) {
    return explicitPath;
  }

  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function waitForServer(url, timeoutMs = 20000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    function check() {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on('error', () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`Не удалось дождаться dev-сервера: ${url}`));
          return;
        }

        setTimeout(check, 300);
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });
    }

    check();
  });
}

async function openPage(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await waitForVisibleImages(page);
}

async function openTab(page, name) {
  await page.getByRole('button', { name }).click();
  await page.waitForTimeout(400);
  await waitForVisibleImages(page);
}

async function waitForVisibleImages(page) {
  await page.waitForFunction(() => {
    const visibleImages = Array.from(document.images).filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.top <= window.innerHeight;
    });

    return visibleImages.every((image) => image.complete);
  }, null, { timeout: 7000 }).catch(() => {});
}

async function createReport(outputDir, captures) {
  const cards = captures
    .map((capture) => `
      <article>
        <h2>${capture.scenarioLabel} · ${capture.width}px</h2>
        <img src="./${capture.fileName}" alt="${capture.scenarioLabel} ${capture.width}px">
      </article>
    `)
    .join('\n');

  const html = `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Visual QA Screenshots</title>
    <style>
      body {
        margin: 0;
        padding: 32px;
        background: #0b0816;
        color: #f6f2ff;
        font-family: Arial, sans-serif;
      }

      main {
        display: grid;
        gap: 28px;
      }

      article {
        display: grid;
        gap: 12px;
      }

      h1,
      h2 {
        margin: 0;
      }

      h1 {
        font-size: 28px;
      }

      h2 {
        color: #c9bee8;
        font-size: 16px;
      }

      img {
        max-width: 100%;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 14px;
        background: #111;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Visual QA Screenshots</h1>
      ${cards}
    </main>
  </body>
</html>`;

  await writeFile(path.join(outputDir, 'index.html'), html, 'utf8');
}

async function main() {
  const args = parseArgs();
  const port = Number.parseInt(args.get('port') || '4179', 10);
  const externalUrl = args.get('url');
  const baseUrl = externalUrl || `http://127.0.0.1:${port}`;
  const viewports = parseViewports(args.get('widths'));
  const scenarioNames = parseScenarios(args.get('scenarios'));
  const fullPage = Boolean(args.get('full-page'));
  const outputRoot = path.resolve(process.cwd(), 'screenshots');
  const outputDir = path.join(outputRoot, 'latest');
  const keepExisting = Boolean(args.get('keep'));

  if (!scenarioNames.length) {
    throw new Error('Не выбрано ни одного сценария для скриншотов.');
  }

  let serverProcess = null;

  if (!externalUrl) {
    const viteBin = path.resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
    serverProcess = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none' },
    });

    serverProcess.stdout.on('data', (data) => process.stdout.write(data));
    serverProcess.stderr.on('data', (data) => process.stderr.write(data));

    await waitForServer(baseUrl);
  }

  const browserPath = getBrowserPath();

  if (!browserPath) {
    throw new Error('Не найден Chrome или Edge. Установи браузер или укажи путь через SCREENSHOT_BROWSER.');
  }

  if (!outputDir.startsWith(outputRoot)) {
    throw new Error('Небезопасный путь для очистки screenshots/latest.');
  }

  if (!keepExisting) {
    await rm(outputDir, { recursive: true, force: true });
  }
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  });

  const captures = [];

  try {
    for (const viewport of viewports) {
      for (const scenarioName of scenarioNames) {
        const scenario = scenarioMap[scenarioName];
        const page = await browser.newPage({
          viewport: { width: viewport.width, height: viewport.height },
          deviceScaleFactor: 1,
        });

        await page.addInitScript(() => {
          window.localStorage.setItem('portfolio-language', 'ru');
        });

        await scenario.run(page, baseUrl);

        const fileName = `${scenarioName}-${viewport.name}.png`;
        await page.screenshot({
          path: path.join(outputDir, fileName),
          fullPage,
        });
        await page.close();

        captures.push({
          fileName,
          scenarioLabel: scenario.label,
          width: viewport.width,
        });
        console.log(`saved screenshots/latest/${fileName}`);
      }
    }

    await createReport(outputDir, captures);
    console.log(`\nГотово: ${captures.length} скриншотов в screenshots/latest`);
    console.log('Открой screenshots/latest/index.html, чтобы быстро посмотреть всё сеткой.');
  } finally {
    await browser.close();
    if (serverProcess) {
      serverProcess.kill();
    }
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
