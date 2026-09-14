import { dirname, resolve } from 'node:path';

export function packageBinary(packageJsonPath, packageJson, binaryName) {
  const binaryPath =
    typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.[binaryName];
  if (typeof binaryPath !== 'string') {
    throw new Error(
      `${packageJson.name ?? packageJsonPath} does not expose the ${binaryName} binary.`,
    );
  }
  return resolve(dirname(packageJsonPath), binaryPath);
}
