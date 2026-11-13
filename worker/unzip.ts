// Reads one file out of a zip archive, inflating it with the platform's native decompressor.
export async function unzipFile(zip: Uint8Array<ArrayBuffer>, name: string): Promise<string | null> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end-of-central-directory record sits in the last 22 bytes, or before a trailing comment.
  const first = Math.max(0, zip.length - 22 - 0xffff);
  let end = zip.length - 22;
  while (end >= first && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < first) return null;
  const entries = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const text = new TextDecoder();
  for (let i = 0; i < entries; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) return null;
    const nameLength = view.getUint16(at + 28, true);
    if (text.decode(zip.subarray(at + 46, at + 46 + nameLength)) === name) {
      const method = view.getUint16(at + 10, true);
      const size = view.getUint32(at + 20, true);
      const header = view.getUint32(at + 42, true);
      const start = header + 30 + view.getUint16(header + 26, true) + view.getUint16(header + 28, true);
      const data = zip.subarray(start, start + size);
      if (method === 0) return text.decode(data);
      if (method !== 8) return null;
      return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    }
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return null;
}
