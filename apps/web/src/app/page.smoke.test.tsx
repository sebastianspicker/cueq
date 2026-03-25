import { describe, expect, it } from 'vitest';
import Home from './page';

describe('@cueq/web smoke test', () => {
  it('exports a page component', () => {
    expect(Home).toBeTypeOf('function');
  });
});
