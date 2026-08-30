export type RefreshResult =
  | { ok: true }
  | {
      ok: false;
      cause: unknown;
    };

export async function loadAndApply<T>(
  request: () => Promise<T>,
  apply: (data: T) => void,
): Promise<RefreshResult> {
  try {
    apply(await request());
    return { ok: true };
  } catch (cause) {
    return { ok: false, cause };
  }
}

export async function refreshAfterMutation(
  mutate: () => Promise<unknown>,
  refresh: () => Promise<RefreshResult>,
): Promise<RefreshResult> {
  await mutate();
  return refresh();
}
