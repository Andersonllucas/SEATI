import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sizeParam = searchParams.get('size') || '512';
  
  let size = 512;
  const parsed = parseInt(sizeParam, 10);
  if (!isNaN(parsed) && parsed > 0) {
    size = parsed;
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0a3254', // primary color
          color: 'white',
          fontSize: size * 0.5,
          fontWeight: 'bold',
        }}
      >
        GE
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
