// Icon + OG image generator using sharp + png-to-ico
// Install dependencies first: npm install --save-dev sharp png-to-ico

import { readFileSync, writeFileSync } from 'fs';
import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inPath = join(__dirname, '..', 'public', 'logo.svg');
const ogPath = join(__dirname, '..', 'public', 'og-image.svg');
const outDir = join(__dirname, '..', 'public');
const svg = readFileSync(inPath);

const sizes = [16, 32, 48, 64, 128, 192, 256, 512];
for (const s of sizes) {
  const out = join(outDir, `icon-${s}.png`);
  await sharp(svg).resize(s, s).png().toFile(out);
  console.log('Wrote', out);
}

// apple touch icon
await sharp(svg).resize(180, 180).png().toFile(join(outDir, 'apple-touch-icon.png'));
console.log('Wrote apple-touch-icon.png');

// favicon.ico from 16, 32, 48
const inputs = [16, 32, 48].map(s => join(outDir, `icon-${s}.png`));
const buffers = await Promise.all(inputs.map(p => readFile(p)));
const icoBuf = await pngToIco(buffers);
writeFileSync(join(outDir, 'favicon.ico'), icoBuf);
console.log('Wrote favicon.ico');

// og-image.png (1200x630) for Open Graph / Twitter Cards
const ogSvg = readFileSync(ogPath);
await sharp(ogSvg).resize(1200, 630).png().toFile(join(outDir, 'og-image.png'));
console.log('Wrote og-image.png');
