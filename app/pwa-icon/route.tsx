import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sizeParam = searchParams.get('size') || '512';

  let size = 512;
  const parsed = parseInt(sizeParam, 10);
  if (!isNaN(parsed) && parsed > 0 && parsed <= 1024) {
    size = parsed;
  }

  try {
    const webpPath = path.join(process.cwd(), 'public', 'logo.webp');
    const pngPath = path.join(process.cwd(), 'public', 'logo.png');
    const iconSpecificPath = path.join(process.cwd(), 'public', `icon-${size}.png`);

    // If exact pre-generated size exists, return it directly
    if (fs.existsSync(iconSpecificPath)) {
      const buffer = await fs.promises.readFile(iconSpecificPath);
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

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
    console.error('Error generating PWA icon:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
