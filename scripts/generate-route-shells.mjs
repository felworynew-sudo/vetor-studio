import { copyFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const sitemapPath = path.join(distDir, 'sitemap.xml');
const sourceHtmlPath = path.join(distDir, 'index.html');

function decodeXml(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'");
}

function getSafeRouteDirectory(pathname) {
  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));

  if (segments.length === 0) {
    return null;
  }

  if (segments.some((segment) => !segment || segment === '.' || segment === '..' || segment.includes('\\'))) {
    throw new Error(`Unsafe route in sitemap: ${pathname}`);
  }

  const targetDirectory = path.resolve(distDir, ...segments);
  const relativePath = path.relative(distDir, targetDirectory);

  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Route escapes dist directory: ${pathname}`);
  }

  return targetDirectory;
}

async function main() {
  const sitemapXml = await readFile(sitemapPath, 'utf8');
  const locations = Array.from(sitemapXml.matchAll(/<loc>(.*?)<\/loc>/g), (match) => decodeXml(match[1]));
  let generatedCount = 0;

  for (const location of locations) {
    const routeUrl = new URL(location);
    const targetDirectory = getSafeRouteDirectory(routeUrl.pathname);

    if (!targetDirectory) {
      continue;
    }

    await mkdir(targetDirectory, { recursive: true });
    await copyFile(sourceHtmlPath, path.join(targetDirectory, 'index.html'));
    generatedCount += 1;
  }

  console.log(`Generated ${generatedCount} static route shells from sitemap.xml.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
