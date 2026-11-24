import { describe, expect, it } from 'vitest'
import { formatDuration, formatTime, formatDay, toZonedInput, zoneAbbr, zoneFor, zonedToUtc } from './time'

describe('zoneFor', () => {
  it('finds the zone at a place', () => {
    expect(zoneFor(32.78, -96.8)).toBe('America/Chicago')
    expect(zoneFor(39.74, -104.99)).toBe('America/Denver')
  })
})

describe('zonedToUtc', () => {
  it('reads a wall clock time in the given zone', () => {
    expect(zonedToUtc('2026-11-24T18:20', 'America/Chicago').toISOString()).toBe('2026-11-25T00:20:00.000Z')
    expect(zonedToUtc('2026-07-04T08:00', 'America/Denver').toISOString()).toBe('2026-07-04T14:00:00.000Z')
  })

  it('handles both sides of a clock change', () => {
    expect(zonedToUtc('2026-11-01T00:30', 'America/Chicago').toISOString()).toBe('2026-11-01T05:30:00.000Z')
    expect(zonedToUtc('2026-11-01T03:30', 'America/Chicago').toISOString()).toBe('2026-11-01T09:30:00.000Z')
    expect(zonedToUtc('2026-03-08T03:30', 'America/Chicago').toISOString()).toBe('2026-03-08T08:30:00.000Z')
  })

  it('gives an invalid date for an empty value', () => {
    expect(zonedToUtc('', 'America/Chicago').getTime()).toBeNaN()
  })
})

describe('toZonedInput', () => {
  it('is the inverse of zonedToUtc', () => {
    const when = new Date('2026-11-25T00:20:00Z')
    expect(toZonedInput(when, 'America/Chicago')).toBe('2026-11-24T18:20')
    expect(toZonedInput(new Date('2026-11-25T06:05:00Z'), 'America/Chicago')).toBe('2026-11-25T00:05')
  })
})

describe('formatting', () => {
  const when = Date.parse('2026-11-25T00:20:00Z')
  it('shows local time, day and zone', () => {
    expect(formatTime(when, 'America/Chicago')).toBe('6:20 PM')
    expect(formatDay(when, 'America/Chicago')).toBe('Tue, Nov 24')
    expect(zoneAbbr(when, 'America/Chicago')).toBe('CST')
    expect(zoneAbbr(Date.parse('2026-07-04T12:00:00Z'), 'America/Denver')).toBe('MDT')
  })

  it('shows durations in hours and minutes', () => {
    expect(formatDuration(734)).toBe('12 h 14 min')
    expect(formatDuration(120)).toBe('2 h')
    expect(formatDuration(45)).toBe('45 min')
  })
})
