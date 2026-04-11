import { describe, expect, it } from 'vitest';
import { evaluateOnCallRestCompliance } from '..';
import type { RestRule } from '@cueq/policy';
import { DEFAULT_REST_RULE } from '@cueq/policy';

const BASE_INPUT = {
  rotationStart: '2026-03-12T16:00:00.000Z',
  rotationEnd: '2026-03-19T08:00:00.000Z',
  deployments: [] as Array<{ start: string; end: string }>,
  nextShiftStart: '2026-03-14T14:00:00.000Z',
};

describe('evaluateOnCallRestCompliance – edge cases', () => {
  describe('empty deployments', () => {
    it('returns compliant with zero restHoursAfterDeployment', () => {
      const result = evaluateOnCallRestCompliance({ ...BASE_INPUT, deployments: [] });
      expect(result.compliant).toBe(true);
      expect(result.restHoursAfterDeployment).toBe(0);
      expect(result.minimumRestHours).toBe(11);
      expect(result.violations).toEqual([]);
    });
  });

  describe('single deployment', () => {
    it('compliant when rest exceeds minimum', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T02:00:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // 02:00 to 14:00 = 12h rest
      expect(result.restHoursAfterDeployment).toBe(12);
      expect(result.compliant).toBe(true);
    });

    it('non-compliant when rest is under minimum', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T04:00:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // 04:00 to 14:00 = 10h rest
      expect(result.restHoursAfterDeployment).toBe(10);
      expect(result.compliant).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]!.code).toBe('ONCALL_REST_DEFICIT');
    });
  });

  describe('boundary: exactly at minimum rest', () => {
    it('compliant when rest is exactly 11h', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T03:00:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // 03:00 to 14:00 = 11h
      expect(result.restHoursAfterDeployment).toBe(11);
      expect(result.compliant).toBe(true);
    });

    it('non-compliant when rest is 10.99h', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T03:01:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // 03:01 to 14:00 = 10h59m = 10.98h
      expect(result.restHoursAfterDeployment).toBe(10.98);
      expect(result.compliant).toBe(false);
    });
  });

  describe('multiple deployments', () => {
    it('uses the deployment with the latest end time', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [
          { start: '2026-03-13T22:00:00.000Z', end: '2026-03-13T23:00:00.000Z' },
          { start: '2026-03-14T02:00:00.000Z', end: '2026-03-14T04:00:00.000Z' }, // latest end
          { start: '2026-03-14T00:00:00.000Z', end: '2026-03-14T01:00:00.000Z' },
        ],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // Last deployment ends at 04:00, next shift at 14:00 = 10h
      expect(result.restHoursAfterDeployment).toBe(10);
      expect(result.compliant).toBe(false);
    });

    it('compliant when last deployment has sufficient gap', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [
          { start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T02:00:00.000Z' },
          { start: '2026-03-13T22:00:00.000Z', end: '2026-03-13T23:30:00.000Z' },
        ],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // Latest end is 02:00, gap to 14:00 = 12h
      expect(result.restHoursAfterDeployment).toBe(12);
      expect(result.compliant).toBe(true);
    });
  });

  describe('extreme gaps', () => {
    it('zero rest: deployment end equals next shift start', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T12:00:00.000Z', end: '2026-03-14T14:00:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      expect(result.restHoursAfterDeployment).toBe(0);
      expect(result.compliant).toBe(false);
    });

    it('negative rest: next shift starts before deployment ends', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T12:00:00.000Z', end: '2026-03-14T15:00:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // 15:00 to 14:00 = -1h
      expect(result.restHoursAfterDeployment).toBe(-1);
      expect(result.compliant).toBe(false);
    });
  });

  describe('custom rest rule with on-call reduction', () => {
    it('uses reduced minimum when on-call reduction is enabled', () => {
      const customRule: RestRule = {
        ...DEFAULT_REST_RULE,
        minRestHours: 11,
        onCallRestReduction: {
          enabled: true,
          minRestHoursAfterDeployment: 9,
        },
      };
      const result = evaluateOnCallRestCompliance(
        {
          ...BASE_INPUT,
          deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T04:30:00.000Z' }],
          nextShiftStart: '2026-03-14T14:00:00.000Z',
        },
        { restRule: customRule },
      );
      // 04:30 to 14:00 = 9.5h, minimum is 9h (reduced)
      expect(result.minimumRestHours).toBe(9);
      expect(result.restHoursAfterDeployment).toBe(9.5);
      expect(result.compliant).toBe(true);
    });

    it('falls back to standard minRestHours when on-call reduction is disabled', () => {
      const customRule: RestRule = {
        ...DEFAULT_REST_RULE,
        minRestHours: 11,
        onCallRestReduction: {
          enabled: false,
          minRestHoursAfterDeployment: 9,
        },
      };
      const result = evaluateOnCallRestCompliance(
        {
          ...BASE_INPUT,
          deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T04:30:00.000Z' }],
          nextShiftStart: '2026-03-14T14:00:00.000Z',
        },
        { restRule: customRule },
      );
      // Reduction disabled → uses minRestHours (11)
      expect(result.minimumRestHours).toBe(11);
      expect(result.restHoursAfterDeployment).toBe(9.5);
      expect(result.compliant).toBe(false);
    });

    it('uses standard minRestHours when onCallRestReduction is undefined', () => {
      const customRule: RestRule = {
        ...DEFAULT_REST_RULE,
        minRestHours: 11,
        onCallRestReduction: undefined,
      };
      const result = evaluateOnCallRestCompliance(
        {
          ...BASE_INPUT,
          deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T04:00:00.000Z' }],
          nextShiftStart: '2026-03-14T14:00:00.000Z',
        },
        { restRule: customRule },
      );
      expect(result.minimumRestHours).toBe(11);
    });
  });

  describe('overlapping deployments', () => {
    it('correctly selects latest end even when deployments overlap', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [
          { start: '2026-03-14T00:00:00.000Z', end: '2026-03-14T03:00:00.000Z' },
          { start: '2026-03-14T02:00:00.000Z', end: '2026-03-14T04:00:00.000Z' },
        ],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // Latest end is 04:00, gap to 14:00 = 10h → non-compliant
      expect(result.restHoursAfterDeployment).toBe(10);
      expect(result.compliant).toBe(false);
    });
  });

  describe('DST transitions', () => {
    it('rest measured in UTC hours, unaffected by spring-forward', () => {
      // Deployment ends just before DST on 2026-03-29 (02:00 CET → 03:00 CEST)
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-29T00:00:00.000Z', end: '2026-03-29T01:00:00.000Z' }],
        nextShiftStart: '2026-03-29T12:00:00.000Z',
      });
      // 01:00 UTC to 12:00 UTC = 11h rest (UTC-based, DST irrelevant)
      expect(result.restHoursAfterDeployment).toBe(11);
      expect(result.compliant).toBe(true);
    });

    it('rest measured in UTC hours, unaffected by fall-back', () => {
      // 2026-10-25 is DST fall-back in Europe/Berlin (03:00 CEST → 02:00 CET)
      // Deployment ends at 01:00 UTC = 03:00 CEST (before transition)
      // Next shift at 12:00 UTC = 13:00 CET (after transition)
      // Despite local clocks "gaining" an hour, UTC gap is 11h
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-10-25T00:00:00.000Z', end: '2026-10-25T01:00:00.000Z' }],
        nextShiftStart: '2026-10-25T12:00:00.000Z',
      });
      expect(result.restHoursAfterDeployment).toBe(11);
      expect(result.compliant).toBe(true);
    });
  });

  describe('very short deployment', () => {
    it('handles a 1-minute deployment', () => {
      const result = evaluateOnCallRestCompliance({
        ...BASE_INPUT,
        deployments: [{ start: '2026-03-14T02:00:00.000Z', end: '2026-03-14T02:01:00.000Z' }],
        nextShiftStart: '2026-03-14T14:00:00.000Z',
      });
      // 02:01 to 14:00 = 11h59m = 11.98h
      expect(result.restHoursAfterDeployment).toBe(11.98);
      expect(result.compliant).toBe(true);
    });
  });

  describe('on-call reduction at exact boundary', () => {
    it('compliant when rest exactly equals reduced minimum', () => {
      const customRule: RestRule = {
        ...DEFAULT_REST_RULE,
        minRestHours: 11,
        onCallRestReduction: {
          enabled: true,
          minRestHoursAfterDeployment: 9,
        },
      };
      const result = evaluateOnCallRestCompliance(
        {
          ...BASE_INPUT,
          deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T05:00:00.000Z' }],
          nextShiftStart: '2026-03-14T14:00:00.000Z',
        },
        { restRule: customRule },
      );
      // 05:00 to 14:00 = exactly 9h = exactly reduced minimum
      expect(result.restHoursAfterDeployment).toBe(9);
      expect(result.minimumRestHours).toBe(9);
      expect(result.compliant).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('non-compliant when rest is 1 minute under reduced minimum', () => {
      const customRule: RestRule = {
        ...DEFAULT_REST_RULE,
        minRestHours: 11,
        onCallRestReduction: {
          enabled: true,
          minRestHoursAfterDeployment: 9,
        },
      };
      const result = evaluateOnCallRestCompliance(
        {
          ...BASE_INPUT,
          deployments: [{ start: '2026-03-14T01:00:00.000Z', end: '2026-03-14T05:01:00.000Z' }],
          nextShiftStart: '2026-03-14T14:00:00.000Z',
        },
        { restRule: customRule },
      );
      // 05:01 to 14:00 = 8h59m = 8.98h < 9h
      expect(result.restHoursAfterDeployment).toBe(8.98);
      expect(result.minimumRestHours).toBe(9);
      expect(result.compliant).toBe(false);
      expect(result.violations).toHaveLength(1);
    });
  });

  describe('fixture parity', () => {
    it('matches it-oncall deployment rest fixture', () => {
      const result = evaluateOnCallRestCompliance({
        rotationStart: '2026-03-12T16:00:00Z',
        rotationEnd: '2026-03-19T08:00:00Z',
        deployments: [
          {
            start: '2026-03-14T01:10:00Z',
            end: '2026-03-14T02:20:00Z',
          },
        ],
        nextShiftStart: '2026-03-14T14:00:00Z',
      });
      expect(result.restHoursAfterDeployment).toBe(11.67);
      expect(result.minimumRestHours).toBe(11);
      expect(result.compliant).toBe(true);
      expect(result.violations).toEqual([]);
    });
  });
});
