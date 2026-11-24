import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import { emptyTrip, errorsFromApi, formatLoad, parseLoad, toRequest, validateTrip, type Trip } from './trip'

const NOW = Date.parse('2026-11-24T12:00:00Z')
const DALLAS = { label: 'Dallas, TX, United States', lat: 32.78, lng: -96.8 }
const DENVER = { label: 'Denver, CO, United States', lat: 39.74, lng: -104.99 }

function trip(over: Partial<Trip> = {}): Trip {
  return {
    origin: { text: DALLAS.label, place: DALLAS },
    destination: { text: DENVER.label, place: DENVER },
    depart: '2026-11-24T08:00',
    load: '42,000',
    interval: 25,
    ...over,
  }
}

describe('validateTrip', () => {
  it('accepts a complete trip', () => {
    expect(validateTrip(trip(), NOW)).toEqual({})
  })

  it('accepts typed text that was never picked from the list', () => {
    expect(validateTrip(trip({ origin: { text: 'Dallas', place: null } }), NOW)).toEqual({})
  })

  it('asks for each missing field', () => {
    const errors = validateTrip(
      { origin: { text: ' ', place: null }, destination: { text: '', place: null }, depart: '', load: '', interval: 25 },
      NOW,
    )
    expect(errors).toEqual({
      origin: 'Enter where the trip starts.',
      destination: 'Enter where the trip ends.',
      depart: 'Choose a departure time.',
      load: 'Enter the load weight, or 0 if empty.',
    })
  })

  it('applies the departure limits in the origin time zone', () => {
    // 12:00Z is 6:00 AM in Dallas.
    expect(validateTrip(trip({ depart: '2026-11-24T05:00' }), NOW)).toEqual({})
    expect(validateTrip(trip({ depart: '2026-11-24T04:59' }), NOW)).toEqual({
      depart: 'Departure can be from 1 hour ago to 7 days ahead.',
    })
    expect(validateTrip(trip({ depart: '2026-12-01T06:00' }), NOW)).toEqual({})
    expect(validateTrip(trip({ depart: '2026-12-01T06:01' }), NOW)).toHaveProperty('depart')
  })

  it('keeps the load between 0 and 80,000 lb', () => {
    expect(validateTrip(trip({ load: '0' }), NOW)).toEqual({})
    expect(validateTrip(trip({ load: '80,000' }), NOW)).toEqual({})
    expect(validateTrip(trip({ load: '80,001' }), NOW)).toEqual({ load: 'The most this can plan for is 80,000 lb.' })
  })

  it('rejects a trip to the same place', () => {
    expect(validateTrip(trip({ destination: { text: DALLAS.label, place: DALLAS } }), NOW)).toEqual({
      destination: 'Pick a destination different from the start.',
    })
  })
})

describe('toRequest', () => {
  it('sends resolved places and a UTC departure', () => {
    expect(toRequest(trip(), DALLAS, DENVER)).toEqual({
      origin: DALLAS,
      destination: DENVER,
      departure_time: '2026-11-24T14:00:00.000Z',
      load_weight_lb: 42_000,
      checkpoint_interval_mi: 25,
    })
  })
})

describe('emptyTrip', () => {
  it('leaves at the next half hour', () => {
    expect(emptyTrip(Date.parse('2026-11-24T12:10:00Z'), 'America/Chicago').depart).toBe('2026-11-24T06:30')
    expect(emptyTrip(Date.parse('2026-11-24T12:30:00Z'), 'America/Chicago').depart).toBe('2026-11-24T06:30')
  })
})

describe('load text', () => {
  it('parses and formats', () => {
    expect(parseLoad('42,000')).toBe(42_000)
    expect(parseLoad('')).toBeNull()
    expect(formatLoad('0042000 lb')).toBe('42,000')
    expect(formatLoad('')).toBe('')
    expect(formatLoad('0')).toBe('0')
  })
})

describe('errorsFromApi', () => {
  it('maps API field names to form fields', () => {
    const error = new ApiError(400, 'Invalid', {
      origin: 'No place found for "qq".',
      departure_time: 'Must be between 1 hour ago and 7 days from now.',
      load_weight_lb: 'Too heavy',
    })
    expect(errorsFromApi(error)).toEqual({
      origin: 'No place found for "qq".',
      depart: 'Must be between 1 hour ago and 7 days from now.',
      load: 'Too heavy',
    })
  })

  it('puts everything else on the form as a whole', () => {
    expect(errorsFromApi(new ApiError(502, 'HERE Geocoding returned HTTP 401', {}))).toEqual({
      form: 'HERE Geocoding returned HTTP 401',
    })
    expect(errorsFromApi(new ApiError(400, 'No truck route found between these places.', {}))).toEqual({
      form: 'No truck route found between these places.',
    })
  })
})
