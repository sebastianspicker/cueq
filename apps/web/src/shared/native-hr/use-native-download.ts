'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useApiContext } from '../../platform/http/api-context';
import { ApiRequestError, type ApiRequest } from '../../platform/http/api-client';
import { useReadRequests } from '../workspace/use-read-requests';
import { nativeFailure } from './use-native-resource';

const ResponseSchema = {
  parse: (value: unknown) => {
    if (!(value instanceof Response)) throw new Error('Invalid download response');
    return value;
  },
};
export function useNativeDownload() {
  const t = useTranslations('pages.nativeHr');
  const { apiFetch } = useApiContext();
  const request = useMemo<ApiRequest>(
    () => async (path, schema, init) => schema.parse(await apiFetch(path, init)),
    [apiFetch],
  );
  const reads = useReadRequests(request);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download(path: string, filename: string) {
    const read = reads.begin('document-content');
    setLoading(true);
    setError(null);
    try {
      const response = await read.request(path, ResponseSchema);
      if (!response.ok) throw new ApiRequestError(response.status, 'Download failed', null);
      const blob = await response.blob();
      if (!read.isCurrent()) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      if (read.isCurrent()) setError(t(nativeFailure(cause)));
    } finally {
      if (read.isCurrent()) {
        read.finish();
        setLoading(false);
      }
    }
  }
  return { download, loading, error };
}
