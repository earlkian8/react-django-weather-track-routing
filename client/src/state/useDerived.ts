import type { MotionValue } from 'motion/react'
import { useCallback, useSyncExternalStore } from 'react'

/** Re-renders only when the derived value changes, not on every frame of the motion value. */
export function useDerived<T extends string | number | boolean | null>(value: MotionValue<number>, derive: (v: number) => T): T {
  const subscribe = useCallback((notify: () => void) => value.on('change', notify), [value])
  return useSyncExternalStore(subscribe, () => derive(value.get()))
}
