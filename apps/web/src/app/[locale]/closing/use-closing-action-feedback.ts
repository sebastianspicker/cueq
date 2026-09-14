import { useCallback, useState } from 'react';
import type { WorkspaceReadRequests } from '../../../shared/workspace/read-requests';
import type { RefreshResult } from '../../../shared/workspace/mutation-refresh';
import { refreshAfterMutation } from '../../../shared/workspace/mutation-refresh';
import type { TranslationFn } from './closing-types';

type ReloadClosingPeriods = (preserveFeedback?: boolean) => Promise<RefreshResult>;

export function useClosingActionFeedback(
  t: TranslationFn,
  reload: ReloadClosingPeriods,
  reads: WorkspaceReadRequests,
) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSavedAction = useCallback(
    async (
      mutate: () => Promise<unknown>,
      successMessage: string,
      onMutationResult?: (result: unknown) => void,
      clearMessage = true,
      refreshAfterSave = true,
    ) => {
      const operation = reads.begin('mutation');
      setLoading(true);
      if (clearMessage) setMessage(null);
      setError(null);
      try {
        const refresh = await refreshAfterMutation(
          async () => {
            const result = await mutate();
            if (operation.isFeedbackCurrent()) onMutationResult?.(result);
          },
          () => (refreshAfterSave ? reload(true) : Promise.resolve({ ok: true })),
          operation.isFeedbackCurrent,
        );
        if (!operation.isFeedbackCurrent()) return;
        if (refresh.ok) {
          setMessage(successMessage);
        } else {
          setError(t('savedRefreshFailed'));
        }
      } catch (cause) {
        if (!operation.isFeedbackCurrent()) return;
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      } finally {
        if (operation.isCurrent()) {
          operation.finish();
          setLoading(false);
        }
      }
    },
    [reads, reload, t],
  );

  return { loading, message, error, setLoading, setMessage, setError, runSavedAction };
}
