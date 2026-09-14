const SCOPED_OPERATION =
  /^\/v1\/(dashboard\/me|bookings(?:\/|$)|absences(?:\/|$)|leave-balance\/me|leave-adjustments(?:\/|$)|oncall(?:\/|$)|workflows\/(?:booking-corrections|shift-swaps|overtime-approvals)$)/;
const ROSTER_ASSIGNMENT = /^\/v1\/rosters\/[^/]+\/shifts\/[^/]+\/assignments(?:\/|$)/;
const CLOSING_CORRECTION = /^\/v1\/closing-periods\/[^/]+\/corrections\/bookings$/;

function isWorkflowRecord(route: string) {
  return (
    /^\/v1\/workflows\/(?:inbox|[^/]+(?:\/decision)?)$/.test(route) &&
    !['booking-corrections', 'shift-swaps', 'overtime-approvals'].includes(
      route.split('/')[3] ?? '',
    )
  );
}

function targetContext(
  url: URL,
  body: Record<string, unknown>,
  assignmentId: string | null,
  personId: string | null,
) {
  const targetPerson = body.personId ?? body.fromPersonId ?? url.searchParams.get('personId');
  const otherPerson = Boolean(targetPerson && targetPerson !== personId);
  // Managers never supply their own appointment as another person's appointment.
  const targetAssignment =
    body.assignmentId ??
    url.searchParams.get('assignmentId') ??
    (otherPerson ? null : assignmentId);
  if (!targetAssignment && !otherPerson) throw new Error('ASSIGNMENT_REQUIRED');
  return targetAssignment;
}

function resolvesExistingRecord(route: string, method: string, body: Record<string, unknown>) {
  if (body.assignmentId) return false;
  return (
    (method === 'PATCH' && /^\/v1\/oncall\/rotations\/[^/]+$/.test(route)) ||
    (method === 'POST' && route === '/v1/workflows/booking-corrections')
  );
}

/** Narrow allowlist for existing operational features; organization reads stay whole. */
export function assignmentRequestTarget(
  path: string,
  init: RequestInit | undefined,
  assignmentId: string | null,
  personId: string | null,
): { path: string; init: RequestInit | undefined } {
  const url = new URL(path, 'https://cueq.invalid');
  const route = url.pathname;
  if (isWorkflowRecord(route)) {
    if (!assignmentId) throw new Error('ASSIGNMENT_REQUIRED');
    url.searchParams.set('actorAssignmentId', assignmentId);
    return { path: `${url.pathname}${url.search}`, init };
  }
  if (
    ![SCOPED_OPERATION, ROSTER_ASSIGNMENT, CLOSING_CORRECTION].some((pattern) =>
      pattern.test(route),
    )
  )
    return { path, init };
  const method = (init?.method ?? 'GET').toUpperCase();
  const body =
    typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
  // Existing record IDs resolve their own appointment when not loaded in this tab.
  if (resolvesExistingRecord(route, method, body)) return { path, init };
  const targetAssignment = targetContext(url, body, assignmentId, personId);
  if (!targetAssignment) return { path, init };
  if (method === 'GET' || method === 'DELETE') {
    url.searchParams.set('assignmentId', String(targetAssignment));
    return { path: `${url.pathname}${url.search}`, init };
  }
  return {
    path,
    init: { ...init, body: JSON.stringify({ ...body, assignmentId: targetAssignment }) },
  };
}
