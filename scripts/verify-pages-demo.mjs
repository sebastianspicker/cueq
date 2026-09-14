#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(repositoryRoot, 'dist/pages-demo');
const expectedRootFiles = ['.nojekyll', 'app.css', 'demo.css', 'demo.js', 'icon.svg', 'index.html'];
const requiredAssetUrls = ['./app.css', './demo.css', './demo.js', './icon.svg'];
const textFileExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt']);
const forbiddenTextPatterns = [
  { pattern: /screenshots?/iu, description: 'screenshot reference' },
  { pattern: /\bguided\s*[- ]?\s*static\b/iu, description: 'guided-static language' },
];
const forbiddenRasterExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.webp']);

function isWithinOutputRoot(path) {
  const relativePath = relative(outputRoot, path);
  return relativePath && !relativePath.startsWith('..') && !relativePath.includes('../');
}

async function collectArtifactFiles(directory = outputRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    const artifactPath = relative(outputRoot, path);
    const status = await lstat(path);
    if (status.isSymbolicLink()) {
      throw new Error(`Pages artifacts must not contain symbolic links: ${artifactPath}`);
    }
    if (status.isDirectory()) {
      files.push(...(await collectArtifactFiles(path)));
    } else if (status.isFile()) {
      files.push({ path, artifactPath });
    }
  }

  return files;
}

function assertRelativeAssetUrl(indexHtml, assetUrl) {
  const attributePattern = new RegExp(
    `(?:href|src)\\s*=\\s*["']${assetUrl.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}["']`,
    'u',
  );
  if (!attributePattern.test(indexHtml)) {
    throw new Error(`index.html must reference ${assetUrl} with a relative URL.`);
  }
}

const rootEntries = await readdir(outputRoot);
for (const fileName of expectedRootFiles) {
  if (!rootEntries.includes(fileName)) {
    throw new Error(`Missing Pages artifact file: ${fileName}`);
  }
}

const artifactFiles = await collectArtifactFiles();
for (const { artifactPath, path } of artifactFiles) {
  const extension = extname(artifactPath).toLowerCase();
  if (forbiddenRasterExtensions.has(extension)) {
    throw new Error(`Pages demo must not contain screenshot files: ${artifactPath}`);
  }
  if (/screenshot/iu.test(artifactPath)) {
    throw new Error(`Pages demo must not contain screenshot files: ${artifactPath}`);
  }
  if (!textFileExtensions.has(extension)) continue;

  const contents = await readFile(path, 'utf8');
  for (const { pattern, description } of forbiddenTextPatterns) {
    if (pattern.test(contents)) {
      throw new Error(`Pages demo must not contain ${description}: ${artifactPath}`);
    }
  }
}

const indexHtml = await readFile(resolve(outputRoot, 'index.html'), 'utf8');
for (const assetUrl of requiredAssetUrls) {
  assertRelativeAssetUrl(indexHtml, assetUrl);
}

for (const marker of [
  { pattern: /data-demo-view(?:\s|=)/u, description: 'interactive demo view controls' },
  { pattern: /data-demo-theme(?:\s|=)/u, description: 'theme controls' },
  { pattern: /data-demo-command(?:\s|=)/u, description: 'command-palette controls' },
  {
    pattern: /(?:data-demo-boundary(?:\s|=)|\bmock[ -]data\b)/iu,
    description: 'mock-data boundary',
  },
]) {
  if (!marker.pattern.test(indexHtml)) {
    throw new Error(`index.html is missing ${marker.description}.`);
  }
}

const demoScript = await readFile(resolve(outputRoot, 'demo.js'), 'utf8');
for (const networkApi of ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon']) {
  if (demoScript.includes(networkApi)) {
    throw new Error(`demo.js must not initiate network requests through ${networkApi}.`);
  }
}
for (const marker of [
  { pattern: /data-demo-view/u, description: 'view switching' },
  { pattern: /approv/iu, description: 'approval state' },
  { pattern: /(?:approve|reject|decision|mutat)/iu, description: 'approval mutation' },
]) {
  if (!marker.pattern.test(demoScript)) {
    throw new Error(`demo.js is missing ${marker.description}.`);
  }
}

const applicationCss = await readFile(resolve(outputRoot, 'app.css'), 'utf8');
for (const unsupportedDirective of [
  '@tailwind',
  '@apply',
  '@plugin',
  '@custom-variant',
  'theme(',
]) {
  if (applicationCss.includes(unsupportedDirective)) {
    throw new Error(`app.css requires compilation because it contains ${unsupportedDirective}`);
  }
}
const importedStylesheets = [...applicationCss.matchAll(/@import\s+['\"]([^'\"]+)['\"]/g)].map(
  ([, relativePath]) => relativePath,
);
if (importedStylesheets.length === 0) {
  throw new Error('app.css must import the cueq visual-system stylesheets.');
}

const importedStylesheetContents = await Promise.all(
  importedStylesheets.map(async (relativePath) => {
    if (!relativePath.startsWith('./') || !relativePath.endsWith('.css')) {
      throw new Error(`Unsupported Pages stylesheet import: ${relativePath}`);
    }

    const stylesheetPath = resolve(outputRoot, relativePath);
    if (!isWithinOutputRoot(stylesheetPath)) {
      throw new Error(`Pages stylesheet import escapes the artifact: ${relativePath}`);
    }
    return readFile(stylesheetPath, 'utf8');
  }),
);
if (!importedStylesheetContents.some((stylesheet) => stylesheet.includes('--cq-accent:'))) {
  throw new Error('app.css does not contain the cueq visual-system tokens.');
}

console.log('GitHub Pages artifact verification passed.');
