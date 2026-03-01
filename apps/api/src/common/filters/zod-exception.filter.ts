import type { ArgumentsHost } from '@nestjs/common';
import { Catch } from '@nestjs/common';
import type { HttpAdapterHost } from '@nestjs/core';
import { BaseExceptionFilter } from '@nestjs/core';

type ZodLikeIssue = {
  message?: unknown;
  path?: unknown;
};

function isZodLikeError(exception: unknown): exception is { issues: ZodLikeIssue[] } {
  if (!exception || typeof exception !== 'object') {
    return false;
  }

  const candidate = exception as { issues?: unknown };
  return Array.isArray(candidate.issues);
}

@Catch()
export class ZodExceptionFilter extends BaseExceptionFilter {
  constructor(adapterHost: HttpAdapterHost) {
    super(adapterHost.httpAdapter);
  }

  override catch(exception: unknown, host: ArgumentsHost) {
    if (isZodLikeError(exception)) {
      const context = host.switchToHttp();
      const response = context.getResponse<{
        status: (code: number) => { json: (payload: unknown) => void };
      }>();

      response.status(400).json({
        statusCode: 400,
        error: 'Bad Request',
        message: exception.issues.map((issue) =>
          typeof issue.message === 'string' ? issue.message : 'Invalid request payload.',
        ),
        issues: exception.issues,
      });
      return;
    }

    super.catch(exception, host);
  }
}
