import type { Route } from '@playwright/test';

import { API_FIXTURE_ROUTES, PROFILES } from './mock-university.fixtures';

function bearerToken(route: Route): string | null {
  const value = route.request().headers().authorization;
  return value?.startsWith('Bearer ') ? value.slice('Bearer '.length) : null;
}

function hasExactQuery(url: URL, expected: Record<string, string>): boolean {
  const actual = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  const wanted = Object.entries(expected).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(actual) === JSON.stringify(wanted);
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });
}

export async function handleApiRoute(route: Route, unexpectedRequests: string[]) {
  const request = route.request();
  const url = new URL(request.url());
  const token = bearerToken(route);
  const requestLabel = `${request.method()} ${url.pathname}${url.search}`;

  if (request.method() !== 'GET') {
    unexpectedRequests.push(requestLabel);
    await json(route, 501, { message: `Unhandled demo request: ${requestLabel}` });
    return;
  }

  if (url.pathname === '/api/v1/me') {
    const profile = token ? PROFILES.get(token) : null;
    await json(route, profile ? 200 : 401, profile ?? { message: 'Synthetic token required.' });
    return;
  }

  const fixture = API_FIXTURE_ROUTES.find(
    ({ pathname, query }) => pathname === url.pathname && hasExactQuery(url, query),
  );
  if (!fixture) {
    unexpectedRequests.push(requestLabel);
    await json(route, 501, { message: `Unhandled demo request: ${requestLabel}` });
    return;
  }

  if (token !== fixture.expectedToken) {
    unexpectedRequests.push(`Forbidden fixture request: ${requestLabel}`);
    await json(route, 403, { message: 'Synthetic role does not match this fixture.' });
    return;
  }

  await json(route, 200, fixture.payload);
}
