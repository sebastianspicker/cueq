/** Mutation helper contract that keeps post-write refresh failures visible to workspace state. */
export type RefreshResult =
  | { ok: true }
  | {
      ok: false;
      cause: unknown;
    };

/** Resolves a read and applies its data while preserving either failure for caller-specific feedback. */
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

/** Runs a mutation before its refresh, preserving a refresh failure for caller-specific feedback. */
export async function refreshAfterMutation(
  mutate: () => Promise<unknown>,
  refresh: () => Promise<RefreshResult>,
): Promise<RefreshResult> {
  await mutate();
  return refresh();
}
