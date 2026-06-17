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

  if (html.includes('data-vetor-inline="app-js"')) {
    return false;
  }

  const scriptMatch = html.match(
    /<script\s+type="module"\s+crossorigin\s+src="([^"]*\/assets\/[^"]+\.js)"><\/script>/,
  );
  const stylesheetMatch = html.match(
    /<link\s+rel="stylesheet"\s+crossorigin\s+href="([^"]*\/assets\/[^"]+\.css)">/,
  );

  if (!scriptMatch && !stylesheetMatch) {
    return false;
  }

  if (!scriptMatch || !stylesheetMatch) {
    throw new Error(`Main app assets were not found in ${path.relative(distDir, htmlPath)}`);
  }

  const [scriptSource, stylesheetSource] = await Promise.all([
    fs.readFile(getAssetPath(scriptMatch[1]), 'utf8'),
    fs.readFile(getAssetPath(stylesheetMatch[1]), 'utf8'),
  ]);

  const assetDirectory = scriptMatch[1].slice(0, scriptMatch[1].lastIndexOf('/') + 1);
  const safeScript = scriptSource
    .replaceAll('import("./', `import("${assetDirectory}`)
    .replaceAll('</script', '<\\/script');
  const safeStylesheet = stylesheetSource.replaceAll('</style', '<\\/style');

  html = html
    .replace(
      stylesheetMatch[0],
      () => `<style data-vetor-inline="app-css">${safeStylesheet}</style>`,
    )
    .replace(
      scriptMatch[0],
      () => `<script type="module" data-vetor-inline="app-js">${safeScript}</script>`,
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
