/**
 * Safari (and older browsers) can't iterate a ReadableStream with `for await`,
 * which pdf.js relies on to read page text. Add the standard async iterator.
 */
type IterableStream = ReadableStream & { [Symbol.asyncIterator]?: unknown; values?: unknown };

const proto = typeof ReadableStream !== 'undefined' ? (ReadableStream.prototype as IterableStream) : null;
if (proto && typeof proto[Symbol.asyncIterator] !== 'function') {
  const values = async function* (this: ReadableStream, options?: { preventCancel?: boolean }) {
    const reader = this.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      if (!options?.preventCancel) await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  };
  Object.defineProperty(proto, 'values', { value: values, writable: true, configurable: true });
  Object.defineProperty(proto, Symbol.asyncIterator, { value: values, writable: true, configurable: true });
}
