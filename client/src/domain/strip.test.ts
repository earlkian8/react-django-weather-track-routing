import { describe, expect, it } from 'vitest'
import { makeCheckpoint, makeRoute } from '../test/fixtures'
import { hourTicks, mileStep, pickWindsocks, precipRuns, skyColor, waypoints } from './strip'
import { buildTrack } from './track'

describe('skyColor', () => {
  it('goes from night to day as the sun climbs', () => {
    expect(skyColor(-40)).toBe('rgb(9, 19, 34)')
    expect(skyColor(60)).toBe('rgb(120, 177, 199)')
    expect(skyColor(0)).not.toBe(skyColor(4))
  })
})

describe('mileStep', () => {
  it('picks the smallest round step that leaves room for a plate', () => {
    expect(mileStep(100, 1000)).toBe(10)
    expect(mileStep(800, 1200)).toBe(50)
    expect(mileStep(2500, 400)).toBe(500)
    expect(mileStep(883, 290)).toBe(200)
  })
})

describe('precipRuns', () => {
  it('joins neighbouring wet checkpoints and keeps rain and snow amounts', () => {
    const wet = (rain: number, snow = 0) => ({ wind_mph: 5, gust_mph: null, rain_in_hr: rain, snow_in_hr: snow })
    const route = makeRoute()
    route.checkpoints[1].weather = wet(0.2)
    route.checkpoints[2].weather = wet(0, 1)
    route.checkpoints[4].weather = wet(0.05)
    expect(precipRuns(route)).toEqual([
      { from: 12.5, to: 62.5, parts: [{ from: 12.5, to: 37.5, rain: 0.2, snow: 0 }, { from: 37.5, to: 62.5, rain: 0, snow: 1 }] },
      { from: 87.5, to: 100, parts: [{ from: 87.5, to: 100, rain: 0.05, snow: 0 }] },
    ])
  })

  it('is empty on a dry route and skips missing forecasts', () => {
    expect(precipRuns(makeRoute('A', ['low', 'unknown', 'low']))).toEqual([])
  })
})

describe('pickWindsocks', () => {
  it('keeps the windiest checkpoint where there is not room for all', () => {
    const checkpoints = [10, 40, 12, 8, 30].map((wind_mph, i) =>
      makeCheckpoint({ mile: i * 10, weather: { wind_mph, gust_mph: null, rain_in_hr: 0, snow_in_hr: 0 } }),
    )
    expect(pickWindsocks(checkpoints, 25).map((c) => c.weather!.wind_mph)).toEqual([40, 30])
    expect(pickWindsocks(checkpoints, 5)).toHaveLength(5)
  })
})

describe('hourTicks', () => {
  const track = buildTrack(makeRoute())

  it('puts local clock hours along the road', () => {
    const points = waypoints(track, 20)
    const ticks = hourTicks(track, points, 1)
    expect(ticks.map((t) => [t.label, Math.round(t.mile)])).toEqual([['6 AM', 0], ['7 AM', 50], ['8 AM', 100]])
  })

  it('drops labels too close to the one before, as when a zone change repeats an hour', () => {
    const points = waypoints(track, 20)
    expect(hourTicks(track, points, 1, 60).map((t) => t.label)).toEqual(['6 AM', '8 AM'])
  })

  it.each([
    ['India, half an hour off UTC hours', 77.2, 28.6, '2026-11-24T06:00:00Z', ['12 PM', '1 PM'], [25, 75]],
    ['Nepal, three quarters off', 85.3, 27.7, '2026-11-24T06:00:00Z', ['12 PM', '1 PM'], [12.5, 62.5]],
  ])('marks the local hour in %s', (_, lng, lat, start, labels, miles) => {
    const route = makeRoute()
    route.geometry = route.geometry.map(([, ], i) => [lng - i * 0.0001, lat])
    route.checkpoints.forEach((c, i) => (c.eta = new Date(Date.parse(start) + i * 30 * 60_000).toISOString()))
    const local = buildTrack(route)
    const ticks = hourTicks(local, waypoints(local, 20), 1)
    expect(ticks.map((t) => t.label)).toEqual(labels)
    expect(ticks.map((t) => t.mile)).toEqual(miles)
  })

  it('names the day at midnight', () => {
    const route = makeRoute()
    route.checkpoints.forEach((c) => (c.eta = new Date(Date.parse(c.eta) + 17 * 3_600_000).toISOString()))
    const late = buildTrack(route)
    expect(hourTicks(late, waypoints(late, 20), 1).map((t) => t.label)).toEqual(['11 PM', 'Wed', '1 AM'])
  })
})
