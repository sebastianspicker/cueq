import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import type { HrMasterProviderPort, HrMasterRecord } from './hr-master-provider.port';

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

export class HttpHrMasterProvider implements HrMasterProviderPort {
  async fetchMasterRecords(): Promise<HrMasterRecord[]> {
    const url = process.env.HR_MASTER_API_URL;
    if (!url) {
      throw new ServiceUnavailableException('HR_MASTER_API_URL is not configured.');
    }

    const timeoutMs = Number(process.env.HR_MASTER_API_TIMEOUT_MS ?? '10000');
    const token = process.env.HR_MASTER_API_TOKEN;

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      Number.isFinite(timeoutMs) ? timeoutMs : 10000,
    );

    try {
      const response = await fetch(url, {
        method: 'GET',
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

      throw new BadGatewayException(
        `Failed to fetch HR master records: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
}
