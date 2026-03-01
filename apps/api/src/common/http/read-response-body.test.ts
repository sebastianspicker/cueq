import { describe, expect, it } from 'vitest';
import { readResponseBodyWithLimit } from './read-response-body';

describe('readResponseBodyWithLimit', () => {
  it('returns full text when response body is within limit', async () => {
    const response = new Response('ok');
    await expect(readResponseBodyWithLimit(response, 10)).resolves.toBe('ok');
  });

  it('truncates large response bodies with marker', async () => {
    const response = new Response('abcdef');
    await expect(readResponseBodyWithLimit(response, 3)).resolves.toBe('abc...[truncated]');
  });

  it('returns empty string when response has no body', async () => {
    const response = new Response(null);
    await expect(readResponseBodyWithLimit(response, 10)).resolves.toBe('');
  });

  it('enforces max length when decoder flush emits trailing replacement characters', async () => {
    const truncatedUtf8 = new Uint8Array([0x61, 0xe2, 0x82]); // "a" + incomplete UTF-8 sequence
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(truncatedUtf8);
        controller.close();
      },
    });
    const response = new Response(stream);

    await expect(readResponseBodyWithLimit(response, 1)).resolves.toBe('a...[truncated]');
  });
});
