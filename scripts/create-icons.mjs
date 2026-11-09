import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const svg=await readFile(new URL('../public/favicon.svg',import.meta.url));
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]) await sharp(svg).resize(size,size).png().toFile(fileURLToPath(new URL('../public/'+name,import.meta.url)));
