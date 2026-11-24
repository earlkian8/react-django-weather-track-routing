/** HERE's label without the country, which every US trip shares. */
export function shortPlace(label: string): string {
  return label.replace(/, United States$/, '')
}

/** Just the town or street, for tight spaces. */
export function placeName(label: string): string {
  return label.split(',')[0]
}
