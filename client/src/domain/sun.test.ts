import { describe, expect, it } from 'vitest'
import { solarElevation, sunCrossings } from './sun'

const at = (iso: string) => Date.parse(iso)

describe('solarElevation', () => {
  it('is near 90 degrees overhead on the equator at equinox noon', () => {
    expect(solarElevation(at('2026-03-20T12:07:00Z'), 0, 0)).toBeGreaterThan(88)
  })

  it('is far below the horizon at local midnight', () => {
    expect(solarElevation(at('2026-11-24T06:30:00Z'), 32.78, -96.8)).toBeLessThan(-60)
  })

  it('crosses the horizon at the published Dallas sunset (23 Nov, 5:21 PM CST) within 3 minutes', () => {
    expect(solarElevation(at('2026-11-23T23:18:00Z'), 32.78, -96.8)).toBeGreaterThan(-0.833)
    expect(solarElevation(at('2026-11-23T23:25:00Z'), 32.78, -96.8)).toBeLessThan(-0.833)
  })
})

describe('sunCrossings', () => {
  const still = (iso: string, hours: number) =>
    Array.from({ length: hours * 4 + 1 }, (_, i) => ({ mile: i, time: at(iso) + i * 900_000, lat: 32.78, lng: -96.8 }))

  it('finds sunset and sunrise along the way', () => {
    const events = sunCrossings(still('2026-11-23T22:00:00Z', 16))
    expect(events.map((e) => e.kind)).toEqual(['sunset', 'sunrise'])
    expect(Math.abs(events[0].time - at('2026-11-23T23:21:00Z'))).toBeLessThan(5 * 60_000)
    expect(events[0].mile).toBeCloseTo(5.4, 0)
  })

  it('is empty when the sun stays up', () => {
    expect(sunCrossings(still('2026-11-24T16:00:00Z', 3))).toEqual([])
  })
})
