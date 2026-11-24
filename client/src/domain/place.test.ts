import { describe, expect, it } from 'vitest'
import { isInUS, matchPlace, placeName, tripTitle } from './place'

const at = (label: string) => ({ label, lat: 1, lng: 2 })
const PARIS = [at('Paris, Île-de-France, France'), at('Paris, TX, United States')]

describe('matchPlace', () => {
  it('accepts the only result', () => {
    expect(matchPlace('denver', [at('Denver, CO, United States')])?.label).toBe('Denver, CO, United States')
  })

  it('accepts text that only one label starts with, ignoring case and spacing', () => {
    expect(matchPlace('  paris,  tx ', PARIS)?.label).toBe('Paris, TX, United States')
    expect(matchPlace('Paris, Île-de-France, France', PARIS)?.label).toBe('Paris, Île-de-France, France')
  })

  it('reads text without its accents', () => {
    expect(matchPlace('paris, ile-de-france', PARIS)?.label).toBe('Paris, Île-de-France, France')
  })

  it('refuses to guess between places', () => {
    expect(matchPlace('Paris', PARIS)).toBeNull()
  })

  it('matches whole parts of a label, not the start of a longer name', () => {
    const places = [at('Dallas, TX, United States'), at('Dallastown, PA, United States')]
    expect(matchPlace('Dallas', places)?.label).toBe('Dallas, TX, United States')
  })

  it('refuses when several results come back and none starts with the text', () => {
    expect(matchPlace('Manila, Philippines', [at('Manila, AR, United States'), at('Manila, UT, United States')])).toBeNull()
  })
})

describe('tripTitle', () => {
  it('drops a country both places share', () => {
    expect(tripTitle('Dallas, TX, United States', 'Denver, CO, United States')).toBe('Dallas, TX to Denver, CO')
  })

  it('keeps countries that differ, and places that are only a country', () => {
    expect(tripTitle('London, England, United Kingdom', 'Paris, Île-de-France, France')).toBe(
      'London, England, United Kingdom to Paris, Île-de-France, France',
    )
    expect(tripTitle('Singapore', 'Singapore')).toBe('Singapore to Singapore')
  })
})

describe('isInUS', () => {
  it('reads the country from the label', () => {
    expect(isInUS(at('Dallas, TX, United States'))).toBe(true)
    expect(isInUS(at('Manila, Philippines'))).toBe(false)
    expect(isInUS(null)).toBe(false)
  })
})

describe('placeName', () => {
  it('is the first part of the label', () => {
    expect(placeName('Cebu City, Central Visayas, Philippines')).toBe('Cebu City')
  })
})
