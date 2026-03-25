import type { PipeTransform } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import type { ZodType, ZodTypeDef, ZodError } from 'zod';

/**
 * NestJS pipe that validates and transforms the incoming payload using a Zod schema.
 *
 * Usage at the controller level:
 * ```ts
 * @Post()
 * create(@Body(new ZodValidationPipe(CreateBookingSchema)) payload: CreateBooking) { ... }
 * ```
 *
 * On validation failure, throws a 400 BadRequestException with structured issue details.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value ?? {});

    if (result.success) {
      return result.data;
    }

    const zodError = result.error as ZodError;
    const details = zodError.issues.map((issue) => issue.message);
    throw new BadRequestException({
      statusCode: 400,
      error: 'Validation Error',
      message: details.join('; '),
      details,
    });
  }
}
