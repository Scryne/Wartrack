/**
 * A design token's resolved value. Leaflet writes SVG presentation attributes
 * (stroke, fill), which do not resolve CSS custom properties, so vector layers
 * and drawing colours read the token here instead of repeating a literal.
 */
export function tokenColor(name: string): string {
  if (typeof document === 'undefined') return 'currentColor';
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || 'currentColor';
}
