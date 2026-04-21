import { describe, expect, it } from 'vitest';
import { PrismaClient } from '../index';

describe('@cueq/database smoke test', () => {
  it('exports PrismaClient', () => {
    expect(PrismaClient).toBeDefined();
  });
});
