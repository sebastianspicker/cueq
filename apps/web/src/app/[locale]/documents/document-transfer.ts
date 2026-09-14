import { DocumentMimeTypeSchema, UploadDocumentVersionQuerySchema } from '@cueq/contracts';

export function documentUploadRequest(documentId: string, expectedVersion: number, file: File) {
  const query = UploadDocumentVersionQuerySchema.parse({ expectedVersion });
  const mimeType = DocumentMimeTypeSchema.parse(file.type);
  if (file.size < 1 || file.size > 10 * 1024 * 1024) throw new Error('Invalid document size');
  return {
    path: `/v1/documents/${documentId}/versions?expectedVersion=${query.expectedVersion}`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': mimeType },
      body: file,
    } satisfies RequestInit,
  };
}
