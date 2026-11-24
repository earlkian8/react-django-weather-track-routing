import type { CheckpointRisk, LngLat, Route } from '../api/types'

const EARTH_RADIUS_MI = 3958.7613
const RAD = Math.PI / 180

/** A route's road with miles and times along it. */
export interface Track {
  coords: LngLat[]
  /** Miles from the start at each coordinate. */
  miles: number[]
  total: number
  /** Checkpoint miles and times, strictly increasing in both. */
  stops: { mile: number; time: number }[]
}

export interface RoadPoint {
  lng: number
  lat: number
  /** Degrees clockwise from north. */
  heading: number
}

export interface RiskRun {
  from: number
  to: number
  risk: CheckpointRisk
}

export function buildTrack(route: Route): Track {
  const coords = route.geometry
  const miles = [0]
  for (let i = 1; i < coords.length; i++) miles.push(miles[i - 1] + distance(coords[i - 1], coords[i]))

  // The API's distance is authoritative; straight-line pieces come out slightly short of it.
  const scale = miles.at(-1)! > 0 ? route.distance_mi / miles.at(-1)! : 1
  const stops: Track['stops'] = []
  for (const { mile, eta } of route.checkpoints) {
    const time = Date.parse(eta)
    const last = stops.at(-1)
    if (!last || (mile > last.mile && time > last.time)) stops.push({ mile, time })
  }
  return { coords, miles: miles.map((m) => m * scale), total: route.distance_mi, stops }
}

export function pointAt(track: Track, mile: number): RoadPoint {
  const { coords } = track
  const { index, t } = locate(track, mile)
  const [lng, lat] = lerp(coords[index], coords[index + 1] ?? coords[index], t)
  return { lng, lat, heading: headingAt(track, index) }
}

export function slice(track: Track, from: number, to: number): LngLat[] {
  const a = locate(track, from)
  const b = locate(track, to)
  const at = ({ index, t }: typeof a) => lerp(track.coords[index], track.coords[index + 1] ?? track.coords[index], t)
  const inner: LngLat[] = []
  for (let i = a.index + 1; i <= b.index; i++) {
    if (track.miles[i] > from && track.miles[i] < to) inner.push(track.coords[i])
  }
  return [at(a), ...inner, at(b)]
}

export function etaAt(track: Track, mile: number): number {
  return interpolate(track.stops, mile, 'mile', 'time')
}

export function mileAt(track: Track, time: number): number {
  return interpolate(track.stops, time, 'time', 'mile')
}

/** Stretches of one risk, from checkpoint segments, covering the route end to end. */
export function riskRuns(route: Route): RiskRun[] {
  const runs: RiskRun[] = []
  let from = 0
  route.checkpoints.forEach((checkpoint, i) => {
    const isLast = i === route.checkpoints.length - 1
    const to = isLast ? route.distance_mi : from + checkpoint.segment_miles
    const previous = runs.at(-1)
    if (previous?.risk === checkpoint.risk) previous.to = to
    else runs.push({ from, to, risk: checkpoint.risk })
    from = to
  })
  return runs
}

export function checkpointIndexAt(route: Route, mile: number): number {
  let end = 0
  for (let i = 0; i < route.checkpoints.length; i++) {
    end += route.checkpoints[i].segment_miles
    if (mile <= end) return i
  }
  return route.checkpoints.length - 1
}

function locate({ miles }: Track, mile: number): { index: number; t: number } {
  if (mile <= 0) return { index: 0, t: 0 }
  const last = miles.length - 1
  if (mile >= miles[last]) return { index: last, t: 0 }
  let low = 0
  let high = last
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (miles[middle] <= mile) low = middle
    else high = middle
  }
  return { index: low, t: (mile - miles[low]) / (miles[high] - miles[low]) }
}

function headingAt({ coords }: Track, index: number): number {
  // Skip repeated points, and look back from the destination.
  for (let i = index; i < coords.length - 1; i++) {
    if (!same(coords[i], coords[i + 1])) return bearing(coords[i], coords[i + 1])
  }
  for (let i = Math.min(index, coords.length - 1); i > 0; i--) {
    if (!same(coords[i - 1], coords[i])) return bearing(coords[i - 1], coords[i])
  }
  return 0
}

function interpolate(stops: Track['stops'], x: number, from: 'mile' | 'time', to: 'mile' | 'time'): number {
  if (x <= stops[0][from]) return stops[0][to]
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]
    const b = stops[i]
    if (x <= b[from]) return a[to] + ((x - a[from]) / (b[from] - a[from])) * (b[to] - a[to])
  }
  return stops.at(-1)![to]
}

function distance(a: LngLat, b: LngLat): number {
  const dLat = (b[1] - a[1]) * RAD
  const dLng = (b[0] - a[0]) * RAD
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(h))
}

function bearing(a: LngLat, b: LngLat): number {
  const dLng = (b[0] - a[0]) * RAD
  const y = Math.sin(dLng) * Math.cos(b[1] * RAD)
  const x = Math.cos(a[1] * RAD) * Math.sin(b[1] * RAD) - Math.sin(a[1] * RAD) * Math.cos(b[1] * RAD) * Math.cos(dLng)
  return (Math.atan2(y, x) / RAD + 360) % 360
}

const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const same = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1]
