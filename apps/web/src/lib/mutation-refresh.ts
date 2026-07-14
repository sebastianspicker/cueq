export type RefreshResult =
  | { ok: true }
  | {
      ok: false;
      cause: unknown;
    };

export async function refreshAfterMutation(
  mutate: () => Promise<unknown>,
  refresh: () => Promise<RefreshResult>,
): Promise<RefreshResult> {
  await mutate();
  return refresh();
}
