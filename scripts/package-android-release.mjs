#!/usr/bin/env node

import { mkdir, copyFile, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const androidDir = path.join(projectRoot, 'android');

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || projectRoot,
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
 * Check if Capacitor is configured for production mode
 */
async function checkProductionMode() {
  const configPath = path.join(projectRoot, 'capacitor.config.ts');
  try {
    const config = await readFile(configPath, 'utf8');
    // Check if production URL is used (not localhost/dev URL)
    const isProduction = config.includes("'https://www.harmony.watch/'") || 
                         config.includes('"https://www.harmony.watch/"') ||
                         (config.includes('prodUrl') && !config.includes('isDev'));
    
    if (!isProduction) {
      console.warn('⚠ Warning: Capacitor config may not be in production mode');
      console.warn('   Ensure capacitor.config.ts uses production URL: https://www.harmony.watch/');
    }
    return isProduction;
  } catch (error) {
    console.warn('⚠ Warning: Could not read capacitor.config.ts:', error.message);
    return false;
  }
}

/**
 * Automatically increment bundle version for both iOS and Android
 * Reuses logic from package-volt-capacitor.mjs to maintain version sync
 */
async function incrementBundleVersion() {
  let iosVersion = null;
  let androidVersion = null;
  
  // Read iOS version
  const projectPbxprojPath = path.join(projectRoot, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
  try {
    const projectPbxproj = await readFile(projectPbxprojPath, 'utf8');
    const versionMatches = projectPbxproj.match(/CURRENT_PROJECT_VERSION = (\d+);/g);
    if (versionMatches && versionMatches.length > 0) {
      const firstMatch = versionMatches[0].match(/CURRENT_PROJECT_VERSION = (\d+);/);
      if (firstMatch) {
        iosVersion = parseInt(firstMatch[1], 10);
      }
    }
  } catch (error) {
    // iOS not found, that's okay
  }
  
  // Read Android version
  const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
  try {
    const buildGradle = await readFile(buildGradlePath, 'utf8');
    const versionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);
    if (versionCodeMatch) {
      androidVersion = parseInt(versionCodeMatch[1], 10);
    }
  } catch (error) {
    throw new Error(`Failed to read Android version: ${error.message}`);
  }
  
  // Determine base version (use highest, or default to 1)
  let baseVersion = 1;
  if (iosVersion !== null && androidVersion !== null) {
    baseVersion = Math.max(iosVersion, androidVersion);
  } else if (iosVersion !== null) {
    baseVersion = iosVersion;
  } else if (androidVersion !== null) {
    baseVersion = androidVersion;
  }
  
  const newVersion = baseVersion + 1;
  
  // Update iOS version (to maintain sync)
  if (iosVersion !== null) {
    try {
      const projectPbxproj = await readFile(projectPbxprojPath, 'utf8');
      // Update CURRENT_PROJECT_VERSION (bundle version)
      let updatedProject = projectPbxproj.replace(
        /CURRENT_PROJECT_VERSION = \d+;/g,
        `CURRENT_PROJECT_VERSION = ${newVersion};`
      );
      // Update MARKETING_VERSION (version name) to 1.0.{versionCode} format
      const newVersionName = `1.0.${newVersion}`;
      updatedProject = updatedProject.replace(
        /MARKETING_VERSION = [^;]+;/g,
        `MARKETING_VERSION = ${newVersionName};`
      );
      await writeFile(projectPbxprojPath, updatedProject, 'utf8');
      console.log(`Incremented iOS bundle version from ${iosVersion} to ${newVersion}`);
      console.log(`Updated iOS MARKETING_VERSION to ${newVersionName}`);
    } catch (error) {
      console.warn('⚠ Warning: Failed to update iOS version:', error.message);
    }
  }
  
  // Update Android version
  try {
    const buildGradle = await readFile(buildGradlePath, 'utf8');
    // Update versionCode
    let updatedGradle = buildGradle.replace(
      /versionCode\s+\d+/,
      `versionCode ${newVersion}`
    );
    // Update versionName to 1.0.{versionCode} format
    const newVersionName = `1.0.${newVersion}`;
    updatedGradle = updatedGradle.replace(
      /versionName\s+"[^"]+"/,
      `versionName "${newVersionName}"`
    );
    await writeFile(buildGradlePath, updatedGradle, 'utf8');
    console.log(`Incremented Android versionCode from ${androidVersion} to ${newVersion}`);
    console.log(`Updated Android versionName to ${newVersionName}`);
  } catch (error) {
    throw new Error(`Failed to update Android version: ${error.message}`);
  }
  
  // Update iOS MARKETING_VERSION (to maintain sync)
  if (iosVersion !== null) {
    try {
      const projectPbxprojPath = path.join(projectRoot, 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
      const projectPbxproj = await readFile(projectPbxprojPath, 'utf8');
      const newVersionName = `1.0.${newVersion}`;
      const updatedProject = projectPbxproj.replace(
        /MARKETING_VERSION = [^;]+;/g,
        `MARKETING_VERSION = ${newVersionName};`
      );
      await writeFile(projectPbxprojPath, updatedProject, 'utf8');
      console.log(`Updated iOS MARKETING_VERSION to ${newVersionName}`);
    } catch (error) {
      console.warn('⚠ Warning: Failed to update iOS MARKETING_VERSION:', error.message);
    }
  }
  
  return newVersion;
}

/**
 * Build release AAB using Gradle
 */
async function buildReleaseAAB() {
  const gradlewCommand = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const gradlewPath = path.join(androidDir, gradlewCommand);
  
  try {
    await stat(gradlewPath);
  } catch (error) {
    throw new Error(`Gradle wrapper not found at ${gradlewPath}. Make sure Android project is set up correctly.`);
  }
  
  console.log('Building release AAB...');
  await run(gradlewCommand, ['bundleRelease'], { cwd: androidDir });
  console.log('✓ AAB build completed successfully');
}

/**
 * Copy AAB to versioned folder
 */
async function copyAABToVersionedFolder(versionNumber) {
  const aabSourcePath = path.join(androidDir, 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab');
  const androidDistDir = path.join(distDir, 'android', versionNumber.toString());
  await mkdir(androidDistDir, { recursive: true });
  
  const aabDestPath = path.join(androidDistDir, 'app-release.aab');
  
  try {
    await stat(aabSourcePath);
    await copyFile(aabSourcePath, aabDestPath);
    console.log(`✓ AAB copied to: ${aabDestPath}`);
    return aabDestPath;
  } catch (error) {
    throw new Error(`Failed to copy AAB: ${error.message}. Make sure build completed successfully.`);
  }
}

async function main() {
  console.log('🚀 Starting Android release build process...\n');
  
  // Check production mode
  console.log('Checking Capacitor configuration...');
  const isProduction = await checkProductionMode();
  if (!isProduction) {
    console.warn('⚠ Warning: Not in production mode. Continuing anyway...\n');
  } else {
    console.log('✓ Production mode confirmed\n');
  }
  
  // Sync Capacitor
  console.log('Syncing Capacitor configuration...');
  try {
    await run('npm', ['run', 'build:capacitor']);
    console.log('✓ Capacitor sync completed\n');
  } catch (error) {
    throw new Error(`Failed to sync Capacitor: ${error.message}`);
  }
  
  // Check if keystore exists
  const keystorePropertiesPath = path.join(androidDir, 'keystore.properties');
  const keystorePath = path.join(androidDir, 'harmony-release-key.jks');
  const keystorePathAlt = path.join(projectRoot, 'certificates', 'android-release-key.jks');
  
  let hasKeystore = false;
  try {
    await stat(keystorePropertiesPath);
    hasKeystore = true;
    console.log('✓ Found keystore.properties');
  } catch {
    console.warn('⚠ Warning: keystore.properties not found');
    console.warn('   Create android/keystore.properties with signing credentials');
    console.warn('   Or ensure keystore file exists and build.gradle is configured correctly\n');
  }
  
  try {
    await stat(keystorePath);
    hasKeystore = true;
    console.log('✓ Found keystore file at android/harmony-release-key.jks');
  } catch {
    try {
      await stat(keystorePathAlt);
      hasKeystore = true;
      console.log('✓ Found keystore file at certificates/android-release-key.jks');
    } catch {
      if (!hasKeystore) {
        console.warn('⚠ Warning: No keystore file found');
        console.warn('   Create keystore using: keytool -genkey -v -keystore harmony-release-key.jks ...');
        console.warn('   Or update build.gradle to point to your keystore location\n');
      }
    }
  }
  
  // Increment version
  console.log('Incrementing version numbers...');
  const versionNumber = await incrementBundleVersion();
  if (!versionNumber) {
    throw new Error('Failed to determine bundle version number');
  }
  console.log(`✓ Version incremented to ${versionNumber}\n`);
  
  // Build AAB
  await buildReleaseAAB();
  console.log('');
  
  // Copy to versioned folder
  console.log('Copying AAB to versioned folder...');
  const aabPath = await copyAABToVersionedFolder(versionNumber);
  console.log('');
  
  // Success message
  console.log('✅ Android release build completed successfully!\n');
  console.log(`📦 AAB Location: ${aabPath}`);
  console.log(`📁 Version Folder: dist/android/${versionNumber}/\n`);
  console.log('📋 Next Steps:');
  console.log('   1. Go to Google Play Console: https://play.google.com/console');
  console.log('   2. Navigate to: Testing → Internal testing → Create new release');
  console.log('   3. Upload the AAB file from the path above');
  console.log('   4. Add release notes and start rollout to internal testing');
  console.log('\n📚 Reference: https://support.google.com/googleplay/android-developer/answer/9859152');
}

main().catch((error) => {
  console.error('\n❌ Failed to package Android release:', error.message);
  process.exit(1);
});
