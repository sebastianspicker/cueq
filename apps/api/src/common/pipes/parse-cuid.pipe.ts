import type { PipeTransform } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';

const CUID_PATTERN = /^c[a-z0-9]{24}$/;

/**
 * NestJS pipe that validates a route parameter is a valid CUID string.
 *
 * Usage:
 * ```ts
 * @Get(':id')
 * findOne(@Param('id', ParseCuidPipe) id: string) { ... }
 * ```
 */
export class ParseCuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !CUID_PATTERN.test(value)) {
      throw new BadRequestException(`"${value}" is not a valid CUID identifier.`);
    }
    return value;
  }
}
