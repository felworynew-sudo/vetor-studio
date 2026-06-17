import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'src', 'data');
const publicDataRoot = path.join(projectRoot, 'public', 'data');

const dataFiles = ['blog.json'];

async function copyDataFile(name) {
  const sourcePath = path.join(sourceRoot, name);
  const targetPath = path.join(publicDataRoot, name);
  const raw = await fs.readFile(sourcePath, 'utf8');
  const normalized = raw.replace(/^\uFEFF/, '');

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, normalized, 'utf8');
  console.log(`synced ${name} -> public/data/${name}`);
}

async function main() {
  for (const file of dataFiles) {
    await copyDataFile(file);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

