import { act, renderHook } from '@testing-library/react'
import { motionValue } from 'motion/react'
import { describe, expect, it } from 'vitest'
import { useDerived } from './useDerived'

describe('useDerived', () => {
  it('follows the value, rendering only when the result changes', () => {
    const value = motionValue(0.2)
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useDerived(value, Math.round)
    })
    expect(result.current).toBe(0)
    act(() => value.set(0.4))
    expect(renders).toBe(1)
    act(() => value.set(1.1))
    expect(result.current).toBe(1)
    expect(renders).toBe(2)
  })

  it('uses the latest value when the derivation changes', () => {
    const value = motionValue(0)
    const { result, rerender } = renderHook(({ derive }) => useDerived(value, derive), {
      initialProps: { derive: (() => null) as (v: number) => number | null },
    })
    act(() => value.set(7))
    rerender({ derive: (v) => v * 10 })
    expect(result.current).toBe(70)
  })
})
