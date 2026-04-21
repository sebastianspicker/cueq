import { describe, expect, it } from 'vitest';
import Home from './page';
import TimeEnginePage from './[locale]/time-engine/page';

describe('@cueq/web integration', () => {
  it('exports the landing page component', () => {
    expect(Home).toBeTypeOf('function');
  });

  it('exports the time-engine sandbox page component', () => {
    expect(TimeEnginePage).toBeTypeOf('function');
  });
});
