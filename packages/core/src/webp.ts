import type { ValidationResult } from "./result.js";
import { validationFailure } from "./result.js";

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

export function readWebpDimensions(
  bytes: Uint8Array,
): ValidationResult<ImageDimensions> {
  if (bytes.byteLength < 20) {
    return validationFailure("webp.truncated", "WebP data is truncated");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(bytes, 0, 4) !== "RIFF") {
    return validationFailure("webp.invalid_riff", "Missing RIFF signature");
  }
  if (readAscii(bytes, 8, 4) !== "WEBP") {
    return validationFailure(
      "webp.invalid_signature",
      "Missing WEBP signature",
    );
  }

  const declaredLength = view.getUint32(4, true) + 8;
  if (declaredLength < 20 || declaredLength > bytes.byteLength) {
    return validationFailure(
      "webp.truncated",
      "WebP data is shorter than its RIFF length",
    );
  }

  const chunkLength = view.getUint32(16, true);
  if (chunkLength > declaredLength - 20) {
    return validationFailure("webp.truncated", "WebP image chunk is truncated");
  }

  const chunkType = readAscii(bytes, 12, 4);
  switch (chunkType) {
    case "VP8 ":
      return readVp8Dimensions(view, chunkLength);
    case "VP8L":
      return readVp8lDimensions(view, chunkLength);
    case "VP8X":
      return readVp8xDimensions(view, chunkLength);
    default:
      return validationFailure(
        "webp.unsupported_chunk",
        `Unsupported WebP image chunk ${JSON.stringify(chunkType)}`,
      );
  }
}

function readVp8Dimensions(
  view: DataView,
  chunkLength: number,
): ValidationResult<ImageDimensions> {
  if (chunkLength < 10) {
    return validationFailure("webp.truncated", "VP8 frame header is truncated");
  }
  if (
    view.getUint8(23) !== 0x9d ||
    view.getUint8(24) !== 0x01 ||
    view.getUint8(25) !== 0x2a
  ) {
    return validationFailure(
      "webp.invalid_vp8_header",
      "VP8 key-frame marker is invalid",
    );
  }

  return validateDimensions(
    view.getUint16(26, true) & 0x3fff,
    view.getUint16(28, true) & 0x3fff,
  );
}

function readVp8lDimensions(
  view: DataView,
  chunkLength: number,
): ValidationResult<ImageDimensions> {
  if (chunkLength < 5) {
    return validationFailure(
      "webp.truncated",
      "VP8L frame header is truncated",
    );
  }
  if (view.getUint8(20) !== 0x2f) {
    return validationFailure(
      "webp.invalid_vp8l_header",
      "VP8L signature byte is invalid",
    );
  }

  const packed = view.getUint32(21, true);
  if (packed >>> 29 !== 0) {
    return validationFailure(
      "webp.invalid_vp8l_header",
      "VP8L version bits are unsupported",
    );
  }

  return validateDimensions(
    (packed & 0x3fff) + 1,
    ((packed >>> 14) & 0x3fff) + 1,
  );
}

function readVp8xDimensions(
  view: DataView,
  chunkLength: number,
): ValidationResult<ImageDimensions> {
  if (chunkLength < 10) {
    return validationFailure(
      "webp.truncated",
      "VP8X frame header is truncated",
    );
  }
  if (
    view.getUint8(21) !== 0 ||
    view.getUint8(22) !== 0 ||
    view.getUint8(23) !== 0
  ) {
    return validationFailure(
      "webp.invalid_vp8x_header",
      "VP8X reserved bytes must be zero",
    );
  }

  return validateDimensions(readUint24(view, 24) + 1, readUint24(view, 27) + 1);
}

function validateDimensions(
  width: number,
  height: number,
): ValidationResult<ImageDimensions> {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    return validationFailure(
      "webp.invalid_dimensions",
      "WebP dimensions are not safe integers",
    );
  }
  if (width <= 0 || height <= 0) {
    return validationFailure(
      "webp.invalid_dimensions",
      "WebP dimensions must be positive",
    );
  }
  return { ok: true, value: { width, height } };
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  let value = "";
  for (let index = offset; index < offset + length; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

function readUint24(view: DataView, offset: number): number {
  return (
    view.getUint8(offset) |
    (view.getUint8(offset + 1) << 8) |
    (view.getUint8(offset + 2) << 16)
  );
}
