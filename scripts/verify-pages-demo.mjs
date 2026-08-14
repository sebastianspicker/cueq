#!/usr/bin/env node

import { lstat, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(repositoryRoot, 'dist/pages-demo');
const expectedRootFiles = ['.nojekyll', 'app.css', 'demo.css', 'demo.js', 'icon.svg', 'index.html'];
const expectedScreenshots = [
  '01-dashboard.png',
  '02-leave.png',
  '03-roster.png',
  '04-approvals.png',
  '05-closing.png',
  '06-reports.png',
];

const rootEntries = await readdir(outputRoot);
for (const fileName of expectedRootFiles) {
  if (!rootEntries.includes(fileName)) {
    throw new Error(`Missing Pages artifact file: ${fileName}`);
  }
}

const screenshotRoot = resolve(outputRoot, 'assets/screenshots/alpha');
const screenshotEntries = (await readdir(screenshotRoot))
  .filter((fileName) => extname(fileName) === '.png')
  .sort();
if (JSON.stringify(screenshotEntries) !== JSON.stringify(expectedScreenshots)) {
  throw new Error(`Unexpected Pages screenshot manifest: ${screenshotEntries.join(', ')}`);
}

for (const relativePath of [
  ...expectedRootFiles,
  ...expectedScreenshots.map((fileName) => `assets/screenshots/alpha/${fileName}`),
]) {
  if ((await lstat(resolve(outputRoot, relativePath))).isSymbolicLink()) {
    throw new Error(`Pages artifacts must not contain symbolic links: ${relativePath}`);
  }
}

const indexHtml = await readFile(resolve(outputRoot, 'index.html'), 'utf8');
const requiredReferences = ['./app.css', './demo.css', './demo.js', './icon.svg'];
for (const reference of requiredReferences) {
  if (!indexHtml.includes(reference)) {
    throw new Error(`index.html does not reference ${reference}`);
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
    if ((await lstat(stylesheetPath)).isSymbolicLink()) {
      throw new Error(`Pages artifacts must not contain symbolic links: ${relativePath}`);
    }
    return readFile(stylesheetPath, 'utf8');
  }),
);
if (!importedStylesheetContents.some((stylesheet) => stylesheet.includes('--cq-accent:'))) {
  throw new Error('app.css does not contain the cueq visual-system tokens.');
}

console.log('GitHub Pages artifact verification passed.');
