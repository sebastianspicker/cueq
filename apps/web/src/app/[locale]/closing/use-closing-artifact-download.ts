'use client';

import { useState } from 'react';
import type { useTranslations } from 'next-intl';
import type { ApiFetch } from '../../../lib/api-client';
import type { ClosingPeriod } from './closing-types';

type TranslationFn = ReturnType<typeof useTranslations>;

/** Downloads API-produced closing artifacts while keeping browser download state local. */
export function useArtifactDownload(
  t: TranslationFn,
  apiFetch: ApiFetch,
  period: ClosingPeriod | null,
) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadArtifact = async (runId: string) => {
    if (!period) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const response = await apiFetch(
        `/v1/closing-periods/${period.id}/export-runs/${runId}/artifact`,
      );
      if (!response.ok) throw new Error(t('requestFailed'));
      const artifact = await response.text();
      const filename =
        response.headers.get('content-disposition')?.match(/filename="([^"]+)"/u)?.[1] ??
        `payroll-export-${period.id}-${runId}.txt`;
      const blob = new Blob([artifact], {
        type: response.headers.get('content-type') ?? 'application/octet-stream',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(t('downloadArtifactReady'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('requestFailed'));
    } finally {
      setLoading(false);
    }
  };

  return { loading, message, error, downloadArtifact };
}
