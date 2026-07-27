/** CLI entrypoint for the explicitly confirmed, transactional webhook-secret migration. */
import { prisma } from '@cueq/database';
import {
  runWebhookSecretMigration,
  type WebhookSecretMigrationDatabase,
} from '../common/integrations/webhook-secret-migration.js';
import { parseWebhookSecretMigrationMode } from './webhook-secret-migration-args.js';

async function main(): Promise<void> {
  try {
    const report = await runWebhookSecretMigration(
      prisma as unknown as WebhookSecretMigrationDatabase,
      {
        ...parseWebhookSecretMigrationMode(process.argv.slice(2)),
        previousEncryptionKey:
          process.env.WEBHOOK_SECRET_PREVIOUS_ENCRYPTION_KEY?.trim() || undefined,
      },
    );
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch {
    process.stderr.write('Webhook secret migration failed; the transaction was rolled back.\n');
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void main();
