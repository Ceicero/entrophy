// Faint film-grain overlay (ARCHITECTURE.md §17) — SVG feTurbulence noise data-URI, tiled, ~4% opacity, defined
// in globals.css (`.grain-layer`). Static, so this is a trivial server component.
export function Grain() {
  return <div className="grain-layer" aria-hidden="true" />;
}
