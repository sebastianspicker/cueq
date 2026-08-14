import type { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from './auth.guard.js';

export function createContext(request: {
  headers: Record<string, string | string[] | undefined>;
  user?: unknown;
}): ExecutionContext {
  return {
    getClass: () => AuthGuard,
    getHandler: () => AuthGuard,
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}
