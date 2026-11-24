/** Reads a design token, for drawing done outside CSS (the map). */
export function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}
