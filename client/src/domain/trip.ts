import type { ApiError } from '../api/client'
import type { Place, PlanRequest } from '../api/types'
import { browserZone, toZonedInput, zoneFor, zonedToUtc } from './time'

export const MAX_LOAD_LB = 80_000
export const INTERVALS = [10, 25, 50] as const

const HOUR = 3_600_000
const HALF_HOUR = HOUR / 2

/** Text in a place box, and the place it was matched to, if any. */
export interface PlaceValue {
  text: string
  place: Place | null
}

/** The planning form's contents. */
export interface Trip {
  origin: PlaceValue
  destination: PlaceValue
  /** Wall clock time at the origin, as a datetime-local value. */
  depart: string
  load: string
  interval: (typeof INTERVALS)[number]
}

export type TripField = 'origin' | 'destination' | 'depart' | 'load' | 'interval'
export type TripErrors = Partial<Record<TripField | 'form', string>>

const API_FIELDS: Record<string, TripField> = {
  origin: 'origin',
  destination: 'destination',
  departure_time: 'depart',
  load_weight_lb: 'load',
  checkpoint_interval_mi: 'interval',
}

export function emptyTrip(now = Date.now(), zone = browserZone()): Trip {
  return {
    origin: { text: '', place: null },
    destination: { text: '', place: null },
    depart: nextHalfHour(now, zone),
    load: '',
    interval: 25,
  }
}

export function nextHalfHour(now: number, zone: string): string {
  return toZonedInput(new Date(Math.ceil(now / HALF_HOUR) * HALF_HOUR), zone)
}

/** Departure is in the origin's local time, once the origin is known. */
export function departureZone(origin: Place | null): string {
  return origin ? zoneFor(origin.lat, origin.lng) : browserZone()
}

export function validateTrip(trip: Trip, now = Date.now()): TripErrors {
  const errors: TripErrors = {}
  if (!trip.origin.text.trim()) errors.origin = 'Enter where the trip starts.'
  if (!trip.destination.text.trim()) errors.destination = 'Enter where the trip ends.'
  const a = trip.origin.place
  const b = trip.destination.place
  if (a && b && a.lat === b.lat && a.lng === b.lng) errors.destination = 'Pick a destination different from the start.'

  const depart = zonedToUtc(trip.depart, departureZone(a)).getTime()
  if (Number.isNaN(depart)) errors.depart = 'Choose a departure time.'
  // Until the origin is matched to a place, its time zone isn't known.
  else if (a && (depart < now - HOUR || depart > now + 7 * 24 * HOUR)) {
    errors.depart = 'Departure can be from 1 hour ago to 7 days ahead.'
  }

  const load = parseLoad(trip.load)
  if (load === null) errors.load = 'Enter the load weight, or 0 if empty.'
  else if (load > MAX_LOAD_LB) errors.load = 'The most this can plan for is 80,000 lb.'
  return errors
}

export function toRequest(trip: Trip, origin: Place, destination: Place): PlanRequest {
  return {
    origin,
    destination,
    departure_time: zonedToUtc(trip.depart, departureZone(origin)).toISOString(),
    load_weight_lb: parseLoad(trip.load)!,
    checkpoint_interval_mi: trip.interval,
  }
}

export function errorsFromApi(error: ApiError): TripErrors {
  const errors: TripErrors = {}
  for (const [name, message] of Object.entries(error.fields)) errors[API_FIELDS[name] ?? 'form'] = message
  return Object.keys(errors).length > 0 ? errors : { form: error.message }
}

export function parseLoad(text: string): number | null {
  const digits = text.replace(/\D/g, '')
  return digits === '' ? null : Number(digits)
}

export function formatLoad(text: string): string {
  return parseLoad(text)?.toLocaleString('en-US') ?? ''
}
