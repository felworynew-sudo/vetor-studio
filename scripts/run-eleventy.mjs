import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { copyFileSync, existsSync } from 'node:fs';

const eleventyCli = path.resolve('node_modules', '@11ty', 'eleventy', 'cmd.cjs');

if (!existsSync(eleventyCli)) {
  process.exit(0);
}

const child = spawn(process.execPath, [eleventyCli, '--config=.eleventy.js'], {
  cwd: process.cwd(),
  stdio: 'inherit',
  windowsHide: true,
});

child.on('error', (error) => {
  console.warn(`[eleventy] skipped: ${error.message}`);
  process.exit(0);
});

child.on('close', (code) => {
  if (code === 0) {
    try {
      const generated404 = path.resolve('dist-eleventy', '404.html');
      const public404 = path.resolve('public', '404.html');
      if (existsSync(generated404)) {
        copyFileSync(generated404, public404);
      }
    } catch (error) {
      console.warn(`[eleventy] 404 copy skipped: ${error.message}`);
    }
    process.exit(0);
    return;
  }

  console.warn(`[eleventy] exited with code ${code}; continuing without partial export.`);
  process.exit(0);
});
