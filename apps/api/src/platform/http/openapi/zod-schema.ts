/** OpenAPI projection of the pinned Zod contracts; runtime refinements remain server enforced. */
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface.js';
import { z } from 'zod';

export function zodOpenApiSchema(schema: z.ZodTypeAny): SchemaObject {
  if (schema instanceof z.ZodEffects) return zodOpenApiSchema(schema.innerType());
  if (schema instanceof z.ZodOptional) return zodOpenApiSchema(schema.unwrap());
  if (schema instanceof z.ZodNullable)
    return { ...zodOpenApiSchema(schema.unwrap()), nullable: true };
  if (schema instanceof z.ZodDefault)
    return { ...zodOpenApiSchema(schema.removeDefault()), default: schema._def.defaultValue() };
  const scalar = scalarSchema(schema);
  if (scalar) return scalar;
  if (schema instanceof z.ZodObject) return objectSchema(schema);
  if (schema instanceof z.ZodArray)
    return {
      type: 'array',
      items: zodOpenApiSchema(schema.element),
      ...(schema._def.minLength ? { minItems: schema._def.minLength.value } : {}),
      ...(schema._def.maxLength ? { maxItems: schema._def.maxLength.value } : {}),
    };
  if (schema instanceof z.ZodRecord)
    return { type: 'object', additionalProperties: zodOpenApiSchema(schema.valueSchema) };
  if (schema instanceof z.ZodUnion) return { anyOf: schema.options.map(zodOpenApiSchema) };
  if (schema instanceof z.ZodDiscriminatedUnion)
    return { oneOf: schema.options.map(zodOpenApiSchema) };
  if (schema instanceof z.ZodUnknown || schema instanceof z.ZodAny) return {};
  throw new Error(`Unsupported OpenAPI contract: ${schema._def.typeName}`);
}

function objectSchema(schema: z.AnyZodObject): SchemaObject {
  const properties: Record<string, SchemaObject> = {};
  const required: string[] = [];
  for (const [key, value] of Object.entries(schema.shape as z.ZodRawShape)) {
    properties[key] = zodOpenApiSchema(value);
    if (!value.isOptional()) required.push(key);
  }
  return {
    type: 'object',
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: schema._def.unknownKeys === 'passthrough',
  };
}

function stringSchema(schema: z.ZodString): SchemaObject {
  const result: SchemaObject = { type: 'string' };
  for (const check of schema._def.checks) {
    if (check.kind === 'min') result.minLength = check.value;
    if (check.kind === 'max') result.maxLength = check.value;
    if (check.kind === 'regex') result.pattern = check.regex.source;
    if (check.kind === 'datetime') result.format = 'date-time';
    if (check.kind === 'date') result.format = 'date';
    if (check.kind === 'email') result.format = 'email';
    if (check.kind === 'cuid') result.format = 'cuid';
  }
  return result;
}

function numberSchema(schema: z.ZodNumber): SchemaObject {
  const result: SchemaObject = { type: 'number' };
  for (const check of schema._def.checks) {
    if (check.kind === 'int') result.type = 'integer';
    if (check.kind === 'multipleOf') result.multipleOf = check.value;
    if (check.kind === 'min') {
      result.minimum = check.value;
      result.exclusiveMinimum = !check.inclusive;
    }
    if (check.kind === 'max') {
      result.maximum = check.value;
      result.exclusiveMaximum = !check.inclusive;
    }
  }
  return result;
}

function scalarSchema(schema: z.ZodTypeAny): SchemaObject | undefined {
  if (schema instanceof z.ZodNull) return { nullable: true };
  if (schema instanceof z.ZodString) return stringSchema(schema);
  if (schema instanceof z.ZodNumber) return numberSchema(schema);
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodLiteral) return { type: typeof schema.value, enum: [schema.value] };
  return undefined;
}
