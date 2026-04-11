const TRUNCATED_SUFFIX = '...[truncated]';

export async function readResponseBodyWithLimit(
  response: Response,
  maxChars: number,
): Promise<string> {
  if (maxChars <= 0) {
    return '';
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return '';
  }

  const decoder = new TextDecoder();
  let text = '';
  let truncated = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value || value.length === 0) {
        continue;
      }

      const decodedChunk = decoder.decode(value, { stream: true });
      if (!decodedChunk) {
        continue;
      }

      const remaining = maxChars - text.length;
      if (remaining <= 0) {
        truncated = true;
        await reader.cancel();
        break;
      }

      if (decodedChunk.length > remaining) {
        text += decodedChunk.slice(0, remaining);
        truncated = true;
        await reader.cancel();
        break;
      }

      text += decodedChunk;
    }

    const flushChunk = decoder.decode();
    if (flushChunk) {
      const remaining = maxChars - text.length;
      if (remaining <= 0) {
        truncated = true;
      } else if (flushChunk.length > remaining) {
        text += flushChunk.slice(0, remaining);
        truncated = true;
      } else {
        text += flushChunk;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return truncated ? `${text}${TRUNCATED_SUFFIX}` : text;
}
