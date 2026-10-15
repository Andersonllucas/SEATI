import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sizeParam = searchParams.get('size') || '512';

  const size = parseInt(sizeParam, 10);

  try {
    const icon192 = path.join(process.cwd(), 'public', 'icon-192.png');
    const icon512 = path.join(process.cwd(), 'public', 'icon-512.png');
    const logoPng = path.join(process.cwd(), 'public', 'logo.png');
    const logoWebp = path.join(process.cwd(), 'public', 'logo.webp');

    let targetFile = icon512;
    if (size <= 192 && fs.existsSync(icon192)) {
      targetFile = icon192;
    } else if (fs.existsSync(icon512)) {
      targetFile = icon512;
    } else if (fs.existsSync(logoPng)) {
      targetFile = logoPng;
    } else {
      targetFile = logoWebp;
    }

    if (fs.existsSync(targetFile)) {
      const buffer = await fs.promises.readFile(targetFile);
      const contentType = targetFile.endsWith('.webp') ? 'image/webp' : 'image/png';
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
        },
      });
    }

    return new NextResponse('Icon not found', { status: 404 });
  } catch (error) {
    console.error('Error serving PWA icon:', error);
    return new NextResponse('Internal Error', { status: 500 });
  }
}
