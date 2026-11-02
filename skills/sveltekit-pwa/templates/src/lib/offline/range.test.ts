import { describe, expect, it } from 'vitest';
import { parseRange, rangeResponse } from './range.ts';

describe('parseRange', () => {
  it('reads closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
  });

  it('reads the iOS form bytes=0-* as an open range', () => {
    expect(parseRange('bytes=0-*', 100)).toEqual({ start: 0, end: 99 });
  });

  it('rejects ranges that cannot be satisfied', () => {
    expect(parseRange('bytes=100-', 100)).toBeNull();
    expect(parseRange('bytes=-', 100)).toBeNull();
    expect(parseRange('items=0-1', 100)).toBeNull();
  });
});

describe('rangeResponse', () => {
  const stored = () => new Response('0123456789', { headers: { 'Content-Type': 'audio/mpeg' } });

  it('answers 206 with the slice and Content-Range', async () => {
    const response = await rangeResponse(stored(), 'bytes=2-4');
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Range')).toBe('bytes 2-4/10');
    expect(await response.text()).toBe('234');
  });

  it('answers 416 for a range past the end', async () => {
    const response = await rangeResponse(stored(), 'bytes=20-');
    expect(response.status).toBe(416);
    expect(response.headers.get('Content-Range')).toBe('bytes */10');
  });
});
