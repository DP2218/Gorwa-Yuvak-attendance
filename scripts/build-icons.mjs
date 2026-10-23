import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

async function buildIcons() {
  const sourcePath = 'public/yuvak-icons/icon-512.png';
  if (!fs.existsSync(sourcePath)) {
    console.error('Source icon not found at', sourcePath);
    process.exit(1);
  }

  console.log('Extracting emblem from', sourcePath);

  // Emblem bounds in original 512x512 are roughly minX: 84, maxX: 438, minY: 60, maxY: 451
  // We extract a tight rectangle: left 78, top 52, width 368, height 404
  const emblemRaw = await sharp(sourcePath)
    .extract({ left: 78, top: 52, width: 368, height: 404 })
    .toBuffer();

  // Create crisp white circular badge on a 512x512 canvas with transparent corners
  // Circle radius 248 (centered at 256, 256)
  const circleSvg = `
    <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
      <circle cx="256" cy="256" r="248" fill="#ffffff" />
    </svg>
  `;

  // Scale the emblem to fill the circle beautifully (width 430, height 430)
  const emblemOnCircle = await sharp(emblemRaw)
    .resize(430, 430, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  const baseCircle = await sharp(Buffer.from(circleSvg))
    .png()
    .toBuffer();

  // Master 512x512 circular icon: transparent background, white circular badge, full emblem
  const master512 = await sharp(baseCircle)
    .composite([{ input: emblemOnCircle, left: 41, top: 41 }])
    .png()
    .toBuffer();

  // Also create a maskable icon (has safe-zone margin for Android adaptive icons)
  // Android maskable recommends key content within the central 80% circle
  const maskableEmblem = await sharp(emblemRaw)
    .resize(360, 360, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .toBuffer();

  const maskable512 = await sharp({
    create: {
      width: 512,
      height: 512,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: maskableEmblem, left: 76, top: 76 }])
    .png()
    .toBuffer();

  // Generate target sizes:
  const icon512Buf = master512;
  const icon192Buf = await sharp(master512).resize(192, 192).png().toBuffer();
  const appleTouchBuf = await sharp(master512).resize(180, 180).png().toBuffer();
  const fav48Buf = await sharp(master512).resize(48, 48).png().toBuffer();
  const fav32Buf = await sharp(master512).resize(32, 32).png().toBuffer();
  const fav16Buf = await sharp(master512).resize(16, 16).png().toBuffer();

  // Write PNG files to /public
  fs.writeFileSync('public/icon-512.png', icon512Buf);
  fs.writeFileSync('public/icon-maskable-512.png', maskable512);
  fs.writeFileSync('public/icon-192.png', icon192Buf);
  fs.writeFileSync('public/apple-touch-icon.png', appleTouchBuf);
  fs.writeFileSync('public/favicon-48x48.png', fav48Buf);
  fs.writeFileSync('public/favicon-32x32.png', fav32Buf);
  fs.writeFileSync('public/favicon-16x16.png', fav16Buf);

  // Generate multi-resolution ICO file with 16, 32, 48 PNGs
  const icoBuffers = [fav16Buf, fav32Buf, fav48Buf];
  const icoSizes = [16, 32, 48];
  const numImages = icoBuffers.length;

  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // icon type
  header.writeUInt16LE(numImages, 4);

  const dirEntries = [];
  let offset = 6 + numImages * 16;

  for (let i = 0; i < numImages; i++) {
    const size = icoSizes[i];
    const buf = icoBuffers[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0); // width
    entry.writeUInt8(size, 1); // height
    entry.writeUInt8(0, 2);    // color count
    entry.writeUInt8(0, 3);    // reserved
    entry.writeUInt16LE(1, 4); // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(buf.length, 8); // size of image data
    entry.writeUInt32LE(offset, 12); // offset
    dirEntries.push(entry);
    offset += buf.length;
  }

  const icoFile = Buffer.concat([header, ...dirEntries, ...icoBuffers]);
  fs.writeFileSync('public/favicon.ico', icoFile);

  console.log('Successfully generated all icons and favicon.ico with high resolution and crisp circular badge!');
}

buildIcons().catch((err) => {
  console.error('Error building icons:', err);
  process.exit(1);
});
