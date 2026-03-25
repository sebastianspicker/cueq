import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

function allowPrivateTargets(env: NodeJS.ProcessEnv): boolean {
  const raw = (env.WEBHOOK_ALLOW_PRIVATE_TARGETS ?? '').trim().toLowerCase();
  if (ENABLED_VALUES.has(raw)) {
    return true;
  }
  if (DISABLED_VALUES.has(raw)) {
    return false;
  }

  return !isProductionRuntime(env);
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/u, '');
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'localhost.localdomain'
  );
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map((part) => Number(part));
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) {
    return false;
  }

  const a = octets[0];
  const b = octets[1];
  if (a === undefined || b === undefined) {
    return false;
  }

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized === '::' || normalized === '::1') {
    return true;
  }
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }
  if (/^fe[89ab]/u.test(normalized)) {
    return true;
  }

  const mappedIpv4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(normalized)?.[1];
  if (mappedIpv4 && isPrivateIpv4(mappedIpv4)) {
    return true;
  }

  return false;
}

function targetsPrivateAddress(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (isLocalHostname(normalized)) {
    return true;
  }

  const ipVersion = isIP(normalized);
  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }
  if (ipVersion === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

async function resolvesToPrivateAddress(hostname: string): Promise<boolean> {
  const normalized = normalizeHostname(hostname);
  if (targetsPrivateAddress(normalized)) {
    return true;
  }

  if (isIP(normalized)) {
    return false;
  }

  try {
    const addresses = await lookup(normalized, { all: true, verbatim: true });
    return addresses.some((record) => targetsPrivateAddress(record.address));
  } catch {
    return false;
  }
}

export function assertWebhookTargetUrl(url: string, env: NodeJS.ProcessEnv = process.env): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BadRequestException('Webhook url must be a valid absolute URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new BadRequestException('Webhook url protocol must be http or https.');
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestException('Webhook url must not include user credentials.');
  }

  if (!allowPrivateTargets(env) && targetsPrivateAddress(parsed.hostname)) {
    throw new BadRequestException(
      'Webhook url must not target localhost or private network addresses.',
    );
  }

  if (parsed.protocol === 'http:' && isProductionRuntime(env) && !allowPrivateTargets(env)) {
    throw new BadRequestException(
      'Webhook url must use https in production unless private targets are explicitly allowed.',
    );
  }

  return parsed;
}

export async function assertWebhookDispatchTargetUrl(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<URL> {
  const parsed = assertWebhookTargetUrl(url, env);
  if (allowPrivateTargets(env)) {
    return parsed;
  }

  if (await resolvesToPrivateAddress(parsed.hostname)) {
    throw new BadRequestException(
      'Webhook url must not target localhost or private network addresses.',
    );
  }

  return parsed;
}
