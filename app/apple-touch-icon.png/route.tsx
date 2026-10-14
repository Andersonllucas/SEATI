import { ImageResponse } from 'next/og';

export async function GET() {
  const size = 180;
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
              d="M 54 136 L 54 84 A 30 30 0 0 1 84 54 L 136 54"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 376 54 L 428 54 A 30 30 0 0 1 458 84 L 458 136"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 54 376 L 54 428 A 30 30 0 0 0 84 458 L 136 458"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M 376 458 L 428 458 A 30 30 0 0 0 458 428 L 458 376"
              stroke="#0f4c64"
              strokeWidth="18"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Central Biometric Ridges */}
            <path
              d="M 248 274 C 248 238 264 238 264 274 L 264 304"
              stroke="#0284c7"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="264" cy="304" r="6" fill="#0284c7" />

            <path
              d="M 233 274 C 233 218 279 218 279 274 L 279 336"
              stroke="#0369a1"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="279" cy="336" r="6" fill="#0369a1" />

            <path
              d="M 218 280 C 218 198 294 198 294 280 L 294 366"
              stroke="#0284c7"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="218" cy="280" r="6" fill="#38bdf8" />

            <path
              d="M 203 286 C 203 178 309 178 309 286 L 309 388"
              stroke="#0c4a6e"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="309" cy="388" r="6" fill="#0284c7" />

            <path
              d="M 188 292 C 188 158 324 158 324 292 L 324 354"
              stroke="#0e7490"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="324" cy="354" r="6" fill="#0e7490" />

            <path
              d="M 173 300 C 173 138 339 138 339 300 L 339 328"
              stroke="#0284c7"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="339" cy="328" r="6" fill="#0284c7" />

            <path
              d="M 158 312 C 158 120 354 120 354 312 L 354 340"
              stroke="#0369a1"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="158" cy="312" r="6" fill="#0284c7" />

            {/* Upper Arches */}
            <path
              d="M 170 186 C 206 132 306 132 342 186"
              stroke="#0284c7"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="170" cy="186" r="6" fill="#38bdf8" />
            <circle cx="342" cy="186" r="6" fill="#38bdf8" />

            <path
              d="M 190 156 C 224 116 288 116 322 156"
              stroke="#0369a1"
              strokeWidth="12"
              strokeLinecap="round"
            />

            {/* Left Flank */}
            <path
              d="M 143 328 C 143 270 148 214 176 168"
              stroke="#0e7490"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="143" cy="328" r="6" fill="#0e7490" />

            <path
              d="M 130 350 C 128 290 134 220 162 170"
              stroke="#0284c7"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="130" cy="350" r="6" fill="#0284c7" />

            <path
              d="M 120 380 C 114 310 120 236 150 184"
              stroke="#0c4a6e"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="120" cy="380" r="6" fill="#0e7490" />

            {/* Right Flank */}
            <path
              d="M 368 336 C 368 274 362 216 336 168"
              stroke="#0e7490"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="368" cy="336" r="6" fill="#0e7490" />

            <path
              d="M 382 354 C 384 290 376 220 348 170"
              stroke="#0284c7"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="382" cy="354" r="6" fill="#0284c7" />

            <path
              d="M 394 380 C 398 310 390 236 360 184"
              stroke="#0c4a6e"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <circle cx="394" cy="380" r="6" fill="#0e7490" />

            {/* Delta Base Arches */}
            <path
              d="M 186 434 C 220 454 292 454 326 434"
              stroke="#0284c7"
              strokeWidth="13"
              strokeLinecap="round"
            />
            <circle cx="186" cy="434" r="6" fill="#0284c7" />
            <circle cx="326" cy="434" r="6" fill="#0284c7" />

            {/* Micro Circuit Nodes */}
            <path d="M 203 336 L 203 372" stroke="#0284c7" strokeWidth="10" strokeLinecap="round" />
            <circle cx="203" cy="336" r="5" fill="#38bdf8" />
            <circle cx="203" cy="372" r="5" fill="#0284c7" />

            <path d="M 246 364 L 246 414" stroke="#0284c7" strokeWidth="10" strokeLinecap="round" />
            <circle cx="246" cy="364" r="5" fill="#38bdf8" />
            <circle cx="246" cy="414" r="5" fill="#0284c7" />
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
