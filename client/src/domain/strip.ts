import type { Checkpoint, Route } from '../api/types'
import type { Waypoint } from './sun'
import { clockAt, formatHour, formatWeekday, zoneFor } from './time'
import { etaAt, mileAt, pointAt, type Track } from './track'

// Every time zone is a whole number of these from UTC.
const QUARTER_HOUR = 15 * 60_000
const PLATE_SPACING_PX = 54
const MILE_STEPS = [10, 25, 50, 100, 200, 500, 1000]

/** Sky color by the sun's elevation in degrees. */
const SKY: [number, [number, number, number]][] = [
  [-18, [9, 19, 34]],
  [-12, [17, 36, 60]],
  [-6, [43, 70, 108]],
  [-3, [104, 103, 138]],
  [-0.8, [214, 134, 104]],
  [3, [240, 190, 128]],
  [8, [214, 211, 180]],
  [16, [150, 194, 203]],
  [28, [120, 177, 199]],
]

export interface RoadSample extends Waypoint {
  zone: string
}

export interface PrecipPart {
  from: number
  to: number
  rain: number
  snow: number
}

export interface PrecipRun {
  from: number
  to: number
  parts: PrecipPart[]
}

export interface HourTick {
  mile: number
  label: string
}

export function skyColor(elevation: number): string {
  const rgb = ([r, g, b]: number[]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
  if (elevation <= SKY[0][0]) return rgb(SKY[0][1])
  for (let i = 1; i < SKY.length; i++) {
    const [high, to] = SKY[i]
    const [low, from] = SKY[i - 1]
    if (elevation <= high) return rgb(from.map((c, k) => c + ((to[k] - c) * (elevation - low)) / (high - low)))
  }
  return rgb(SKY.at(-1)![1])
}

/** Evenly spaced points along the road, with the time the truck reaches each. */
export function waypoints(track: Track, count: number): RoadSample[] {
  return Array.from({ length: count + 1 }, (_, i) => {
    const mile = (track.total * i) / count
    const { lat, lng } = pointAt(track, mile)
    return { mile, time: etaAt(track, mile), lat, lng, zone: zoneFor(lat, lng) }
  })
}

export function mileStep(total: number, width: number): number {
  return MILE_STEPS.find((step) => (step / total) * width >= PLATE_SPACING_PX) ?? MILE_STEPS.at(-1)!
}

export function precipRuns(route: Route): PrecipRun[] {
  const runs: PrecipRun[] = []
  let from = 0
  route.checkpoints.forEach(({ segment_miles, weather }, i) => {
    const to = i === route.checkpoints.length - 1 ? route.distance_mi : from + segment_miles
    if (weather && (weather.rain_in_hr > 0 || weather.snow_in_hr > 0)) {
      const part = { from, to, rain: weather.rain_in_hr, snow: weather.snow_in_hr }
      const last = runs.at(-1)
      if (last?.to === from) {
        last.parts.push(part)
        last.to = to
      } else runs.push({ from, to, parts: [part] })
    }
    from = to
  })
  return runs
}

/** At most one windsock per stretch of road: the windiest. */
export function pickWindsocks(checkpoints: Checkpoint[], spacingMiles: number): Checkpoint[] {
  const picked = new Map<number, Checkpoint>()
  for (const checkpoint of checkpoints) {
    if (!checkpoint.weather) continue
    const bin = Math.floor(checkpoint.mile / spacingMiles)
    const best = picked.get(bin)
    if (!best || checkpoint.weather.wind_mph > best.weather!.wind_mph) picked.set(bin, checkpoint)
  }
  return [...picked.values()]
}

/** Local clock hours along the road, at multiples of `every` hours. Midnight shows the new day instead. */
export function hourTicks(track: Track, points: RoadSample[], every: number, minGapMiles = 0): HourTick[] {
  const ticks: HourTick[] = []
  const end = points.at(-1)!.time
  for (let time = Math.ceil(points[0].time / QUARTER_HOUR) * QUARTER_HOUR; time <= end; time += QUARTER_HOUR) {
    const mile = mileAt(track, time)
    const { zone } = points.reduce((a, b) => (Math.abs(b.mile - mile) < Math.abs(a.mile - mile) ? b : a))
    const { hour, minute } = clockAt(time, zone)
    const roomy = ticks.length === 0 || mile - ticks.at(-1)!.mile >= minGapMiles
    if (minute === 0 && hour % every === 0 && roomy) {
      ticks.push({ mile, label: hour === 0 ? formatWeekday(time, zone) : formatHour(time, zone) })
    }
  }
  return ticks
}
