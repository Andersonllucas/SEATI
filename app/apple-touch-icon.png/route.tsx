import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

export async function GET() {
  const size = 180;
  try {
    const pregeneratedPath = path.join(process.cwd(), 'public', 'apple-touch-icon.png');
    if (fs.existsSync(pregeneratedPath)) {
      const buffer = await fs.promises.readFile(pregeneratedPath);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    const webpPath = path.join(process.cwd(), 'public', 'logo.webp');
    const pngPath = path.join(process.cwd(), 'public', 'logo.png');
    const sourcePath = fs.existsSync(webpPath) ? webpPath : pngPath;

    if (fs.existsSync(sourcePath)) {
      const sourceBuffer = await fs.promises.readFile(sourcePath);
      const pngBuffer = await sharp(sourceBuffer)
        .resize(size, size, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 0 },
        })
        .png()
        .toBuffer();

      return new NextResponse(pngBuffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    return new NextResponse('Icon not found', { status: 404 });
  } catch (error) {
    console.error('Error generating Apple Touch Icon:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
