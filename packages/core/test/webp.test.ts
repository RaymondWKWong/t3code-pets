import { describe, expect, it } from "vitest";

import { readWebpDimensions } from "../src/webp.js";

function riff(chunkType: string, payload: Uint8Array): Uint8Array {
  const paddedLength = payload.length + (payload.length % 2);
  const bytes = new Uint8Array(20 + paddedLength);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode(chunkType), 12);
  view.setUint32(16, payload.length, true);
  bytes.set(payload, 20);
  return bytes;
}

function vp8(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const view = new DataView(payload.buffer);
  payload.set([0x10, 0, 0, 0x9d, 0x01, 0x2a]);
  view.setUint16(6, width, true);
  view.setUint16(8, height, true);
  return riff("VP8 ", payload);
}

function vp8l(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(5);
  const packed = (width - 1) | ((height - 1) << 14);
  payload[0] = 0x2f;
  new DataView(payload.buffer).setUint32(1, packed, true);
  return riff("VP8L", payload);
}

function vp8x(width: number, height: number): Uint8Array {
  const payload = new Uint8Array(10);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  payload.set([
    0,
    0,
    0,
    0,
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ]);
  return riff("VP8X", payload);
}

describe("readWebpDimensions", () => {
  it.each([
    ["VP8", vp8(1536, 2288)],
    ["VP8L", vp8l(1536, 2288)],
    ["VP8X", vp8x(1536, 2288)],
  ])("reads %s dimensions without decoding pixels", (_kind, bytes) => {
    expect(readWebpDimensions(bytes)).toEqual({
      ok: true,
      value: { width: 1536, height: 2288 },
    });
  });

  it.each([
    ["truncated", new Uint8Array([0x52, 0x49, 0x46, 0x46])],
    ["not RIFF", new Uint8Array(30)],
    [
      "not WEBP",
      riff("NOPE", new Uint8Array(10)).map((byte, index) =>
        index === 8 ? 0 : byte,
      ),
    ],
    ["unsupported chunk", riff("JUNK", new Uint8Array(10))],
    ["invalid VP8 marker", riff("VP8 ", new Uint8Array(10))],
    ["invalid VP8L marker", riff("VP8L", new Uint8Array(5))],
  ])("returns a typed issue for %s data", (_name, bytes) => {
    const result = readWebpDimensions(bytes);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]).toEqual({
        code: expect.stringMatching(/^webp\./),
        path: "",
        message: expect.any(String),
      });
    }
  });
});
