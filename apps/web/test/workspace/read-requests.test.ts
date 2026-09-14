import { describe, expect, it } from 'vitest';
import { WorkspaceReadRequests } from '../../src/shared/workspace/read-requests';
import { loadAndApply, refreshAfterMutation } from '../../src/shared/workspace/mutation-refresh';
import type { ApiRequest } from '../../src/platform/http/api-client';

const schema = { parse: (value: unknown) => String(value) };
function deferred() {
  let resolve!: (value: string) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<string>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function harness() {
  const pending: ReturnType<typeof deferred>[] = [];
  const signals: (AbortSignal | null | undefined)[] = [];
  const api: ApiRequest = async (_path, responseSchema, init) => {
    const task = deferred();
    pending.push(task);
    signals.push(init?.signal);
    return responseSchema.parse(await task.promise);
  };
  return { reads: new WorkspaceReadRequests(api), pending, signals };
}

describe('workspace resource generations', () => {
  it('ignores an old success even when the transport ignores abort', async () => {
    const { reads, pending, signals } = harness();
    let value = '';
    const first = reads.begin('detail');
    const a = loadAndApply(
      () => first.request('/old', schema),
      (data) => {
        value = data;
      },
      first.isCurrent,
    );
    const latest = reads.begin('detail');
    const b = loadAndApply(
      () => latest.request('/new', schema),
      (data) => {
        value = data;
      },
      latest.isCurrent,
    );
    expect(signals[0]?.aborted).toBe(true);
    pending[1]!.resolve('new');
    await b;
    pending[0]!.resolve('old');
    await a;
    expect(value).toBe('new');
    first.finish();
    expect(reads.pending).toBe(true);
    latest.finish();
    expect(reads.pending).toBe(false);
  });

  it('keeps independent resources live and ignores stale failure cleanup', async () => {
    const { reads, pending } = harness();
    const first = reads.begin('summary');
    const old = loadAndApply(
      () => first.request('/summary', schema),
      () => {},
      first.isCurrent,
    );
    const entries = reads.begin('entries');
    const latest = reads.begin('summary');
    pending[0]!.reject(new Error('old failure'));
    await old;
    expect(first.isCurrent()).toBe(false);
    first.finish();
    latest.finish();
    expect(entries.isCurrent()).toBe(true);
    expect(reads.pending).toBe(true);
    entries.finish();
    expect(reads.pending).toBe(false);
  });

  it('invalidates pending reads at session disposal without canceling dispatched mutations', async () => {
    const { reads, pending, signals } = harness();
    const read = reads.begin('bookings');
    let applied = false;
    const request = loadAndApply(
      () => read.request('/bookings', schema),
      () => {
        applied = true;
      },
      read.isCurrent,
    );
    const mutation = read.request('/bookings', schema, { method: 'POST' });
    reads.dispose();
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]).toBeUndefined();
    pending[0]!.resolve('old session');
    pending[1]!.resolve('saved');
    await request;
    expect(await mutation).toBe('saved');
    expect(applied).toBe(false);
    expect(reads.pending).toBe(false);
    const late = reads.begin('late refresh');
    expect(late.isCurrent()).toBe(false);
  });
});

describe('mutation completion generations', () => {
  it('keeps both dispatched writes alive but refreshes only the latest submit', async () => {
    const { reads, pending, signals } = harness();
    const refreshed: string[] = [];
    let feedback = '';
    const run = async (label: string) => {
      const operation = reads.begin('mutation');
      try {
        await refreshAfterMutation(
          () => operation.request('/save', schema, { method: 'POST' }),
          async () => {
            refreshed.push(label);
            return { ok: true };
          },
          operation.isFeedbackCurrent,
        );
        if (operation.isFeedbackCurrent()) feedback = label;
      } finally {
        if (operation.isCurrent()) operation.finish();
      }
    };
    const old = run('old');
    const latest = run('latest');
    expect(signals).toEqual([undefined, undefined]);
    pending[1]!.resolve('saved');
    await latest;
    pending[0]!.resolve('saved');
    await old;
    expect(refreshed).toEqual(['latest']);
    expect(feedback).toBe('latest');
    expect(reads.pending).toBe(false);
  });

  it('does not refresh or replace newer read feedback after an old write finishes', async () => {
    const { reads, pending } = harness();
    const operation = reads.begin('mutation');
    let refreshed = false;
    const saved = refreshAfterMutation(
      () => operation.request('/save', schema, { method: 'PATCH' }),
      async () => {
        refreshed = true;
        return { ok: true };
      },
      operation.isFeedbackCurrent,
    );
    const read = reads.begin('bookings');
    pending[0]!.resolve('saved');
    await saved;
    expect(operation.isFeedbackCurrent()).toBe(false);
    expect(refreshed).toBe(false);
    operation.finish();
    expect(read.isCurrent()).toBe(true);
    expect(reads.pending).toBe(true);
    read.finish();
  });

  it('allows its own refresh without superseding its feedback and blocks obsolete follow-up transport', async () => {
    const { reads, pending } = harness();
    const operation = reads.begin('mutation');
    const refresh = reads.begin('bookings', true);
    expect(operation.isFeedbackCurrent()).toBe(true);
    refresh.finish();
    expect(operation.isFeedbackCurrent()).toBe(true);
    const oldRoster = reads.begin('roster');
    reads.begin('roster');
    await expect(oldRoster.request('/obsolete-refresh', schema)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(pending).toHaveLength(0);
  });
});
