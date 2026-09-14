import { assignmentRequestTarget } from '../../src/platform/http/assignment-target';
import { describe, expect, it } from 'vitest';
import { chooseAssignment } from '../../src/components/workspace/assignment-selection';
import { createAssignmentRequest } from '../../src/platform/http/assignment-request';
import { WorkspaceReadRequests } from '../../src/shared/workspace/read-requests';
import { refreshAfterMutation } from '../../src/shared/workspace/mutation-refresh';
import type { ApiRequest } from '../../src/platform/http/api-client';

const options = [
  { id: 'first', label: 'First appointment', active: true, legacy: true },
  { id: 'second', label: 'Second appointment', active: true, legacy: false },
];
const schema = { parse: (value: unknown) => String(value) };

describe('appointment selection', () => {
  it('retains each tab selection independently and rejects a foreign previous selection', () => {
    expect(chooseAssignment(options, 'first', null)).toBe('first');
    expect(chooseAssignment(options, 'second', null)).toBe('second');
    expect(chooseAssignment(options, 'foreign-session', null)).toBeNull();
  });
  it('selects only one active appointment from a complete list', () => {
    expect(chooseAssignment(options.slice(0, 1), null, 'more')).toBeNull();
    expect(chooseAssignment(options, null, null)).toBeNull();
    expect(chooseAssignment([], null, null)).toBeNull();
    expect(chooseAssignment([{ ...options[0]!, active: false }], null, null)).toBeNull();
    expect(chooseAssignment([options[0]!, { ...options[1]!, active: false }], null, null)).toBe(
      'first',
    );
  });
});

describe('appointment request boundaries', () => {
  it.each([
    '/v1/dashboard/me',
    '/v1/bookings/me?cursor=next',
    '/v1/absences/me',
    '/v1/leave-balance/me?year=2026',
    '/v1/oncall/rotations?cursor=next',
  ])('sends explicit appointment context for %s', (path) => {
    const target = assignmentRequestTarget(path, undefined, 'first', 'me');
    expect(new URL(target.path, 'https://test.invalid').searchParams.get('assignmentId')).toBe(
      'first',
    );
    expect(target.path.includes('cursor=next')).toBe(path.includes('cursor=next'));
    expect(() => assignmentRequestTarget(path, undefined, null, 'me')).toThrow(
      'ASSIGNMENT_REQUIRED',
    );
  });
  it.each([
    '/v1/me',
    '/v1/session/assignments',
    '/v1/policies',
    '/v1/rosters/current',
    '/v1/rosters/r/plan-vs-actual',
    '/v1/closing-periods',
  ])('preserves global/identity request %s', (path) => {
    expect(assignmentRequestTarget(path, undefined, 'first', 'me')).toEqual({
      path,
      init: undefined,
    });
  });
  it('separates the actor from a workflow subject and keeps nullable organization scope', () => {
    for (const assignmentId of ['target-appointment', undefined]) {
      const init = { method: 'POST', body: JSON.stringify({ assignmentId, action: 'APPROVE' }) };
      const target = assignmentRequestTarget(
        '/v1/workflows/workflow/decision',
        init,
        'actor-appointment',
        'me',
      );
      expect(target.path).toBe(
        '/v1/workflows/workflow/decision?actorAssignmentId=actor-appointment',
      );
      expect(target.init).toEqual(init);
    }
  });
  it('never inserts the actor appointment into another person’s mutation or compliance query', () => {
    const init = { method: 'POST', body: JSON.stringify({ personId: 'other' }) };
    expect(assignmentRequestTarget('/v1/oncall/rotations', init, 'actor', 'me').init).toEqual(init);
    expect(
      assignmentRequestTarget('/v1/oncall/compliance?personId=other', undefined, 'actor', 'me')
        .path,
    ).toBe('/v1/oncall/compliance?personId=other');
    const self = assignmentRequestTarget('/v1/bookings', { ...init, body: '{}' }, 'actor', 'me');
    expect(JSON.parse(String(self.init?.body))).toEqual({ assignmentId: 'actor' });
  });
  it('resolves an unseen record appointment instead of reusing the actor appointment', () => {
    const init = { method: 'POST', body: JSON.stringify({ bookingId: 'other-record' }) };
    expect(
      assignmentRequestTarget('/v1/workflows/booking-corrections', init, 'actor', 'me').init,
    ).toEqual(init);
  });
  it('keeps the shift assignment record ID separate from employment identity', () => {
    const target = assignmentRequestTarget(
      '/v1/rosters/r/shifts/s/assignments/shift-record?assignmentId=target',
      { method: 'DELETE' },
      'actor',
      'me',
    );
    expect(target.path).toBe('/v1/rosters/r/shifts/s/assignments/shift-record?assignmentId=target');
  });
  it('blocks missing context before dispatch with localized feedback', async () => {
    let dispatched = false;
    const request: ApiRequest = async (_path, response) => {
      dispatched = true;
      return response.parse('ok');
    };
    await expect(
      createAssignmentRequest(
        request,
        null,
        'me',
        'Choose appointment',
      )('/v1/bookings', schema, { method: 'POST' }),
    ).rejects.toThrow('Choose appointment');
    expect(dispatched).toBe(false);
  });
  it('preserves dispatched writes while appointment disposal prevents stale feedback and refresh', async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const paths: string[] = [];
    const request: ApiRequest = async (path, response, init) => {
      paths.push(path);
      expect(init?.signal).toBeUndefined();
      await pending;
      return response.parse('saved');
    };
    const reads = new WorkspaceReadRequests(
      createAssignmentRequest(request, 'first', 'me', 'required'),
    );
    const operation = reads.begin('mutation');
    let refreshed = false;
    const result = refreshAfterMutation(
      () => operation.request('/v1/bookings', schema, { method: 'POST' }),
      async () => {
        refreshed = true;
        return { ok: true };
      },
      operation.isCurrent,
    );
    reads.dispose();
    finish();
    await result;
    expect(operation.isCurrent()).toBe(false);
    expect(refreshed).toBe(false);
    expect(paths).toEqual(['/v1/bookings']);
  });
});
