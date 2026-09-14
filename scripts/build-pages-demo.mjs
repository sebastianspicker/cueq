#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = resolve(repositoryRoot, 'docs/demo');
const outputRoot = resolve(repositoryRoot, 'dist/pages-demo');
const applicationCssSource = resolve(repositoryRoot, 'apps/web/src/app/globals.css');

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
for (const fileName of ['index.html', 'demo.css', 'demo.js']) {
  await cp(resolve(sourceRoot, fileName), resolve(outputRoot, fileName));
}

await cp(applicationCssSource, resolve(outputRoot, 'app.css'));
await cp(resolve(repositoryRoot, 'apps/web/src/app/icon.svg'), resolve(outputRoot, 'icon.svg'));

const applicationCss = await readFile(applicationCssSource, 'utf8');
const importedStylesheets = [...applicationCss.matchAll(/@import\s+['\"]([^'\"]+)['\"]/g)].map(
  ([, relativePath]) => relativePath,
);
for (const relativePath of importedStylesheets) {
  if (!relativePath.startsWith('./') || !relativePath.endsWith('.css')) {
    throw new Error(`Unsupported static demo stylesheet import: ${relativePath}`);
  }

  const outputPath = resolve(outputRoot, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await cp(resolve(dirname(applicationCssSource), relativePath), outputPath);
}

await writeFile(resolve(outputRoot, '.nojekyll'), '');
console.log(`Built GitHub Pages demo at ${outputRoot}`);
