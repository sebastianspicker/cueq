/** Shared transaction locking and closed-period write-barrier infrastructure. */
import { Module } from '@nestjs/common';
import { ClosingLockHelper } from './closing-lock.helper.js';

@Module({
  providers: [ClosingLockHelper],
  exports: [ClosingLockHelper],
})
export class TransactionsModule {}
