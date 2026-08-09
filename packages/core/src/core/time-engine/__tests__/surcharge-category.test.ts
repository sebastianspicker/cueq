import { describe, expect, it } from 'vitest';
import type { SurchargeCategory } from '@cueq/policy';
import { configByCategory, selectSurchargeCategory } from './surcharge-test-support.js';

describe('selectSurchargeCategory', () => {
  it('returns null for empty categories', () => {
    expect(selectSurchargeCategory([], configByCategory)).toBeNull();
  });

  it('returns the single category when only one matches', () => {
    expect(selectSurchargeCategory(['NIGHT'], configByCategory)).toBe('NIGHT');
    expect(selectSurchargeCategory(['WEEKEND'], configByCategory)).toBe('WEEKEND');
    expect(selectSurchargeCategory(['HOLIDAY'], configByCategory)).toBe('HOLIDAY');
  });

  it('selects highest priority: HOLIDAY > WEEKEND > NIGHT', () => {
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], configByCategory)).toBe('WEEKEND');
    expect(selectSurchargeCategory(['NIGHT', 'HOLIDAY'], configByCategory)).toBe('HOLIDAY');
    expect(selectSurchargeCategory(['WEEKEND', 'HOLIDAY'], configByCategory)).toBe('HOLIDAY');
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], configByCategory)).toBe(
      'HOLIDAY',
    );
  });

  it('uses tie-break when priorities are equal', () => {
    const equalPriority = new Map<SurchargeCategory, { priority: number }>([
      ['NIGHT', { priority: 100 }],
      ['WEEKEND', { priority: 100 }],
      ['HOLIDAY', { priority: 100 }],
    ]);
    // Tie-break: HOLIDAY(3) > WEEKEND(2) > NIGHT(1)
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], equalPriority)).toBe('WEEKEND');
    expect(selectSurchargeCategory(['NIGHT', 'HOLIDAY'], equalPriority)).toBe('HOLIDAY');
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], equalPriority)).toBe('HOLIDAY');
  });

  it('handles category not found in config (defaults to priority 0)', () => {
    // Config only has HOLIDAY, but input includes NIGHT and WEEKEND
    const partialConfig = new Map<SurchargeCategory, { priority: number }>([
      ['HOLIDAY', { priority: 300 }],
    ]);
    // HOLIDAY has priority 300, others default to 0 → HOLIDAY wins
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], partialConfig)).toBe('HOLIDAY');
    // When only unconfigured categories: WEEKEND(tiebreak=2) > NIGHT(tiebreak=1)
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], partialConfig)).toBe('WEEKEND');
  });

  it('respects custom config where NIGHT has higher priority than WEEKEND', () => {
    const reversedConfig = new Map<SurchargeCategory, { priority: number }>([
      ['NIGHT', { priority: 300 }],
      ['WEEKEND', { priority: 200 }],
      ['HOLIDAY', { priority: 100 }],
    ]);
    // NIGHT now has highest priority, overriding default tie-break order
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND'], reversedConfig)).toBe('NIGHT');
    expect(selectSurchargeCategory(['NIGHT', 'WEEKEND', 'HOLIDAY'], reversedConfig)).toBe('NIGHT');
    expect(selectSurchargeCategory(['WEEKEND', 'HOLIDAY'], reversedConfig)).toBe('WEEKEND');
  });

  it('handles single-element array (no sorting needed)', () => {
    const emptyConfig = new Map<SurchargeCategory, { priority: number }>();
    // Even without config, single category is returned directly
    expect(selectSurchargeCategory(['NIGHT'], emptyConfig)).toBe('NIGHT');
  });
});
