import tzLookup from '@photostructure/tz-lookup'

const MINUTE = 60_000

export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export function zoneFor(lat: number, lng: number): string {
  return tzLookup(lat, lng)
}

/** Reads a datetime-local value ("2026-11-24T18:20") as wall clock time in a zone. */
export function zonedToUtc(value: string, zone: string): Date {
  const wall = Date.parse(`${value}Z`)
  if (Number.isNaN(wall)) return new Date(NaN)
  // The offset depends on the answer, so correct the first guess once.
  const guess = wall - offset(wall, zone)
  return new Date(wall - offset(guess, zone))
}

export function toZonedInput(when: Date, zone: string): string {
  return new Date(when.getTime() + offset(when.getTime(), zone)).toISOString().slice(0, 16)
}

export function formatTime(time: number, zone: string): string {
  return format(time, zone, { hour: 'numeric', minute: '2-digit' })
}

export function formatHour(time: number, zone: string): string {
  return format(time, zone, { hour: 'numeric' })
}

export function formatDay(time: number, zone: string): string {
  return format(time, zone, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatWeekday(time: number, zone: string): string {
  return format(time, zone, { weekday: 'short' })
}

export function zoneAbbr(time: number, zone: string): string {
  const parts = formatter(zone, { timeZoneName: 'short' }).formatToParts(time)
  return parts.find((p) => p.type === 'timeZoneName')!.value
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = Math.round(minutes % 60)
  return [hours > 0 && `${hours} h`, (rest > 0 || hours === 0) && `${rest} min`].filter(Boolean).join(' ')
}

function offset(time: number, zone: string): number {
  const parts = formatter(zone, {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(time)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'))
  return wall - Math.floor(time / MINUTE) * MINUTE
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(zone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = zone + JSON.stringify(options)
  let found = formatters.get(key)
  if (!found) formatters.set(key, (found = new Intl.DateTimeFormat('en-US', { ...options, timeZone: zone })))
  return found
}

function format(time: number, zone: string, options: Intl.DateTimeFormatOptions): string {
  return formatter(zone, options).format(time).replaceAll('\u202f', ' ')
}
