const RAD = Math.PI / 180
const DAY = 86_400_000
const J2000 = Date.UTC(2000, 0, 1, 12)

/** Elevation of the sun's center at sunrise and sunset, allowing for refraction and its radius. */
export const HORIZON = -0.833

export interface Waypoint {
  mile: number
  time: number
  lat: number
  lng: number
}

export interface SunEvent {
  kind: 'sunrise' | 'sunset'
  mile: number
  time: number
}

/** Degrees above the horizon (low-precision almanac formula, good to a few hundredths of a degree). */
export function solarElevation(time: number, lat: number, lng: number): number {
  const d = (time - J2000) / DAY
  const anomaly = (357.529 + 0.98560028 * d) * RAD
  const meanLongitude = 280.459 + 0.98564736 * d
  const longitude = (meanLongitude + 1.915 * Math.sin(anomaly) + 0.02 * Math.sin(2 * anomaly)) * RAD
  const tilt = (23.439 - 0.00000036 * d) * RAD
  const declination = Math.asin(Math.sin(tilt) * Math.sin(longitude))
  const rightAscension = Math.atan2(Math.cos(tilt) * Math.sin(longitude), Math.cos(longitude))
  const siderealDegrees = (18.697374558 + 24.06570982441908 * d) * 15
  const hourAngle = (siderealDegrees + lng) * RAD - rightAscension
  const sine =
    Math.sin(lat * RAD) * Math.sin(declination) + Math.cos(lat * RAD) * Math.cos(declination) * Math.cos(hourAngle)
  return Math.asin(sine) / RAD
}

/** Where along the way the sun rises or sets. */
export function sunCrossings(path: Waypoint[]): SunEvent[] {
  const events: SunEvent[] = []
  let previous = path[0] && solarElevation(path[0].time, path[0].lat, path[0].lng) - HORIZON
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const height = solarElevation(b.time, b.lat, b.lng) - HORIZON
    if (previous < 0 !== height < 0) {
      const t = previous / (previous - height)
      events.push({
        kind: height < 0 ? 'sunset' : 'sunrise',
        mile: a.mile + (b.mile - a.mile) * t,
        time: a.time + (b.time - a.time) * t,
      })
    }
    previous = height
  }
  return events
}
