import type { Page, Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

import { handleApiRoute } from './mock-university.api-routing';

const BUILD_ROOT = resolve(process.cwd(), '.next');
const STATIC_ROOT = resolve(BUILD_ROOT, 'static');
const APP_ROOT = resolve(BUILD_ROOT, 'server/app');

function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function contentType(filePath: string, isRsc: boolean): string {
  if (isRsc) return 'text/x-component; charset=utf-8';
  const types: Record<string, string> = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  };
  return types[extname(filePath)] ?? 'application/octet-stream';
}

async function serveNextBuild(route: Route, unexpectedRequests: string[]) {
  const request = route.request();
  const url = new URL(request.url());
  const decodedPath = decodeURIComponent(url.pathname);
  const isRsc = request.headers().rsc === '1' || url.searchParams.has('_rsc');
  let filePath: string | null = null;
  let allowedRoot: string | null = null;

  if (decodedPath.startsWith('/_next/static/')) {
    filePath = resolve(STATIC_ROOT, decodedPath.slice('/_next/static/'.length));
    allowedRoot = STATIC_ROOT;
  } else if (decodedPath === '/icon.svg') {
    filePath = resolve(APP_ROOT, 'icon.svg.body');
    allowedRoot = APP_ROOT;
  } else if (/^\/(?:de|en)(?:\/[a-z0-9-]+)?\/?$/u.test(decodedPath)) {
    const appPath = decodedPath.replace(/^\//u, '').replace(/\/$/u, '');
    filePath = resolve(APP_ROOT, `${appPath}.${isRsc ? 'rsc' : 'html'}`);
    allowedRoot = APP_ROOT;
  }

  if (!filePath || !allowedRoot || !isWithin(allowedRoot, filePath)) {
    const label = `${request.method()} ${url.pathname}${url.search}`;
    unexpectedRequests.push(`Unhandled build request: ${label}`);
    await route.fulfill({ status: 404, body: 'Not found' });
    return;
  }

  try {
    const body = await readFile(filePath);
    await route.fulfill({
      status: 200,
      contentType: decodedPath === '/icon.svg' ? 'image/svg+xml' : contentType(filePath, isRsc),
      headers: isRsc
        ? {
            'x-nextjs-prerender': '1',
            'x-nextjs-stale-time': '300',
          }
        : undefined,
      body,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    unexpectedRequests.push(`Missing build asset: ${url.pathname} (${message})`);
    await route.fulfill({ status: 404, body: 'Not found' });
  }
}

export async function installMockUniversityFixtureBrowser(
  page: Page,
  unexpectedRequests: string[],
) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/')) {
      await handleApiRoute(route, unexpectedRequests);
      return;
    }
    await serveNextBuild(route, unexpectedRequests);
  });
}
