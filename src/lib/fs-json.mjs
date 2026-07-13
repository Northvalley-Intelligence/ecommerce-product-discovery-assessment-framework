import fs from 'node:fs';
import path from 'node:path';

export function exists(filePath) {
  return fs.existsSync(filePath);
}

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function ensureParent(filePath) {
  ensureDir(path.dirname(filePath));
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function writeJson(filePath, value) {
  ensureParent(filePath);
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

export function writeText(filePath, value) {
  ensureParent(filePath);
  fs.writeFileSync(`${filePath}.tmp`, value);
  fs.renameSync(`${filePath}.tmp`, filePath);
}

export function appendJsonl(filePath, value) {
  ensureParent(filePath);
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`);
}

export function readJsonl(filePath) {
  if (!exists(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function listFilesRecursive(dirPath) {
  if (!exists(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

export function latestDirectory(dirPath) {
  if (!exists(dirPath)) return null;
  const dirs = fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
  return dirs.at(-1) || null;
}
