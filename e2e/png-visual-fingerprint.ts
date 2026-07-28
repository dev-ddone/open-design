import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

interface DecodedPng {
  width: number;
  height: number;
  rgb: Uint8Array;
}

function paethPredictor(left: number, above: number, upperLeft: number): number {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function decodePng(buffer: Buffer): DecodedPng {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error("Visual regression input is not a PNG");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const imageChunks: Buffer[] = [];

  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) throw new Error("Truncated PNG chunk");
    const data = buffer.subarray(dataStart, dataEnd);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      imageChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4;
  }

  if (!width || !height || imageChunks.length === 0) throw new Error("PNG has no image data");
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`Unsupported PNG format: depth=${bitDepth}, color=${colorType}, interlace=${interlace}`);
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = inflateSync(Buffer.concat(imageChunks));
  if (inflated.length !== height * (stride + 1)) throw new Error("Unexpected PNG scanline length");

  const rgb = new Uint8Array(width * height * 3);
  let previous = new Uint8Array(stride);
  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const row = new Uint8Array(stride);
    for (let index = 0; index < stride; index += 1) {
      const raw = inflated[sourceOffset + index];
      const left = index >= channels ? row[index - channels] : 0;
      const above = previous[index];
      const upperLeft = index >= channels ? previous[index - channels] : 0;
      const reconstructed = filter === 0
        ? raw
        : filter === 1
          ? raw + left
          : filter === 2
            ? raw + above
            : filter === 3
              ? raw + Math.floor((left + above) / 2)
              : filter === 4
                ? raw + paethPredictor(left, above, upperLeft)
                : Number.NaN;
      if (!Number.isFinite(reconstructed)) throw new Error(`Unsupported PNG filter ${filter}`);
      row[index] = reconstructed & 0xff;
    }
    sourceOffset += stride;
    for (let x = 0; x < width; x += 1) {
      const source = x * channels;
      const target = (y * width + x) * 3;
      rgb[target] = row[source];
      rgb[target + 1] = row[source + 1];
      rgb[target + 2] = row[source + 2];
    }
    previous = row;
  }
  return { width, height, rgb };
}

/**
 * Produces a deterministic visual fingerprint rather than hashing PNG bytes.
 * Each 32×32 block is averaged and quantized to four bits per RGB channel.
 * This catches meaningful layout/color regressions while ignoring isolated
 * sub-pixel antialiasing noise from Chromium and the PNG encoder.
 */
export function pngVisualFingerprint(buffer: Buffer): string {
  const { width, height, rgb } = decodePng(buffer);
  const grid = 32;
  const quantized = new Uint8Array(grid * grid * 3);
  let output = 0;

  for (let targetY = 0; targetY < grid; targetY += 1) {
    const startY = Math.floor((targetY * height) / grid);
    const endY = Math.max(startY + 1, Math.floor(((targetY + 1) * height) / grid));
    for (let targetX = 0; targetX < grid; targetX += 1) {
      const startX = Math.floor((targetX * width) / grid);
      const endX = Math.max(startX + 1, Math.floor(((targetX + 1) * width) / grid));
      let red = 0;
      let green = 0;
      let blue = 0;
      let count = 0;
      for (let y = startY; y < endY; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const pixel = (y * width + x) * 3;
          red += rgb[pixel];
          green += rgb[pixel + 1];
          blue += rgb[pixel + 2];
          count += 1;
        }
      }
      quantized[output++] = Math.floor(red / count) >> 4;
      quantized[output++] = Math.floor(green / count) >> 4;
      quantized[output++] = Math.floor(blue / count) >> 4;
    }
  }

  return createHash("sha256")
    .update("32x32:rgbq16")
    .update(quantized)
    .digest("hex");
}
