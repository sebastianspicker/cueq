#!/usr/bin/env node

/**
 * Verifies that native TypeScript 7 and the TypeScript 6 compatibility API
 * resolve to the exact versions required by CLI, Nest, web, and eslint tooling.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import nativePackageJson from '@typescript/native/package.json' with { type: 'json' };

const EXPECTED_NATIVE_VERSION = '7.0.2';
const EXPECTED_COMPATIBILITY_PACKAGE_VERSION = '6.0.2';
const EXPECTED_COMPATIBILITY_API_VERSION = '6.0.3';

function commandVersion(command) {
  return execFileSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
    .trim()
    .replace(/^Version\s+/u, '');
}

function assertVersion(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(`${label} resolved ${actual}; expected ${expected}.`);
  }
}

function packageRequire(relativePackageJson) {
  return createRequire(new URL(relativePackageJson, import.meta.url));
}

const rootRequire = createRequire(import.meta.url);
const apiRequire = packageRequire('../apps/api/package.json');
const webRequire = packageRequire('../apps/web/package.json');
const nestRequire = createRequire(apiRequire.resolve('@nestjs/cli/package.json'));
const parserRequire = createRequire(rootRequire.resolve('@typescript-eslint/parser/package.json'));

function packageBinary(packageJsonPath, packageJson, binaryName) {
  const binaryPath =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binaryName];
  if (typeof binaryPath !== 'string') {
    throw new Error(`${packageName} does not expose the ${binaryName} binary.`);
  }
  return resolve(dirname(packageJsonPath), binaryPath);
}

assertVersion(
  'native tsc',
  commandVersion(
    packageBinary(rootRequire.resolve('@typescript/native/package.json'), nativePackageJson, 'tsc'),
  ),
  EXPECTED_NATIVE_VERSION,
);
assertVersion(
  'compatibility tsc6',
  commandVersion(
    packageBinary(
      rootRequire.resolve('typescript/package.json'),
      JSON.parse(readFileSync(rootRequire.resolve('typescript/package.json'), 'utf8')),
      'tsc6',
    ),
  ),
  EXPECTED_COMPATIBILITY_API_VERSION,
);
assertVersion(
  'compatibility package',
  rootRequire('typescript/package.json').version,
  EXPECTED_COMPATIBILITY_PACKAGE_VERSION,
);
assertVersion(
  'root TypeScript API',
  rootRequire('typescript').version,
  EXPECTED_COMPATIBILITY_API_VERSION,
);
assertVersion(
  'API TypeScript API',
  apiRequire('typescript').version,
  EXPECTED_COMPATIBILITY_API_VERSION,
);
assertVersion(
  'web TypeScript API',
  webRequire('typescript').version,
  EXPECTED_COMPATIBILITY_API_VERSION,
);
assertVersion(
  'Nest CLI TypeScript API',
  nestRequire('typescript').version,
  EXPECTED_COMPATIBILITY_API_VERSION,
);
assertVersion(
  'typescript-eslint TypeScript API',
  parserRequire('typescript').version,
  EXPECTED_COMPATIBILITY_API_VERSION,
);

process.stdout.write(
  `TypeScript toolchain verified: native ${EXPECTED_NATIVE_VERSION}, compatibility package ${EXPECTED_COMPATIBILITY_PACKAGE_VERSION}, API ${EXPECTED_COMPATIBILITY_API_VERSION}.\n`,
);
