export type RefreshResult =
  | { ok: true }
  | {
      ok: false;
      cause: unknown;
    };

export async function loadAndApply<T>(
  request: () => Promise<T>,
  apply: (data: T) => void,
  isCurrent: () => boolean = () => true,
): Promise<RefreshResult> {
  try {
    const data = await request();
    if (isCurrent()) apply(data);
    return { ok: true };
  } catch (cause) {
    return { ok: false, cause };
  }
}

export async function refreshAfterMutation(
  mutate: () => Promise<unknown>,
  refresh: () => Promise<RefreshResult>,
  isCurrent: () => boolean = () => true,
): Promise<RefreshResult> {
  await mutate();
  return isCurrent() ? refresh() : { ok: true };
}
