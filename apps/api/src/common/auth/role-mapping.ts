import { Role } from '@cueq/database';

const ROLE_MAP = new Map<string, Role>([
  ['employee', Role.EMPLOYEE],
  ['team_lead', Role.TEAM_LEAD],
  ['shift_planner', Role.SHIFT_PLANNER],
  ['hr', Role.HR],
  ['payroll', Role.PAYROLL],
  ['admin', Role.ADMIN],
  ['data_protection', Role.DATA_PROTECTION],
  ['works_council', Role.WORKS_COUNCIL],
]);

const ROLE_PRIORITY: Record<Role, number> = {
  [Role.EMPLOYEE]: 10,
  [Role.WORKS_COUNCIL]: 20,
  [Role.DATA_PROTECTION]: 30,
  [Role.PAYROLL]: 40,
  [Role.TEAM_LEAD]: 50,
  [Role.SHIFT_PLANNER]: 60,
  [Role.HR]: 70,
  [Role.ADMIN]: 80,
};

function normalizeRoleClaim(input: unknown): string {
  return String(input ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

export function parseRoleClaim(input: unknown): Role | null {
  const normalized = normalizeRoleClaim(input);
  return ROLE_MAP.get(normalized) ?? null;
}

export function selectHighestRoleClaim(inputs: unknown[]): Role | null {
  let selected: Role | null = null;
  let bestPriority = Number.NEGATIVE_INFINITY;

  for (const input of inputs) {
    const parsed = parseRoleClaim(input);
    if (!parsed) {
      continue;
    }

    const priority = ROLE_PRIORITY[parsed];
    if (priority > bestPriority) {
      selected = parsed;
      bestPriority = priority;
    }
  }

  return selected;
}
