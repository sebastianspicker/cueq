import { BadRequestException } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const DISABLED_VALUES = new Set(['0', 'false', 'no', 'off']);
const NON_PUBLIC_ADDRESSES = new BlockList();

for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv4');
}

for (const [address, prefix] of [
  ['::', 96],
  ['::1', 128],
  ['100::', 64],
  ['2001:2::', 48],
  ['2001:10::', 28],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) {
  NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv6');
}

export interface ResolvedWebhookTarget {
  url: URL;
  address: string;
  family: 4 | 6;
}

function isProductionRuntime(env: NodeJS.ProcessEnv): boolean {
  return (env.NODE_ENV ?? '').trim().toLowerCase() === 'production';
}

function allowPrivateRegistrationTargets(env: NodeJS.ProcessEnv): boolean {
  const configured = (env.WEBHOOK_ALLOW_PRIVATE_TARGETS ?? '').trim().toLowerCase();
  if (ENABLED_VALUES.has(configured)) {
    return true;
  }
  if (DISABLED_VALUES.has(configured)) {
    return false;
  }

  return !isProductionRuntime(env);
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.+$/u, '');
}

function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized === 'localhost.localdomain'
  );
}

function mappedIpv4(address: string): string | null {
  return /^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu.exec(address)?.[1] ?? null;
}

export function isPublicWebhookAddress(address: string): boolean {
  const normalized = normalizeHostname(address);
  const family = isIP(normalized);
  if (family === 4) {
    return !NON_PUBLIC_ADDRESSES.check(normalized, 'ipv4');
  }
  if (family !== 6) {
    return false;
  }

  const mapped = mappedIpv4(normalized);
  return mapped
    ? !NON_PUBLIC_ADDRESSES.check(mapped, 'ipv4')
    : !NON_PUBLIC_ADDRESSES.check(normalized, 'ipv6');
}

function assertUrlShape(url: string): URL {
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

  return parsed;
}

export function assertWebhookTargetUrl(url: string, env: NodeJS.ProcessEnv = process.env): URL {
  const parsed = assertUrlShape(url);
  const privateTarget =
    isLocalHostname(parsed.hostname) ||
    (isIP(normalizeHostname(parsed.hostname)) > 0 &&
      !isPublicWebhookAddress(normalizeHostname(parsed.hostname)));

  if (!allowPrivateRegistrationTargets(env) && privateTarget) {
    throw new BadRequestException(
      'Webhook url must not target localhost or private network addresses.',
    );
  }
  if (
    parsed.protocol === 'http:' &&
    isProductionRuntime(env) &&
    !allowPrivateRegistrationTargets(env)
  ) {
    throw new BadRequestException(
      'Webhook url must use https in production unless private targets are explicitly allowed.',
    );
  }

  return parsed;
}

async function lookupAllAddresses(hostname: string) {
  const normalized = normalizeHostname(hostname);
  const family = isIP(normalized);
  if (family === 4 || family === 6) {
    return [{ address: normalized, family } as const];
  }

  try {
    return await lookup(normalized, { all: true, verbatim: true });
  } catch {
    throw new BadRequestException('Webhook target DNS lookup failed.');
  }
}

export async function resolveWebhookDispatchTarget(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ResolvedWebhookTarget> {
  const parsed = assertWebhookTargetUrl(url, env);
  const addresses = await lookupAllAddresses(parsed.hostname);
  if (addresses.length === 0) {
    throw new BadRequestException('Webhook target DNS lookup returned no addresses.');
  }
  if (addresses.some((record) => !isPublicWebhookAddress(record.address))) {
    throw new BadRequestException('Webhook target must resolve only to public network addresses.');
  }

  const selected = addresses[0];
  if (!selected || (selected.family !== 4 && selected.family !== 6)) {
    throw new BadRequestException('Webhook target DNS lookup returned an invalid address.');
  }

  return { url: parsed, address: selected.address, family: selected.family };
}

export async function assertWebhookDispatchTargetUrl(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<URL> {
  return (await resolveWebhookDispatchTarget(url, env)).url;
}
