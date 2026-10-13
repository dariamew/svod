import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const directory = fileURLToPath(new URL('../public/brand/', import.meta.url));
await mkdir(directory, { recursive: true });
const trimmed = await sharp(directory + 'logo-source.png').trim().toBuffer();
await sharp(trimmed).resize(256, 256, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(directory + 'logo.png');
for (const size of [16, 32, 48, 180, 192, 512]) {
  const symbol = await sharp(trimmed).resize(Math.round(size * .8), Math.round(size * .8), { fit: 'inside' }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } }).composite([{ input: symbol, gravity: 'centre' }]).png().toFile(directory + `icon-${size}.png`);
}
const icon = await sharp(directory + 'icon-32.png').png().toBuffer();
const header = Buffer.alloc(22); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4); header[6] = 32; header[7] = 32; header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12); header.writeUInt32LE(icon.length, 14); header.writeUInt32LE(22, 18);
await writeFile(new URL('../public/favicon.ico', import.meta.url), Buffer.concat([header, icon]));
await sharp(directory + 'og-source.png').resize(1200, 630, { fit: 'cover' }).png().toFile(directory + 'og.png');
console.log('Brand assets prepared');
