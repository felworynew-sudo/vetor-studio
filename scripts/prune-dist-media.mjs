import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.join(projectRoot, 'dist');
const targetFolders = ['thumbs', 'music', 'gallery'];
const keepFileNames = new Set([
  'placeholder-video.svg',
  'placeholder-cover.svg',
  'gallery-placeholder.svg',
]);

function isSafeTarget(targetPath) {
  const relative = path.relative(distDir, targetPath);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function shouldKeepFile(fileName) {
  if (keepFileNames.has(fileName)) {
    return true;
  }

  return path.extname(fileName).toLowerCase() === '.svg';
}

async function pruneFolder(folderName) {
  const folderPath = path.join(distDir, folderName);
  let removedFiles = 0;
  let removedBytes = 0;

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const targetPath = path.join(folderPath, entry.name);

      if (!isSafeTarget(targetPath)) {
        continue;
      }

      if (entry.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
        continue;
      }

      if (shouldKeepFile(entry.name)) {
        continue;
      }

      const stats = await fs.stat(targetPath);
      await fs.rm(targetPath, { force: true });
      removedFiles += 1;
      removedBytes += stats.size;
    }
  } catch {
    return { folderName, removedFiles, removedBytes };
  }

  return { folderName, removedFiles, removedBytes };
}

async function main() {
  const folderStats = await Promise.all(targetFolders.map(pruneFolder));
  const removedFiles = folderStats.reduce((total, folder) => total + folder.removedFiles, 0);
  const removedBytes = folderStats.reduce((total, folder) => total + folder.removedBytes, 0);

  const removedMb = (removedBytes / (1024 * 1024)).toFixed(2);
  console.log(`Pruned ${removedFiles} source media files from dist (${removedMb} MB removed).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
