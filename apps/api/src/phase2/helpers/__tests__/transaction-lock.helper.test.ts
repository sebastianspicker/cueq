import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  lockClosingPeriodWrites,
  lockOrganizationRosterWrites,
  lockPersonWrites,
  lockPolicyWrites,
  lockRosterWrites,
  lockTerminalIngestion,
  lockTerminalWrites,
} from '../transaction-lock.helper.js';

function transactionWithLocks(results: boolean[]) {
  const queryRaw = vi.fn();
  for (const acquired of results) {
    queryRaw.mockResolvedValueOnce([{ acquired }]);
  }
  return { $queryRaw: queryRaw };
}

describe('transaction advisory locks', () => {
  it('locks unique people in deterministic lexical order', async () => {
    const tx = transactionWithLocks([true, true]);

    await lockPersonWrites(tx as never, ['person-b', 'person-a', 'person-b']);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:person-write:person-a',
      'cueq:person-write:person-b',
    ]);
  });

  it('returns a retryable domain conflict when a person lock is held', async () => {
    const tx = transactionWithLocks([false]);

    await expect(lockPersonWrites(tx as never, ['person-a'])).rejects.toMatchObject({
      response: {
        code: 'PERSON_WRITE_IN_PROGRESS',
        retryable: true,
      },
    });
  });

  it('uses a separate closing-export lock namespace', async () => {
    const tx = transactionWithLocks([true]);

    await lockClosingPeriodWrites(tx as never, 'closing-1');

    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe('cueq:closing-period-write:closing-1');
  });

  it('throws ConflictException for a held closing lock', async () => {
    const tx = transactionWithLocks([false]);

    await expect(lockClosingPeriodWrites(tx as never, 'closing-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('keys terminal ingestion locks by terminal and checksum', async () => {
    const tx = transactionWithLocks([true]);

    await lockTerminalIngestion(tx as never, 'terminal-1', 'checksum-1');

    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe('cueq:terminal-ingestion:terminal-1:checksum-1');
  });

  it('serializes device-level terminal updates independently of ingestion identity', async () => {
    const tx = transactionWithLocks([true]);

    await lockTerminalWrites(tx as never, 'terminal-1');

    expect(tx.$queryRaw.mock.calls[0]?.[1]).toBe('cueq:terminal-write:terminal-1');
  });

  it('uses deterministic namespaces for roster and policy writes', async () => {
    const tx = transactionWithLocks([true, true, true, true]);

    await lockRosterWrites(tx as never, ['roster-b', 'roster-a']);
    await lockOrganizationRosterWrites(tx as never, 'org-1');
    await lockPolicyWrites(tx as never, 'workflow:absence');

    expect(tx.$queryRaw.mock.calls.map((call) => call[1])).toEqual([
      'cueq:roster-write:roster-a',
      'cueq:roster-write:roster-b',
      'cueq:organization-roster-write:org-1',
      'cueq:policy-write:workflow:absence',
    ]);
  });
});
