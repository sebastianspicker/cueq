/** Resolves the API bind host without changing production deployment defaults. */
export function resolveDevelopmentListenHost(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (environment.NODE_ENV === 'production') {
    return undefined;
  }

  return environment.CUEQ_DEV_HOST || '127.0.0.1';
}
