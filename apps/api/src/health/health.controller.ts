/** Operational health endpoints that expose service readiness without employee data. */
import { Controller, Get, Inject } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@cueq/database';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../persistence/prisma.service.js';

type TerminalHealth = { lastSeenAt: Date | null };

function latestTerminalSeenAt(devices: TerminalHealth[]): string | null {
  return (
    devices
      .reduce<Date | null>(
        (latest, device) =>
          device.lastSeenAt && (!latest || device.lastSeenAt > latest) ? device.lastSeenAt : latest,
        null,
      )
      ?.toISOString() ?? null
  );
}

function readinessReasons(staleTerminals: number, hrImportStatus: string | null): string[] {
  return [
    ...(staleTerminals > 0 ? ['STALE_TERMINALS'] : []),
    ...(hrImportStatus === 'FAILED' ? ['FAILED_HR_IMPORT'] : []),
  ];
}

/** Serves public liveness and authorized operational health summaries. */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
    };
  }

  @Get('ready')
  @ApiBearerAuth()
  @Roles(Role.HR, Role.ADMIN)
  @ApiOperation({ summary: 'Authenticated readiness and operations status' })
  @ApiResponse({ status: 200, description: 'Authenticated readiness details' })
  async readiness() {
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
    const degradedReasons = readinessReasons(staleTerminals, lastHrImportRun?.status ?? null);
    const degraded = degradedReasons.length > 0;

    return {
      status: degraded ? 'degraded' : 'ok',
      timestamp: generatedAt.toISOString(),
      version: process.env.npm_package_version ?? '0.0.0',
      degraded,
      degradedReasons,
      operations: {
        terminal: {
          total: terminalDevices.length,
          stale: staleTerminals,
          lastSeenAt: latestTerminalSeenAt(terminalDevices),
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
