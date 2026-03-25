import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

const TestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  age: z.number().int().positive('Age must be positive'),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(TestSchema);

  describe('valid input', () => {
    it('returns parsed data for valid input', () => {
      const result = pipe.transform({ name: 'Alice', age: 30 });
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('strips unknown properties', () => {
      const result = pipe.transform({ name: 'Bob', age: 25, extra: true });
      expect(result).toEqual({ name: 'Bob', age: 25 });
    });
  });

  describe('invalid input', () => {
    it('throws BadRequestException for missing required fields', () => {
      expect(() => pipe.transform({})).toThrow(BadRequestException);
    });

    it('throws BadRequestException for wrong types', () => {
      expect(() => pipe.transform({ name: 'Alice', age: 'not-a-number' })).toThrow(
        BadRequestException,
      );
    });

    it('includes validation details in the exception response', () => {
      let thrown: BadRequestException | undefined;
      try {
        pipe.transform({ name: '', age: -1 });
      } catch (error) {
        thrown = error as BadRequestException;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      const response = thrown!.getResponse() as { details: string[] };
      expect(response.details).toEqual(['Name is required', 'Age must be positive']);
    });

    it('treats null/undefined input as empty object', () => {
      expect(() => pipe.transform(null)).toThrow(BadRequestException);
      expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    });
  });

  describe('with scalar schema', () => {
    it('validates and transforms non-object schemas', () => {
      const stringPipe = new ZodValidationPipe(z.string().min(3));
      expect(stringPipe.transform('hello')).toBe('hello');
      expect(() => stringPipe.transform('ab')).toThrow(BadRequestException);
    });
  });
});
