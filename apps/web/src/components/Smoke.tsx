// Smoky UI background layer (ARCHITECTURE.md §17): 4–6 blurred, softly-drifting radial-gradient blobs. Pure
// CSS animation (see globals.css `.smoke-blob` / `@keyframes smoke-drift-*`), so this can be a server component
// — no client JS needed. `prefers-reduced-motion` is handled globally in globals.css.
interface BlobSpec {
  top: string;
  left: string;
  size: number;
  opacity: number;
  animation: string;
  duration: string;
  delay: string;
}

const BLOBS: BlobSpec[] = [
  {
    top: '-10%',
    left: '5%',
    size: 640,
    opacity: 0.16,
    animation: 'smoke-drift-a',
    duration: '95s',
    delay: '0s',
  },
  {
    top: '10%',
    left: '60%',
    size: 560,
    opacity: 0.12,
    animation: 'smoke-drift-b',
    duration: '110s',
    delay: '-15s',
  },
  {
    top: '55%',
    left: '-8%',
    size: 520,
    opacity: 0.1,
    animation: 'smoke-drift-c',
    duration: '80s',
    delay: '-30s',
  },
  {
    top: '65%',
    left: '55%',
    size: 620,
    opacity: 0.14,
    animation: 'smoke-drift-a',
    duration: '120s',
    delay: '-45s',
  },
  {
    top: '30%',
    left: '30%',
    size: 460,
    opacity: 0.08,
    animation: 'smoke-drift-b',
    duration: '70s',
    delay: '-10s',
  },
  {
    top: '-5%',
    left: '80%',
    size: 500,
    opacity: 0.1,
    animation: 'smoke-drift-c',
    duration: '100s',
    delay: '-60s',
  },
];

export function Smoke() {
  return (
    <div className="smoke-layer" aria-hidden="true">
      {BLOBS.map((blob, i) => (
        <div
          key={i}
          className="smoke-blob"
          style={{
            top: blob.top,
            left: blob.left,
            width: blob.size,
            height: blob.size,
            opacity: blob.opacity,
            animationName: blob.animation,
            animationDuration: blob.duration,
            animationDelay: blob.delay,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
          }}
        />
      ))}
    </div>
  );
}
