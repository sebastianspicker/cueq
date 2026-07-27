/** Fetches and validates HR master data from the configured HTTP provider. */
import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type { HrMasterProviderPort, HrMasterRecord } from './hr-master-provider.port.js';

const HrMasterApiRecordSchema = z.object({
  externalId: z.string().min(1),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  role: z.string().min(1),
  organizationUnit: z.string().min(1),
  workTimeModel: z.string().min(1),
  weeklyHours: z.string().min(1),
  dailyTargetHours: z.string().min(1),
  supervisorExternalId: z.string().min(1).optional(),
});

const HrMasterApiResponseSchema = z.union([
  z.array(HrMasterApiRecordSchema),
  z.object({
    records: z.array(HrMasterApiRecordSchema),
  }),
]);

const DEFAULT_TIMEOUT_MS = 10_000;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 60_000;

function configuredUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new ServiceUnavailableException('HR_MASTER_API_URL is invalid.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ServiceUnavailableException('HR_MASTER_API_URL must use HTTP or HTTPS.');
  }
  if (parsed.username || parsed.password) {
    throw new ServiceUnavailableException('HR_MASTER_API_URL must not include credentials.');
  }
  if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
    throw new ServiceUnavailableException('HR_MASTER_API_URL must use HTTPS in production.');
  }

  return parsed;
}

function configuredTimeoutMs(rawTimeout: string | undefined): number {
  const parsed = Number(rawTimeout ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(Math.max(Math.trunc(parsed), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}

/**
 * HTTP adapter for the optional HR master-data source.
 * It validates configuration and response shape before data enters the import pipeline.
 */
export class HttpHrMasterProvider implements HrMasterProviderPort {
  async fetchMasterRecords(): Promise<HrMasterRecord[]> {
    const url = process.env.HR_MASTER_API_URL;
    if (!url) {
      throw new ServiceUnavailableException('HR_MASTER_API_URL is not configured.');
    }

    const target = configuredUrl(url);
    const timeoutMs = configuredTimeoutMs(process.env.HR_MASTER_API_TIMEOUT_MS);
    const token = process.env.HR_MASTER_API_TOKEN;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(target, {
        method: 'GET',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadGatewayException(`HR master API returned ${response.status}.`);
      }

      const json = (await response.json()) as unknown;
      const parsed = HrMasterApiResponseSchema.safeParse(json);
      if (!parsed.success) {
        throw new BadGatewayException('HR master API returned an invalid payload schema.');
      }

      const records = Array.isArray(parsed.data) ? parsed.data : parsed.data.records;
      return records.map((record) => ({
        externalId: record.externalId,
        firstName: record.firstName,
        lastName: record.lastName,
        email: record.email,
        role: record.role,
        organizationUnit: record.organizationUnit,
        workTimeModel: record.workTimeModel,
        weeklyHours: record.weeklyHours,
        dailyTargetHours: record.dailyTargetHours,
        supervisorExternalId: record.supervisorExternalId,
      }));
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) {
        throw error;
      }

      throw new BadGatewayException('Failed to fetch HR master records.');
    } finally {
      clearTimeout(timer);
    }
  }
}
