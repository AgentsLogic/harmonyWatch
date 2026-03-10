#!/usr/bin/env node

import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import url from 'node:url';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

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
  console.log('🔄 Syncing Capacitor for Android...\n');
  
  try {
    // Step 1: Sync Capacitor (updates Android project with config changes)
    console.log('Step 1: Syncing Capacitor configuration...');
    await run('npm', ['run', 'build:capacitor']);
    console.log('✅ Capacitor sync completed\n');

    // Step 2: Check if there are changes to commit
    console.log('Step 2: Checking for changes...');
    await run('git', ['add', 'android/', 'capacitor.config.ts', 'app/globals.css', 'lib/', 'scripts/']);
    
    // Check if there are staged changes
    const statusCheck = spawn('git', ['diff', '--cached', '--quiet'], {
      cwd: projectRoot,
      stdio: 'pipe',
      shell: process.platform === 'win32',
    });

    let hasChanges = false;
    statusCheck.on('close', async (code) => {
      hasChanges = code !== 0; // Exit code 0 means no changes
      
      if (hasChanges) {
        console.log('📝 Changes detected, committing...\n');
        // Get a commit message from command line args or use default
        // Join all args after the script name to handle spaces in commit message
        const commitMessage = process.argv.slice(2).join(' ') || 'Update Android app configuration';
        
        // Use execFile for git commit to properly handle the message with spaces
        try {
          await execFileAsync('git', ['commit', '-m', commitMessage], { cwd: projectRoot });
          console.log(`✅ Committed changes: "${commitMessage}"\n`);
        } catch (error) {
          throw new Error(`git commit failed: ${error.message}`);
        }
        console.log('💡 Next steps:');
        console.log('   1. Rebuild in Android Studio (Build → Rebuild Project)');
        console.log('   2. Run the app (Run button or Shift+F10)');
        console.log('   3. Push to git when ready: git push');
      } else {
        console.log('ℹ️  No changes to commit\n');
        console.log('💡 Next steps:');
        console.log('   1. Rebuild in Android Studio (Build → Rebuild Project)');
        console.log('   2. Run the app (Run button or Shift+F10)');
      }
    });

    statusCheck.on('error', (error) => {
      console.error('Error checking git status:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
