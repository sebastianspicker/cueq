/** Registers the lifecycle-managed Prisma client as global Nest infrastructure. */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/** Exports one shared client so feature modules do not need repeated persistence imports. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
