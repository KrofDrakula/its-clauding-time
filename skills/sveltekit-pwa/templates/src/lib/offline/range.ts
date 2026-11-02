// Answers a range request from a stored file, the small version of
// `workbox-range-requests`. Media elements seek with `Range` requests, and
// `Cache.match` returns the full body, so the worker slices it itself.

export type ByteRange = { start: number; end: number };

/**
 * Reads the first range of a `Range` header for a file of `size` bytes.
 * Returns `null` when the range cannot be satisfied. The parse is lenient:
 * iOS once sent `bytes=0-*`, which reads as `bytes=0-`.
 */
export function parseRange(header: string, size: number): ByteRange | null {
  const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)/i.exec(header);
  if (!match) return null;
  const [, first, last] = match;
  if (first === '' && last === '') return null;

  let start: number;
  let end: number;
  if (first === '') {
    // Suffix range: the last N bytes.
    const length = Number(last);
    if (length === 0) return null;
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(first);
    end = last === '' ? size - 1 : Math.min(size - 1, Number(last));
  }

  if (start >= size || start > end) return null;
  return { start, end };
}

/**
 * Slices a stored full response for a `Range` header: `206` with the part, or
 * `416` with `Content-Range: bytes *\/size`. It uses `blob()`, so a seek does
 * not copy the file into memory.
 */
export async function rangeResponse(stored: Response, header: string): Promise<Response> {
  const blob = await stored.blob();
  const size = blob.size;
  const range = parseRange(header, size);
  if (!range) {
    return new Response(null, {
      status: 416,
      statusText: 'Range Not Satisfiable',
      headers: { 'Content-Range': `bytes */${size}` }
    });
  }

  const part = blob.slice(range.start, range.end + 1);
  const headers = new Headers({
    'Content-Type': stored.headers.get('Content-Type') || blob.type || 'application/octet-stream',
    'Content-Length': String(part.size),
    'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
    'Accept-Ranges': 'bytes'
  });
  const modified = stored.headers.get('Last-Modified');
  if (modified) headers.set('Last-Modified', modified);

  return new Response(part, { status: 206, statusText: 'Partial Content', headers });
}
