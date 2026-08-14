import type { SurchargeCategory } from '@cueq/policy';
import {
  isWithinWindow,
  isWorkIntervalType,
  localMinuteInfo,
  parseLocalTimeToMinute,
  selectSurchargeCategory,
} from '../surcharge.js';

export {
  isWithinWindow,
  isWorkIntervalType,
  localMinuteInfo,
  parseLocalTimeToMinute,
  selectSurchargeCategory,
};

// Night window: 20:00 (1200) -> 06:00 (360): crosses midnight
export const nightStart = 1200; // 20:00
export const nightEnd = 360; // 06:00

export const berlinFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export const configByCategory = new Map<SurchargeCategory, { priority: number }>([
  ['NIGHT', { priority: 100 }],
  ['WEEKEND', { priority: 200 }],
  ['HOLIDAY', { priority: 300 }],
]);
