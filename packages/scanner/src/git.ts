import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

function findGitRoot(startPath: string): string | null {
  let dir = path.resolve(startPath);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) return dir;
    dir = path.dirname(dir);
  }
  return null;
}

export function getGitHash(repoPath: string): string | null {
  const gitRoot = findGitRoot(repoPath);
  if (!gitRoot) return null;
  try {
    const hash = execSync('git rev-parse HEAD', {
      cwd: gitRoot,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return hash || null;
  } catch {
    return null;
  }
}

export function getChangedFiles(repoPath: string, sinceHash: string): string[] {
  try {
    const output = execSync(`git diff --name-only ${sinceHash}..HEAD`, {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return output ? output.split('\n').filter(Boolean) : [];
  } catch {
    return [];
  }
}

export function isGitRepo(repoPath: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}
