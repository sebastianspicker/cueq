import type { PersonnelField, ProfileChangeRequest } from '@cueq/database';

export function profileReviewStatus(
  decision: 'APPROVE' | 'REJECT',
  request: Pick<ProfileChangeRequest, 'expectedRevision' | 'ownerSystemId'>,
  field: Pick<PersonnelField, 'revision' | 'ownerSystemId'> | null,
) {
  if (decision === 'REJECT') return 'REJECTED';
  if (
    (field?.revision ?? 0) !== request.expectedRevision ||
    (field?.ownerSystemId ?? null) !== request.ownerSystemId
  )
    return 'CONFLICT';
  return request.ownerSystemId ? 'PENDING_SYNC' : 'APPLIED';
}
