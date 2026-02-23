// Simple icon generator using sharp + png-to-ico
// Install dependencies first: npm install --save-dev sharp png-to-ico

const fs = require('fs');
const path = require('path');

async function main(){
  const sharp = require('sharp');
  const pngToIco = require('png-to-ico');
  const inPath = path.join(__dirname, '..', 'public', 'logo.svg');
  const outDir = path.join(__dirname, '..', 'public');
  const svg = fs.readFileSync(inPath);

  const sizes = [16,32,48,64,128,192,256,512];
  for (const s of sizes){
    const out = path.join(outDir, `icon-${s}.png`);
    await sharp(svg).resize(s, s).png().toFile(out);
    console.log('Wrote', out);
  }

  // apple touch
  await sharp(svg).resize(180,180).png().toFile(path.join(outDir,'apple-touch-icon.png'));

  // create favicon.ico from 16,32,48
  const inputs = [16,32,48].map(s => path.join(outDir, `icon-${s}.png`));
  const buffers = await Promise.all(inputs.map(p => fs.promises.readFile(p)));
  const icoBuf = await pngToIco(buffers);
  fs.writeFileSync(path.join(outDir,'favicon.ico'), icoBuf);
  console.log('Wrote favicon.ico');
}

main().catch(err=>{ console.error(err); process.exit(1); });
