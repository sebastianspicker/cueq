'use client';

import type { PersonnelDocumentVersion } from '@cueq/contracts';
import { useNativeDownload } from '../../../shared/native-hr/use-native-download';

export function useDocumentDownload() {
  const transfer = useNativeDownload();
  return {
    ...transfer,
    download: (documentId: string, version: PersonnelDocumentVersion) => {
      const extension = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }[
        version.mimeType
      ];
      return transfer.download(
        `/v1/documents/${documentId}/versions/${version.id}/content`,
        `document-${documentId}-v${version.version}.${extension}`,
      );
    },
  };
}
