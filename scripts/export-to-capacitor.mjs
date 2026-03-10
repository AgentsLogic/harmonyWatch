#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// Local plugins defined in the native app projects (not in node_modules).
// iOS: These must be added to packageClassList after cap sync regenerates the config.
// Android: Plugins with @CapacitorPlugin annotation should auto-discover, but we verify they exist.
const LOCAL_IOS_PLUGINS = ['HarmonyPlayerPlugin'];
const LOCAL_ANDROID_PLUGINS = ['com.harmonywatch.app.HarmonyPlayerPlugin'];

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

/**
 * Inject local iOS plugin class names into the capacitor.config.json packageClassList.
 * `npx cap sync` only discovers plugins in node_modules, so local plugins
 * defined in ios/App/App/ need to be added manually after each sync.
 */
function injectLocalPlugins() {
  const configPath = path.resolve(projectRoot, 'ios', 'App', 'App', 'capacitor.config.json');
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const classList = config.packageClassList || [];
    let changed = false;
    for (const plugin of LOCAL_IOS_PLUGINS) {
      if (!classList.includes(plugin)) {
        classList.push(plugin);
        changed = true;
        console.log(`  ✅ Added local plugin: ${plugin}`);
      }
    }
    if (changed) {
      config.packageClassList = classList;
      writeFileSync(configPath, JSON.stringify(config, null, '\t'));
      console.log('  Local plugins injected into capacitor.config.json');
    } else {
      console.log('  Local plugins already present in packageClassList');
    }
  } catch (error) {
    console.warn('  ⚠️  Could not inject local plugins:', error.message);
  }
}

function verifyAndroidPlugins() {
  for (const pluginClass of LOCAL_ANDROID_PLUGINS) {
    const parts = pluginClass.split('.');
    const className = parts[parts.length - 1];
    const packagePath = parts.slice(0, -1).join('/');
    const pluginPath = path.resolve(projectRoot, 'android', 'app', 'src', 'main', 'java', packagePath, `${className}.java`);
    
    try {
      const exists = require('fs').existsSync(pluginPath);
      if (exists) {
        console.log(`  ✅ Found Android plugin: ${className}`);
      } else {
        console.warn(`  ⚠️  Android plugin not found: ${pluginPath}`);
      }
    } catch (error) {
      console.warn(`  ⚠️  Could not verify Android plugin ${className}:`, error.message);
    }
  }
}

async function main() {
  console.log('Syncing Capacitor (syncs configuration and plugins)');
  // npx cap sync automatically:
  // 1. Copies capacitor.config.json to native projects
  // 2. Installs any plugins found in package.json
  // 3. Updates native project dependencies
  // Note: For remote URL mode, no web assets need to be copied
  await run('npx', ['cap', 'sync']); // Sync all platforms

  // Inject local iOS plugins into packageClassList
  // (cap sync only discovers node_modules plugins, not local ones)
  console.log('Injecting local iOS plugins...');
  injectLocalPlugins();
  
  // Verify Android local plugins exist (they should auto-discover with @CapacitorPlugin)
  console.log('Verifying Android local plugins...');
  verifyAndroidPlugins();

  console.log('Capacitor sync completed');
  console.log('');
  console.log('⚠️  IMPORTANT: For community plugins to work, ensure pod install is run:');
  console.log('   1. Navigate to ios/App directory');
  console.log('   2. Run: pod install');
  console.log('   3. Or let VoltBuilder handle it during build');
  console.log('');
  console.log('Ready for development');
}

main().catch((error) => {
  console.error('Failed to sync Capacitor:', error);
  process.exit(1);
});

