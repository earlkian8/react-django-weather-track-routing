import { describe, expect, it } from 'vitest'
import { parseRoad } from './roads'

describe('parseRoad', () => {
  it.each([
    ['I-70', { kind: 'interstate', number: '70' }],
    ['I-35W', { kind: 'interstate', number: '35W' }],
    ['US-287', { kind: 'us', number: '287' }],
    ['US-87 N', { kind: 'us', number: '87' }],
    ['TX-114', { kind: 'state', number: '114', state: 'TX' }],
    ['E-470', { kind: 'named', name: 'E-470' }],
    ['President George Bush Tpke', { kind: 'named', name: 'President George Bush Tpke' }],
  ])('reads %s', (text, expected) => {
    expect(parseRoad(text)).toEqual(expected)
  })
})
