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

  const outerRadius = Math.round(size * 0.21);
  const innerRadius = Math.round(size * 0.17);
  const borderWidth = Math.max(2, Math.round(size * 0.015));

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0c3d4f',
          borderRadius: outerRadius,
          padding: Math.round(size * 0.04),
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f8fafc',
            borderRadius: innerRadius,
            border: `${borderWidth}px solid #38bdf8`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Biometric Fingerprint Vector Icon */}
          <svg
            viewBox="0 0 512 512"
            width={Math.round(size * 0.88)}
            height={Math.round(size * 0.88)}
            fill="none"
          >
            {/* Corner Viewfinder Scanner Brackets */}
            <path
              d="M 58 136 L 58 88 A 30 30 0 0 1 88 58 L 136 58"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 376 58 L 424 58 A 30 30 0 0 1 454 88 L 454 136"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 58 376 L 58 424 A 30 30 0 0 0 88 454 L 136 454"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 376 454 L 424 454 A 30 30 0 0 0 454 424 L 454 376"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Central Biometric Ridges - Complete Loops, No Void */}
            <path
              d="M 248 270 C 248 238, 264 238, 264 270 L 264 365 C 264 380, 248 380, 248 365 Z"
              stroke="#0284c7"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="256" cy="242" r="5" fill="#38bdf8" />

            <path
              d="M 234 275 C 234 220, 278 220, 278 275 L 278 382 C 278 402, 234 402, 234 382 Z"
              stroke="#0369a1"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="278" cy="330" r="5" fill="#0284c7" />

            <path
              d="M 220 280 C 220 202, 292 202, 292 280 L 292 398 C 292 422, 220 422, 220 398 Z"
              stroke="#0284c7"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="220" cy="310" r="5" fill="#38bdf8" />

            <path
              d="M 206 285 C 206 184, 306 184, 306 285 L 306 414 C 306 440, 206 440, 206 414 Z"
              stroke="#0c4a6e"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="306" cy="360" r="5" fill="#0284c7" />

            <path
              d="M 192 290 C 192 166, 320 166, 320 290 L 320 426 C 320 456, 192 456, 192 426 Z"
              stroke="#0e7490"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="192" cy="370" r="5" fill="#38bdf8" />

            <path
              d="M 178 295 C 178 148, 334 148, 334 295 L 334 430 C 334 466, 178 466, 178 430 Z"
              stroke="#0284c7"
              strokeWidth="12"
              strokeLinecap="round"
            />

            <path
              d="M 164 300 C 164 130, 348 130, 348 300 L 348 424 C 348 472, 164 472, 164 424 Z"
              stroke="#0369a1"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Upper Cap */}
            <path
              d="M 168 180 C 196 128, 316 128, 344 180"
              stroke="#0284c7"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <circle cx="168" cy="180" r="5" fill="#38bdf8" />
            <circle cx="344" cy="180" r="5" fill="#38bdf8" />

            {/* Left Flank */}
            <path
              d="M 136 330 C 134 250, 142 188, 172 142"
              stroke="#0e7490"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <circle cx="136" cy="330" r="5" fill="#0284c7" />

            <path
              d="M 124 354 C 120 286, 128 214, 156 166"
              stroke="#0284c7"
              strokeWidth="11"
              strokeLinecap="round"
            />

            {/* Right Flank */}
            <path
              d="M 376 330 C 378 250, 370 188, 340 142"
              stroke="#0e7490"
              strokeWidth="11"
              strokeLinecap="round"
            />
            <circle cx="376" cy="330" r="5" fill="#0284c7" />

            <path
              d="M 388 354 C 392 286, 384 214, 356 166"
              stroke="#0284c7"
              strokeWidth="11"
              strokeLinecap="round"
            />

            {/* Circuit Traces */}
            <line x1="264" y1="210" x2="264" y2="185" stroke="#0284c7" strokeWidth="8" />
            <circle cx="264" cy="185" r="4.5" fill="#38bdf8" />

            <line x1="220" y1="230" x2="196" y2="230" stroke="#0284c7" strokeWidth="7" />
            <circle cx="196" cy="230" r="4" fill="#38bdf8" />

            <line x1="292" y1="230" x2="316" y2="230" stroke="#0284c7" strokeWidth="7" />
            <circle cx="316" cy="230" r="4" fill="#38bdf8" />
          </svg>
        </div>
      </div>
    ),
    {
      width: size,
      height: size,
    }
  );
}
