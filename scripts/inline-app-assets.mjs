import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');

async function collectHtmlFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectHtmlFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(entryPath);
    }
  }

  return files;
}

function getAssetPath(assetUrl) {
  const pathname = new URL(assetUrl, 'https://vetor-studio.ru').pathname;
  const relativePath = pathname.replace(/^\/+/, '');
  const targetPath = path.resolve(distDir, relativePath);
  const relativeTarget = path.relative(distDir, targetPath);

  if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error(`Asset path escapes dist: ${assetUrl}`);
  }

  return targetPath;
}

async function inlineHtmlFile(htmlPath) {
  let html = await fs.readFile(htmlPath, 'utf8');

  if (html.includes('data-vetor-inline="app-css"')) {
    return false;
  }

  // Inline the critical CSS only. The entry JS stays an external
  // <script type="module" src>. Inlining the entry bundle breaks module
  // identity for code-split dynamic imports: the entry runs once inlined, then
  // AGAIN when a lazy chunk (e.g. the studio's ContentStudio) imports it from
  // /assets/index-*.js for shared modules — loading a SECOND copy of React and
  // crashing hooks with "invalid hook call" (React #321) in studio mode.
  // Keeping the JS external is also better for caching (one shared bundle
  // instead of 380 KB duplicated into every route shell).
  const stylesheetMatch = html.match(
    /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]*\/assets\/[^"]+\.css)">/,
  );

  if (!stylesheetMatch) {
    return false;
  }

  const stylesheetSource = await fs.readFile(getAssetPath(stylesheetMatch[1]), 'utf8');
  const safeStylesheet = stylesheetSource.replaceAll('</style', '<\\/style');

  html = html.replace(
    stylesheetMatch[0],
    () => `<style data-vetor-inline="app-css">${safeStylesheet}</style>`,
  );

  await fs.writeFile(htmlPath, html, 'utf8');
  return true;
}

async function main() {
  const htmlFiles = await collectHtmlFiles(distDir);
  let inlinedCount = 0;

  for (const htmlPath of htmlFiles) {
    if (await inlineHtmlFile(htmlPath)) {
      inlinedCount += 1;
    }
  }

  console.log(`Inlined critical app CSS and JS into ${inlinedCount} HTML files.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
