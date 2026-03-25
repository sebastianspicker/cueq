import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { ParseCuidPipe } from './parse-cuid.pipe';

describe('ParseCuidPipe', () => {
  const pipe = new ParseCuidPipe();

  describe('valid CUIDs', () => {
    it('accepts a valid CUID string', () => {
      const cuid = 'cjld2cyuq0000t3rmniod1foy';
      expect(pipe.transform(cuid)).toBe(cuid);
    });

    it('accepts another valid CUID pattern', () => {
      const cuid = 'cabcdefghijklmnopqrstuvwx';
      expect(pipe.transform(cuid)).toBe(cuid);
    });
  });

  describe('invalid CUIDs', () => {
    it('rejects empty string', () => {
      expect(() => pipe.transform('')).toThrow(BadRequestException);
    });

    it('rejects string not starting with c', () => {
      expect(() => pipe.transform('ajld2cyuq0000t3rmniod1foy')).toThrow(BadRequestException);
    });

    it('rejects string that is too short', () => {
      expect(() => pipe.transform('cabc')).toThrow(BadRequestException);
    });

    it('rejects string that is too long', () => {
      expect(() => pipe.transform('cjld2cyuq0000t3rmniod1foyextra')).toThrow(BadRequestException);
    });

    it('rejects string with uppercase letters', () => {
      expect(() => pipe.transform('cABCDEFGHIJKLMNOPQRSTUVWX')).toThrow(BadRequestException);
    });

    it('rejects string with special characters', () => {
      expect(() => pipe.transform('cjld2cyuq0000t3rmniod1fo!')).toThrow(BadRequestException);
    });

    it('rejects non-string values', () => {
      expect(() => pipe.transform(12345 as never)).toThrow(BadRequestException);
    });
  });
});
