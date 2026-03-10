#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import archiver from 'archiver';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const outputZip = path.join(distDir, 'cordova-project.zip');

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function ensureBuild() {
  try {
    const stats = await stat(path.join(projectRoot, 'cordova', 'www'));
    if (stats.isDirectory()) {
      return;
    }
  } catch {
    console.log('Cordova assets not found, running build:cordova first');
    await run('npm', ['run', 'build:cordova']);
  }
}

async function createArchive() {
  await mkdir(distDir, { recursive: true });
  await rm(outputZip, { force: true });

  const output = createWriteStream(outputZip);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    archive.glob('**/*', {
      cwd: path.join(projectRoot, 'cordova'),
      dot: true,
      ignore: ['node_modules/**', 'plugins/**', 'platforms/**', 'build/**'],
    });

    archive.finalize();
  });
}

async function main() {
  await ensureBuild();
  console.log('Creating VoltBuilder package', outputZip);
  await createArchive();
  console.log('Package created successfully:', outputZip);
}

main().catch((error) => {
  console.error('Failed to package Cordova project for VoltBuilder:', error);
  process.exit(1);
});

