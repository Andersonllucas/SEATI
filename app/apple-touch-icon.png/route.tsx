import { ImageResponse } from 'next/og';

export async function GET() {
  const size = 180;
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
