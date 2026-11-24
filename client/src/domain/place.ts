import type { Place } from '../api/types'

const US = ', United States'

/** Just the town or street, for tight spaces. */
export function placeName(label: string): string {
  return label.split(',')[0]
}

/** "A to B", without a country both share. */
export function tripTitle(origin: string, destination: string): string {
  const country = (label: string) => label.slice(label.lastIndexOf(', '))
  const shared = origin.includes(', ') && destination.includes(', ') && country(origin) === country(destination)
  const name = (label: string) => (shared ? label.slice(0, -country(label).length) : label)
  return `${name(origin)} to ${name(destination)}`
}

export function isInUS(place: Place | null): boolean {
  return place?.label.endsWith(US) ?? false
}

/** The place typed text clearly means, or null when it could be more than one. */
export function matchPlace(text: string, places: Place[]): Place | null {
  if (places.length === 1) return places[0]
  const wanted = plain(text)
  const matches = places.filter(({ label }) => `${plain(label)},`.startsWith(`${wanted},`))
  return matches.length === 1 ? matches[0] : null
}

/** Lower case, without accents, with single spaces. */
function plain(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}
