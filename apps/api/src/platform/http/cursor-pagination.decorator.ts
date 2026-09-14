import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiQuery } from '@nestjs/swagger';

/** Common continuation contract for bounded collection reads. */
export function CursorPagination() {
  return applyDecorators(
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
    }),
    ApiQuery({
      name: 'cursor',
      required: false,
      type: String,
      description: 'Opaque nextCursor from the previous page',
    }),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'nextCursor'],
        properties: {
          items: { type: 'array', items: { type: 'object' } },
          nextCursor: { type: 'string', nullable: true },
        },
      },
    }),
  );
}
