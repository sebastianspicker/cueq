export interface AssignmentOption {
  id: string;
  label: string;
  legacy: boolean;
  active: boolean;
}

/** Never infer uniqueness from an incomplete page, or silently pick the first option. */
export function chooseAssignment(
  items: AssignmentOption[],
  selectedId: string | null,
  nextCursor: string | null,
): string | null {
  if (selectedId && items.some((item) => item.id === selectedId)) return selectedId;
  if (nextCursor) return null;
  const active = items.filter((item) => item.active);
  return active.length === 1 ? (active[0]?.id ?? null) : null;
}
