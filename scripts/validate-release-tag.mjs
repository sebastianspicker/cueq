#!/usr/bin/env node

/** Enforces the canonical numeric source-alpha tag shape used by CI and CodeQL. */
import { pathToFileURL } from 'node:url';

const ALPHA_TAG_PATTERN =
  /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-alpha\.(?:0|[1-9]\d*)$/u;

/** Accepts only canonical `vMAJOR.MINOR.PATCH-alpha.N` tags without leading zeroes. */
export function isValidAlphaTag(tag) {
  return ALPHA_TAG_PATTERN.test(tag);
}

function main(tag) {
  if (!isValidAlphaTag(tag ?? '')) {
    process.stderr.write(
      `Invalid alpha tag "${tag ?? ''}". Expected vMAJOR.MINOR.PATCH-alpha.N.\n`,
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`Validated alpha tag: ${tag}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv[2]);
}
