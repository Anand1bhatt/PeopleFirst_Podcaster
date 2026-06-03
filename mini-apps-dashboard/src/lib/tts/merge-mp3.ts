/**
 * Concatenate MP3 buffers without clipping word boundaries.
 * Naive Buffer.concat drops frame tails / replays ID3 on each segment — browsers often glitch at joins.
 */

/** Skip ID3v2 tag and advance to the first MPEG audio sync word. */
export function mp3AudioStartOffset(buf: Buffer): number {
  let offset = 0;
  if (buf.length >= 10 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) {
    const size =
      ((buf[6] & 0x7f) << 21) |
      ((buf[7] & 0x7f) << 14) |
      ((buf[8] & 0x7f) << 7) |
      (buf[9] & 0x7f);
    offset = 10 + size;
  }
  while (offset + 1 < buf.length) {
    if (buf[offset] === 0xff && (buf[offset + 1]! & 0xe0) === 0xe0) {
      return offset;
    }
    offset += 1;
  }
  return 0;
}

/** Join MP3 segments: keep first chunk intact, strip metadata from the rest. */
export function mergeMp3Buffers(chunks: Buffer[]): Buffer {
  if (!chunks.length) return Buffer.alloc(0);
  const parts: Buffer[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (!chunk.byteLength) continue;
    if (i === 0) {
      parts.push(chunk);
      continue;
    }
    const start = mp3AudioStartOffset(chunk);
    parts.push(start > 0 ? chunk.subarray(start) : chunk);
  }
  return Buffer.concat(parts);
}
