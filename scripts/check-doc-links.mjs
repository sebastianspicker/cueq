#!/usr/bin/env node

/**
 * Validates internal Markdown links across tracked and candidate public docs.
 * Git metadata defines the publication surface so ignored archives, generated
 * output, and deleted indexed files do not create misleading failures.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const gitLs = spawnSync(
  'git',
  [
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '--',
    '*.md',
    ':!:docs/archive/**',
    ':!:docs/generated/**',
    ':!:**/node_modules/**',
    ':!:apps/web/.next/**',
  ],
  {
    cwd: repoRoot,
    encoding: 'utf8',
  },
);

if (gitLs.status !== 0) {
  process.stderr.write(gitLs.stderr || 'Failed to enumerate markdown files.\n');
  process.exit(gitLs.status ?? 1);
}

const markdownFiles = gitLs.stdout
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .filter((line, index, lines) => lines.indexOf(line) === index)
  .map((line) => resolve(repoRoot, line));

const markdownLinkPattern = /\[[^\]]+]\(([^)\s]+)(?:\s+\"[^\"]*\")?\)/g;
const failures = [];

function existsPath(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

for (const file of markdownFiles) {
  if (!existsPath(file)) {
    // Ignore deleted files that are still present in the git index before commit.
    continue;
  }
  const source = readFileSync(file, 'utf8');
  const localDir = dirname(file);
  let match;

  while ((match = markdownLinkPattern.exec(source))) {
    const target = match[1];
    if (!target) {
      continue;
    }
    if (
      target.startsWith('http://') ||
      target.startsWith('https://') ||
      target.startsWith('mailto:') ||
      target.startsWith('#')
    ) {
      continue;
    }

    const [pathPart] = target.split('#', 1);
    if (!pathPart) {
      continue;
    }

    const candidate = pathPart.startsWith('/')
      ? resolve(repoRoot, `.${pathPart}`)
      : resolve(localDir, pathPart);
    const candidates = [candidate];
    if (!extname(candidate)) {
      candidates.push(`${candidate}.md`);
      candidates.push(resolve(candidate, 'index.md'));
    }

    const found = candidates.some((entry) => existsPath(entry));
    if (!found) {
      failures.push({
        file,
        target,
      });
    }
  }
}

if (failures.length > 0) {
  process.stderr.write('Broken markdown links found:\n');
  for (const failure of failures) {
    process.stderr.write(`- ${failure.file} -> ${failure.target}\n`);
  }
  process.exit(1);
}

process.stdout.write(`Markdown link check passed for ${markdownFiles.length} files.\n`);
