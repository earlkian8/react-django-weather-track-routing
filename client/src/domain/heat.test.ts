import { describe, expect, it } from 'vitest'
import { makeHeatmap } from '../test/fixtures'
import { heatFeatures, hourIndexAt, hourSummaries } from './heat'

const start = Date.parse('2026-11-24T12:00:00Z')
const MIN = 60_000

describe('hourIndexAt', () => {
  const heat = makeHeatmap()
  it('uses the first hour mark at or after the time, as checkpoints do for rain and snow', () => {
    expect(hourIndexAt(heat, start)).toBe(0)
    expect(hourIndexAt(heat, start + 1 * MIN)).toBe(1)
    expect(hourIndexAt(heat, start + 60 * MIN)).toBe(1)
  })

  it('is null outside the window', () => {
    expect(hourIndexAt(heat, start - MIN)).toBeNull()
    expect(hourIndexAt(heat, start + 121 * MIN)).toBeNull()
  })
})

describe('heatFeatures', () => {
  it('places one point per cell at [lng, lat] with its risk', () => {
    const fc = heatFeatures(makeHeatmap(), 2, 'risk')
    expect(fc.features[0].geometry.coordinates).toEqual([-100, 35])
    expect(fc.features[0].properties).toMatchObject({ cell: 0, risk: 'no_travel', strength: 1 })
  })

  it('leaves out cells with no data', () => {
    expect(heatFeatures(makeHeatmap(), 1, 'risk').features.map((f) => f.properties.cell)).toEqual([0])
  })

  it('scales wind, rain and snow to their No Travel limits, capped at 1', () => {
    const strength = (metric: 'wind' | 'rain' | 'snow', hour: number) =>
      heatFeatures(makeHeatmap(), hour, metric).features.map((f) => f.properties.strength)
    expect(strength('wind', 1)).toEqual([0.5])
    expect(strength('wind', 2)[0]).toBe(1)
    expect(strength('rain', 2)[0]).toBe(0.5)
    expect(strength('snow', 0)[1]).toBeCloseTo(0.1 / 3)
  })
})

describe('hourSummaries', () => {
  it('gives the worst risk each hour and the share of cells at every level', () => {
    expect(hourSummaries(makeHeatmap())).toEqual([
      { worst: 'high', shares: [0.5, 0, 0.5, 0, 0] },
      { worst: 'moderate', shares: [0, 1, 0, 0, 0] },
      { worst: 'no_travel', shares: [0.5, 0, 0, 0, 0.5] },
    ])
  })

  it('is unknown when no cell has data', () => {
    expect(hourSummaries(makeHeatmap({ hours: 1, risk: [[null], [null]] }))).toEqual([
      { worst: 'unknown', shares: [0, 0, 0, 0, 0] },
    ])
  })
})
