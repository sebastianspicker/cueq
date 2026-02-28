import { describe, expect, it } from 'vitest';
import Home from './page';

describe('@cueq/web integration', () => {
  it('exports the landing page component', () => {
    expect(Home).toBeTypeOf('function');
  });
});
