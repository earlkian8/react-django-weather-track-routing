import { describe, expect, it } from 'vitest'
import { makeRoute } from '../test/fixtures'
import { buildTrack, checkpointIndexAt, etaAt, mileAt, pointAt, riskRuns, slice } from './track'

const NOON = Date.parse('2026-11-24T12:00:00Z')
const HOUR = 3_600_000

describe('pointAt', () => {
  const track = buildTrack(makeRoute())

  it('interpolates along the road', () => {
    const milesPerDegree = 69.0937 * Math.cos((35 * Math.PI) / 180)
    const p = pointAt(track, 50.5)
    expect(p.lat).toBeCloseTo(35, 4)
    expect(p.lng).toBeCloseTo(-100 - 50.5 / milesPerDegree, 2)
  })

  it('clamps to the ends', () => {
    expect(pointAt(track, -5).lng).toBe(-100)
    expect(pointAt(track, 900)).toMatchObject({ lng: track.coords.at(-1)![0] })
  })

  it('gives the compass heading of travel', () => {
    expect(pointAt(track, 50).heading).toBeCloseTo(270, 0)
  })

  it('keeps a heading at the destination and across repeated points', () => {
    const route = makeRoute()
    route.geometry.push(route.geometry.at(-1)!)
    expect(pointAt(buildTrack(route), 100).heading).toBeCloseTo(270, 0)
  })
})

describe('slice', () => {
  const track = buildTrack(makeRoute())

  it('returns the road between two miles, with interpolated ends', () => {
    const part = slice(track, 10.5, 12.5)
    expect(part).toHaveLength(4)
    expect(part[0][0]).toBeCloseTo(pointAt(track, 10.5).lng, 6)
    expect(part.at(-1)![0]).toBeCloseTo(pointAt(track, 12.5).lng, 6)
  })

  it('joins adjacent slices exactly', () => {
    expect(slice(track, 0, 33.3).at(-1)).toEqual(slice(track, 33.3, 80)[0])
  })
})

describe('eta and mile', () => {
  const track = buildTrack(makeRoute())

  it('converts miles to arrival times and back', () => {
    expect(etaAt(track, 0)).toBe(NOON)
    expect(etaAt(track, 60)).toBe(NOON + 1.2 * HOUR)
    expect(mileAt(track, NOON + 1.2 * HOUR)).toBeCloseTo(60, 6)
  })

  it('holds the truck at the ends outside the trip', () => {
    expect(mileAt(track, NOON - HOUR)).toBe(0)
    expect(mileAt(track, NOON + 40 * HOUR)).toBe(100)
  })

  it('handles stops, where two checkpoints share a mile or a time', () => {
    const route = makeRoute()
    route.checkpoints[2].mile = route.checkpoints[1].mile
    const t = buildTrack(route)
    expect(Number.isFinite(etaAt(t, route.checkpoints[1].mile))).toBe(true)
    expect(Number.isFinite(mileAt(t, Date.parse(route.checkpoints[1].eta)))).toBe(true)
  })
})

describe('riskRuns', () => {
  it('merges neighbours with the same risk and covers the whole route', () => {
    const runs = riskRuns(makeRoute('A', ['low', 'low', 'high', 'high', 'unknown']))
    expect(runs).toEqual([
      { from: 0, to: 37.5, risk: 'low' },
      { from: 37.5, to: 87.5, risk: 'high' },
      { from: 87.5, to: 100, risk: 'unknown' },
    ])
  })

  it('ends exactly at the destination even when rounded segments fall short', () => {
    const route = makeRoute()
    route.checkpoints.forEach((c) => (c.segment_miles -= 0.04))
    expect(riskRuns(route).at(-1)!.to).toBe(100)
  })
})

describe('checkpointIndexAt', () => {
  it('finds the checkpoint whose stretch contains the mile', () => {
    const route = makeRoute()
    expect(checkpointIndexAt(route, 0)).toBe(0)
    expect(checkpointIndexAt(route, 12)).toBe(0)
    expect(checkpointIndexAt(route, 13)).toBe(1)
    expect(checkpointIndexAt(route, 100)).toBe(4)
  })
})
