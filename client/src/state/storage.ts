/** Web storage that shrugs off being blocked, full or holding something unreadable. */
export function load<T>(storage: () => Storage, key: string): T | null {
  try {
    return JSON.parse(storage().getItem(key) ?? 'null')
  } catch {
    return null
  }
}

export function save(storage: () => Storage, key: string, value: unknown) {
  try {
    storage().setItem(key, JSON.stringify(value))
  } catch {
    // Only a convenience: without it, a reload starts over.
  }
}

export const local = () => localStorage
export const session = () => sessionStorage
