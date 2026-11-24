export type Road =
  | { kind: 'interstate'; number: string }
  | { kind: 'us'; number: string }
  | { kind: 'state'; number: string; state: string }
  | { kind: 'named'; name: string }

const NUMBERED = /^([A-Z]{1,2})-(\d+[A-Z]?)(?: [NSEW])?$/

/** Reads a road name as HERE labels it, such as "I-70" or "TX-114". */
export function parseRoad(text: string): Road {
  const match = NUMBERED.exec(text.trim())
  if (!match) return { kind: 'named', name: text }
  const [, prefix, number] = match
  if (prefix === 'I') return { kind: 'interstate', number }
  if (prefix === 'US') return { kind: 'us', number }
  if (prefix.length === 2) return { kind: 'state', number, state: prefix }
  return { kind: 'named', name: text }
}
