import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

function getGitInfo() {
  try {
    const commitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    const commitMessage = execSync('git log -1 --pretty=%B', { encoding: 'utf-8' }).trim();
    const commitDate = execSync('git log -1 --pretty=%ci', { encoding: 'utf-8' }).trim();
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8' }).trim();
    
    return {
      commitHash,
      commitMessage: commitMessage.split('\n')[0], // First line only
      commitDate,
      branch,
      buildDate: new Date().toISOString(),
    };
  } catch (error) {
    console.warn('Could not get git info:', error.message);
    return {
      commitHash: 'unknown',
      commitMessage: 'unknown',
      commitDate: 'unknown',
      branch: 'unknown',
      buildDate: new Date().toISOString(),
    };
  }
}

const versionInfo = getGitInfo();
// Write to both lib/ (for direct import) and public/ (for fetch fallback)
const libPath = join(process.cwd(), 'lib', 'version.json');
const publicPath = join(process.cwd(), 'public', 'version.json');

writeFileSync(libPath, JSON.stringify(versionInfo, null, 2), 'utf-8');
writeFileSync(publicPath, JSON.stringify(versionInfo, null, 2), 'utf-8');
console.log('✅ Version info generated:', versionInfo);

