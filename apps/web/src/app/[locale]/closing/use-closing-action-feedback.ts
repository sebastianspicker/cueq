import { useCallback, useState } from 'react';
import type { RefreshResult } from '../../../lib/mutation-refresh';
import { refreshAfterMutation } from '../../../lib/mutation-refresh';
import type { TranslationFn } from './closing-types';

type ReloadClosingPeriods = (preserveFeedback?: boolean) => Promise<RefreshResult>;

/** Owns mutation feedback so closing actions share one write-then-refresh lifecycle. */
export function useClosingActionFeedback(t: TranslationFn, reload: ReloadClosingPeriods) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSavedAction = useCallback(
    async (
      mutate: () => Promise<unknown>,
      successMessage: string,
      onMutationResult?: (result: unknown) => void,
      clearMessage = true,
    ) => {
      setLoading(true);
      if (clearMessage) setMessage(null);
      setError(null);
      try {
        const refresh = await refreshAfterMutation(
          async () => {
            const result = await mutate();
            onMutationResult?.(result);
          },
          () => reload(true),
        );
        if (refresh.ok) {
          setMessage(successMessage);
        } else {
          setError(t('savedRefreshFailed'));
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t('requestFailed'));
      } finally {
        setLoading(false);
      }
    },
    [reload, t],
  );

  return { loading, message, error, setLoading, setMessage, setError, runSavedAction };
}
