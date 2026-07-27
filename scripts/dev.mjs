/** Starts the root development task through the pinned pnpm wrapper and mirrors its lifecycle. */
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const child = spawn(resolve(scriptDirectory, 'pnpm.sh'), ['dev'], {
  cwd: repositoryRoot,
  env: process.env,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Failed to start cueq development processes: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
