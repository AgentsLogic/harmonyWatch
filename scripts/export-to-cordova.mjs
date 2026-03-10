#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cordovaDir = path.join(projectRoot, 'cordova');
const cordovaWww = path.join(cordovaDir, 'www');

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options,
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

async function main() {
  console.log('Building Next.js production bundle');
  await run('npx', ['next', 'build', '--turbopack']);

  console.log('Preparing Cordova www directory');
  await rm(cordovaWww, { recursive: true, force: true });
  await mkdir(cordovaWww, { recursive: true });

  const remoteUrl = process.env.CORDOVA_REMOTE_URL ?? 'https://www.harmony.watch/';

  const bootstrapHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>HarmonyWatch</title>
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        padding: 0;
        background: #0f0f0f;
        color: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
      }
      .container {
        text-align: center;
      }
      .spinner {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        border: 4px solid rgba(255, 255, 255, 0.2);
        border-top-color: #ffffff;
        animation: spin 1s linear infinite;
        margin: 0 auto 16px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
    <script src="cordova.js"></script>
    <script>
      document.addEventListener('DOMContentLoaded', function () {
        var target = "${remoteUrl}";
        if (!target) {
          document.getElementById('status').textContent = 'Missing CORDOVA_REMOTE_URL configuration.';
          return;
        }
        window.location.replace(target);
      });
    </script>
  </head>
  <body>
    <div class="container">
      <div class="spinner"></div>
      <p id="status">Launching HarmonyWatch…</p>
    </div>
  </body>
</html>`;

  await writeFile(path.join(cordovaWww, 'index.html'), bootstrapHtml, 'utf8');

  // Include static assets for splash screens / icons
  const publicDir = path.join(projectRoot, 'public');
  await cp(publicDir, path.join(cordovaWww, 'public'), { recursive: true });

  console.log('Cordova assets updated:', cordovaWww);
}

main().catch((error) => {
  console.error('Failed to export assets for Cordova:', error);
  process.exit(1);
});

