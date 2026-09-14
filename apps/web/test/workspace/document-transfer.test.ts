import { describe, expect, it } from 'vitest';
import { documentUploadRequest } from '../../src/app/[locale]/documents/document-transfer';
import { nativeFailure } from '../../src/shared/native-hr/use-native-resource';
import { ApiRequestError } from '../../src/platform/http/api-client';

describe('private document transfers', () => {
  it.each(['application/pdf', 'image/png', 'image/jpeg'])(
    'sends raw %s bytes with exact MIME and expected version',
    (mimeType) => {
      const file = new File(['synthetic bytes'], 'synthetic', { type: mimeType });
      const request = documentUploadRequest('document', 3, file);
      expect(request.path).toBe('/v1/documents/document/versions?expectedVersion=3');
      expect(request.init.body).toBe(file);
      expect(request.init.method).toBe('POST');
      expect(request.init.headers).toEqual({ 'Content-Type': mimeType });
      expect(request.init).not.toHaveProperty('signal');
    },
  );
  it('rejects unsupported, empty, or oversized files before sending', () => {
    expect(() =>
      documentUploadRequest('document', 0, new File(['x'], 'file.html', { type: 'text/html' })),
    ).toThrow();
    expect(() =>
      documentUploadRequest('document', 0, new File([], 'empty.pdf', { type: 'application/pdf' })),
    ).toThrow();
    expect(() =>
      documentUploadRequest(
        'document',
        0,
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.pdf', { type: 'application/pdf' }),
      ),
    ).toThrow();
  });
  it('distinguishes unavailable document storage from permission denial', () => {
    expect(nativeFailure(new ApiRequestError(503, 'private configuration detail', null))).toBe(
      'unavailable',
    );
    expect(nativeFailure(new ApiRequestError(403, 'private authorization detail', null))).toBe(
      'restricted',
    );
  });
});
