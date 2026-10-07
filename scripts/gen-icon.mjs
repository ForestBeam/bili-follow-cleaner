import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets');
const SIZES = [16, 48, 128];
const SUPER = 4;
const BACKGROUND = [61, 126, 255];
const FOREGROUND = [255, 255, 255];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * size * 4, (y + 1) * size * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function insideRoundedSquare(x, y, size, inset, radius) {
  const min = inset;
  const max = size - inset;
  if (x < min || x > max || y < min || y > max) {
    return false;
  }
  const cx = Math.min(Math.max(x, min + radius), max - radius);
  const cy = Math.min(Math.max(y, min + radius), max - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lengthSquared = vx * vx + vy * vy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, (wx * vx + wy * vy) / lengthSquared));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function render(size) {
  const scale = size * SUPER;
  const inset = scale * 0.06;
  const radius = scale * 0.22;
  const stroke = scale * 0.09;
  const left = [scale * 0.27, scale * 0.53];
  const middle = [scale * 0.44, scale * 0.7];
  const right = [scale * 0.74, scale * 0.32];
  const rgba = Buffer.alloc(size * size * 4);
  const samples = SUPER * SUPER;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sy = 0; sy < SUPER; sy += 1) {
        for (let sx = 0; sx < SUPER; sx += 1) {
          const px = x * SUPER + sx + 0.5;
          const py = y * SUPER + sy + 0.5;
          if (!insideRoundedSquare(px, py, scale, inset, radius)) {
            continue;
          }
          const onCheck =
            Math.min(
              distanceToSegment(px, py, ...left, ...middle),
              distanceToSegment(px, py, ...middle, ...right),
            ) <= stroke / 2;
          const color = onCheck ? FOREGROUND : BACKGROUND;
          red += color[0];
          green += color[1];
          blue += color[2];
          alpha += 255;
        }
      }
      const offset = (y * size + x) * 4;
      rgba[offset] = Math.round(red / samples);
      rgba[offset + 1] = Math.round(green / samples);
      rgba[offset + 2] = Math.round(blue / samples);
      rgba[offset + 3] = Math.round(alpha / samples);
    }
  }

  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of SIZES) {
  const file = join(OUT_DIR, `icon${size}.png`);
  writeFileSync(file, render(size));
  console.log(`[icon] ${file}`);
}
