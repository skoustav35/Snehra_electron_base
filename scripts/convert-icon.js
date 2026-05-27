import fs from 'fs';
import path from 'path';
import icojs from 'icojs';
import png2icons from 'png2icons';

async function main() {
    const icoPath = path.resolve('app_icon', 'ChatGPT Image Mar 1, 2026, 10_40_44 PM (1).ico');
    const buffer = fs.readFileSync(icoPath);

    // 1. Copy ICO to assets/icons/icon.ico
    const iconsDir = path.resolve('assets', 'icons');
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(iconsDir, 'icon.ico'), buffer);

    const images = await icojs.parseICO(buffer);

    // Find highest resolution
    let bestImg = images[0];
    for (const img of images) {
        if (img.width > bestImg.width) {
            bestImg = img;
        }
    }

    const pngBuffer = Buffer.from(bestImg.buffer);
    fs.writeFileSync(path.join(iconsDir, 'icon.png'), pngBuffer);

    // 3. Convert PNG to ICNS
    const icnsBuffer = png2icons.createICNS(pngBuffer, png2icons.BICUBIC, 0);
    if (icnsBuffer) {
        fs.writeFileSync(path.join(iconsDir, 'icon.icns'), icnsBuffer);
        console.log('Icon conversion successful!');
    } else {
        console.error('Failed to create ICNS from the PNG buffer');
    }
}

main().catch(console.error);
