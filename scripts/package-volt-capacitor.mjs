#!/usr/bin/env node

import { createWriteStream } from 'node:fs';
import { mkdir, rm, stat, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';
import archiver from 'archiver';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');

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
  let hasIos = false;
  let hasAndroid = false;
  
  try {
    const iosStats = await stat(path.join(projectRoot, 'ios'));
    hasIos = iosStats.isDirectory();
  } catch {
    // iOS not found
  }
  
  try {
    const androidStats = await stat(path.join(projectRoot, 'android'));
    hasAndroid = androidStats.isDirectory();
  } catch {
    // Android not found
  }
  
  if (!hasIos && !hasAndroid) {
    console.log('No Capacitor platforms found, running build:capacitor first');
    await run('npm', ['run', 'build:capacitor']);
  }
}

/**
 * Automatically increment bundle version for both iOS and Android
 * This prevents "bundle version must be higher" errors from App Store Connect
 * Returns the new version number for use in folder naming
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
    console.warn('iOS project not found or could not read version:', error.message);
  }
  
  // Read Android version
  const buildGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
  try {
    const buildGradle = await readFile(buildGradlePath, 'utf8');
    // Look for versionCode in defaultConfig block
    const versionCodeMatch = buildGradle.match(/versionCode\s+(\d+)/);
    if (versionCodeMatch) {
      androidVersion = parseInt(versionCodeMatch[1], 10);
    }
  } catch (error) {
    console.warn('Android project not found or could not read version:', error.message);
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
  
  // Update iOS version
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
      console.error('Failed to update iOS version:', error);
    }
  }
  
  // Update Android version
  if (androidVersion !== null) {
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
      console.error('Failed to update Android version:', error);
    }
  }
  
  if (iosVersion === null && androidVersion === null) {
    console.warn('Could not find version numbers in either platform');
    return Date.now(); // Fallback
  }
  
  return newVersion;
}

async function createArchive(versionNumber) {
  // Create versioned folder in dist/
  const versionedDir = path.join(distDir, versionNumber.toString());
  await mkdir(versionedDir, { recursive: true });
  
  const outputZip = path.join(versionedDir, 'capacitor-project.zip');
  await rm(outputZip, { force: true });

  const output = createWriteStream(outputZip);
  const archive = archiver('zip', { zlib: { level: 9 } });

  return new Promise(async (resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    // Include ios folder if it exists
    const iosPath = path.join(projectRoot, 'ios');
    try {
      const iosStat = await stat(iosPath);
      if (iosStat.isDirectory()) {
        archive.directory(iosPath, 'ios', {
          dot: true,
          ignore: ['node_modules/**', 'build/**', '.DS_Store'],
        });
        console.log('Included ios/ directory');
      }
    } catch {
      console.warn('ios/ directory not found, skipping');
    }

    // Include android folder if it exists
    const androidPath = path.join(projectRoot, 'android');
    try {
      const androidStat = await stat(androidPath);
      if (androidStat.isDirectory()) {
        archive.directory(androidPath, 'android', {
          dot: true,
          ignore: ['node_modules/**', 'build/**', '.gradle/**', '.idea/**'],
        });
        console.log('Included android/ directory');
      }
    } catch {
      console.warn('android/ directory not found, skipping');
    }

    // Include capacitor.config.json at root (VoltBuilder expects .json, not .ts)
    // Capacitor sync creates this in ios/App/App/ or android/app/, copy from whichever exists
    let capacitorConfigJsonPath = path.join(projectRoot, 'ios', 'App', 'App', 'capacitor.config.json');
    try {
      await stat(capacitorConfigJsonPath);
    } catch {
      // Try Android location
      capacitorConfigJsonPath = path.join(projectRoot, 'android', 'app', 'capacitor.config.json');
    }
    
    try {
      const configStat = await stat(capacitorConfigJsonPath);
      if (configStat.isFile()) {
        archive.file(capacitorConfigJsonPath, { name: 'capacitor.config.json' });
        console.log('Included capacitor.config.json');
      }
    } catch {
      console.warn('capacitor.config.json not found in native projects');
    }

    // Include package.json from root (VoltBuilder needs this for dependencies)
    archive.file(path.join(projectRoot, 'package.json'), { name: 'package.json' });
    
    // Include essential source files for npm install to work
    // VoltBuilder may need these for dependency resolution
    const essentialFiles = [
      'app',
      'lib',
      'public',
      'scripts', // Required for build scripts (generate-version.mjs)
      'next.config.ts',
      'tsconfig.json',
      'postcss.config.mjs',
      'tailwind.config.ts', // if exists
      '.gitignore'
    ];
    
    for (const file of essentialFiles) {
      const filePath = path.join(projectRoot, file);
      try {
        const fileStat = await stat(filePath);
        if (fileStat.isDirectory()) {
          archive.directory(filePath, file, {
            dot: true,
            ignore: ['node_modules/**', '.next/**', 'out/**', 'build/**', '.DS_Store'],
          });
          console.log(`Included ${file}/ directory`);
        } else if (fileStat.isFile()) {
          archive.file(filePath, { name: file });
          console.log(`Included ${file}`);
        }
      } catch (error) {
        console.warn(`⚠ Warning: ${file} not found - ${error.message}`);
      }
    }

    // Include voltbuilder.json at root (required by VoltBuilder)
    const voltbuilderPath = path.join(projectRoot, 'voltbuilder.json');
    try {
      const voltbuilderStat = await stat(voltbuilderPath);
      if (voltbuilderStat.isFile()) {
        archive.file(voltbuilderPath, { name: 'voltbuilder.json' });
        console.log('Included voltbuilder.json');
      } else {
        console.warn('⚠ Warning: voltbuilder.json not found - VoltBuilder requires this file');
      }
    } catch {
      console.warn('⚠ Warning: voltbuilder.json not found - VoltBuilder requires this file');
    }

    // Include certificates directory if it exists (VoltBuilder expects certificates at root)
    const certsPath = path.join(projectRoot, 'certificates');
    try {
      const certsStat = await stat(certsPath);
      if (certsStat.isDirectory()) {
        archive.directory(certsPath, 'certificates');
        console.log('Included certificates directory');
      }
    } catch {
      console.warn('⚠ Warning: certificates directory not found - ensure certificates are uploaded through VoltBuilder UI or included in zip');
    }

    archive.finalize();
  });
}

async function main() {
  await ensureBuild();
  
  // Always increment bundle version before packaging (per VoltBuilder docs)
  const versionNumber = await incrementBundleVersion();
  
  if (!versionNumber) {
    throw new Error('Failed to determine bundle version number');
  }
  
  const versionedDir = path.join(distDir, versionNumber.toString());
  const outputZip = path.join(versionedDir, 'capacitor-project.zip');
  
  console.log(`Creating VoltBuilder package for Capacitor (version ${versionNumber})`);
  await createArchive(versionNumber);
  console.log(`Package created successfully: ${outputZip}`);
  console.log(`Build saved in versioned folder: dist/${versionNumber}/`);
  console.log('Upload this zip to VoltBuilder dashboard');
  console.log('Note: Certificates are uploaded separately through VoltBuilder UI');
  console.log('Reference: https://volt.build/docs/apple_appstore/');
}

main().catch((error) => {
  console.error('Failed to package Capacitor project for VoltBuilder:', error);
  process.exit(1);
});

