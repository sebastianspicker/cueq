'use client';

import { useEffect } from 'react';

export function useOrganizationUnitScope(
  role: string | undefined,
  profileOrganizationUnitId: string | undefined,
  setOrganizationUnitId: (value: string) => void,
) {
  useEffect(() => {
    if (role === 'TEAM_LEAD' && profileOrganizationUnitId) {
      setOrganizationUnitId(profileOrganizationUnitId);
    }
  }, [profileOrganizationUnitId, role, setOrganizationUnitId]);
}
