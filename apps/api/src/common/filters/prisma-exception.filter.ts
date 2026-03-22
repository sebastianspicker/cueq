import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, Logger } from '@nestjs/common';
import { Prisma } from '@cueq/database';

/**
 * Safety-net filter for unhandled Prisma exceptions.
 *
 * Service methods perform existence checks before mutations, so most Prisma
 * errors should never reach this filter. It exists to prevent raw Prisma
 * stack traces from leaking to clients in race-condition scenarios.
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { json: (payload: unknown) => void };
    }>();

    this.logger.warn(
      `Unhandled Prisma error ${exception.code}: ${exception.message.split('\n').pop()}`,
    );

    switch (exception.code) {
      case 'P2002': {
        response.status(409).json({
          statusCode: 409,
          error: 'Conflict',
          message: 'A record with the given unique constraint already exists.',
        });
        return;
      }
      case 'P2003': {
        response.status(400).json({
          statusCode: 400,
          error: 'Bad Request',
          message: 'A referenced related record does not exist.',
        });
        return;
      }
      case 'P2025': {
        response.status(404).json({
          statusCode: 404,
          error: 'Not Found',
          message: 'The requested record was not found.',
        });
        return;
      }
      default: {
        response.status(500).json({
          statusCode: 500,
          error: 'Internal Server Error',
          message: 'An unexpected database error occurred.',
        });
      }
    }
  }
}
