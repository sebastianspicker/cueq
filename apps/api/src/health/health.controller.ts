import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../persistence/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async check() {
    const generatedAt = new Date();
    const thirtyMinutesAgo = new Date(generatedAt.getTime() - 30 * 60 * 1000);

    const [lastExportRun, lastHrImportRun, latestBackupVerification, terminalDevices] =
      await Promise.all([
        this.prisma.exportRun.findFirst({ orderBy: { exportedAt: 'desc' } }),
        this.prisma.hrImportRun.findFirst({ orderBy: { importedAt: 'desc' } }),
        this.prisma.auditEntry.findFirst({
          where: { action: 'BACKUP_RESTORE_VERIFIED' },
          orderBy: { timestamp: 'desc' },
        }),
        this.prisma.terminalDevice.findMany(),
      ]);

    const staleTerminals = terminalDevices.filter(
      (device) => !device.lastSeenAt || device.lastSeenAt < thirtyMinutesAgo,
    ).length;

    return {
      status: 'ok',
      timestamp: generatedAt.toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      operations: {
        terminal: {
          total: terminalDevices.length,
          stale: staleTerminals,
          lastSeenAt:
            terminalDevices
              .map((device) => device.lastSeenAt)
              .filter((value): value is Date => Boolean(value))
              .sort((left, right) => right.getTime() - left.getTime())[0]
              ?.toISOString() ?? null,
        },
        hrImport: {
          lastRunAt: lastHrImportRun?.importedAt.toISOString() ?? null,
          lastStatus: lastHrImportRun?.status ?? null,
        },
        payrollExport: {
          lastRunAt: lastExportRun?.exportedAt.toISOString() ?? null,
          lastChecksum: lastExportRun?.checksum ?? null,
        },
        backupRestore: {
          lastVerifiedAt: latestBackupVerification?.timestamp.toISOString() ?? null,
        },
      },
    };
  }
}
