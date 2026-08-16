// Default Open Graph image for the whole site (ARCHITECTURE.md §17, §22). No custom fonts and no embedded raster
// photo are used — `next/og`'s bundled image decoder choked on the source JPEG during static export (a known
// class of issue with progressive/large JPEGs and satori's decoder), so per §17's own fallback allowance ("if
// that is not buildable offline, use a static image path instead; keep it simple and buildable") this renders a
// small, dependency-free monochrome pixel-grid mark plus the wordmark instead of the photographic logo. Zero
// network calls, zero file reads — always buildable offline.
import { ImageResponse } from 'next/og';

export const alt = 'Entrophy — Discord moderation you can trust';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// A tiny 8x8 pixel-art skull silhouette (1 = filled), evoking the brand mark without needing to decode a photo.
const SKULL_ROWS = [
  '00111100',
  '01111110',
  '11111111',
  '11011011',
  '11111111',
  '11100111',
  '01111110',
  '00100100',
];

export default function Image() {
  const cell = 14;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#050505',
          color: '#e5e5e5',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {SKULL_ROWS.map((row, y) => (
            <div key={y} style={{ display: 'flex' }}>
              {row.split('').map((bit, x) => (
                <div
                  key={x}
                  style={{
                    width: cell,
                    height: cell,
                    backgroundColor: bit === '1' ? '#d4d4d4' : 'transparent',
                  }}
                />
              ))}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 40, fontSize: 96, fontWeight: 700, letterSpacing: -2, display: 'flex' }}>ENTROPHY</div>
        <div style={{ marginTop: 20, fontSize: 34, color: '#a3a3a3', display: 'flex' }}>Discord moderation you can trust</div>
      </div>
    ),
    { ...size },
  );
}
