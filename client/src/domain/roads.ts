export type Road =
  | { kind: 'interstate'; number: string }
  | { kind: 'us'; number: string }
  | { kind: 'badge'; text: string }
  | { kind: 'named'; name: string }

const US_NUMBERED = /^(I|US)-(\d+[A-Z]?)(?: [NSEW])?$/
/** Road numbers anywhere, such as "M1", "A1(M)", "NH-48" or the doubled "E1 AH26". */
const NUMBERED = /^[A-Z]{0,4}-?\d[\w()-]*(?: [A-Z]{0,4}-?\d\w*)*$/

/** Reads a road name as HERE labels it. Only Interstates and US highways have a shield of their own. */
export function parseRoad(text: string): Road {
  const trimmed = text.trim()
  const us = US_NUMBERED.exec(trimmed)
  if (us) return { kind: us[1] === 'I' ? 'interstate' : 'us', number: us[2] }
  return NUMBERED.test(trimmed) ? { kind: 'badge', text: trimmed } : { kind: 'named', name: trimmed }
}
