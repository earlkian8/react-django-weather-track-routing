import { describe, expect, it } from 'vitest'
import { parseRoad } from './roads'

describe('parseRoad', () => {
  it.each([
    ['I-70', { kind: 'interstate', number: '70' }],
    ['I-35W', { kind: 'interstate', number: '35W' }],
    ['US-287', { kind: 'us', number: '287' }],
    ['US-87 N', { kind: 'us', number: '87' }],
    ['TX-114', { kind: 'badge', text: 'TX-114' }],
    ['E-470', { kind: 'badge', text: 'E-470' }],
    ['M1', { kind: 'badge', text: 'M1' }],
    ['A1(M)', { kind: 'badge', text: 'A1(M)' }],
    ['NH-48', { kind: 'badge', text: 'NH-48' }],
    ['BR-116', { kind: 'badge', text: 'BR-116' }],
    ['MEX-57D', { kind: 'badge', text: 'MEX-57D' }],
    ['E1 AH26', { kind: 'badge', text: 'E1 AH26' }],
    ['54', { kind: 'badge', text: '54' }],
    ['US-287-BR', { kind: 'badge', text: 'US-287-BR' }],
    ['25 de Mayo', { kind: 'named', name: '25 de Mayo' }],
    ['President George Bush Tpke', { kind: 'named', name: 'President George Bush Tpke' }],
  ])('reads %s', (text, expected) => {
    expect(parseRoad(text)).toEqual(expected)
  })
})
