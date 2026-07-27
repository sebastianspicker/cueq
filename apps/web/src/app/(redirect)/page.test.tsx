import { beforeEach, describe, expect, it, vi } from 'vitest';

const { cookiesMock, redirectMock } = vi.hoisted(() => ({
  cookiesMock: vi.fn(),
  redirectMock: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: cookiesMock,
}));

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import Home from './page';

describe('root locale redirect', () => {
  beforeEach(() => {
    cookiesMock.mockReset();
    redirectMock.mockReset();
  });

  it.each([
    ['en', '/en/dashboard'],
    ['de', '/de/dashboard'],
    ['fr', '/de/dashboard'],
    [undefined, '/de/dashboard'],
  ])('maps locale cookie %s to %s', async (locale, destination) => {
    cookiesMock.mockResolvedValue({
      get: vi.fn().mockReturnValue(locale === undefined ? undefined : { value: locale }),
    });

    await Home();

    expect(redirectMock).toHaveBeenCalledWith(destination);
  });
});
