import { describe, expect, it } from 'vitest'
import { makeRoute } from '../test/fixtures'
import { RISKS, describeRisk, riskForLevel, totalMilesAtRisk } from './risk'

describe('RISKS', () => {
  it('lists the five levels from safest to worst, matching the API levels', () => {
    expect(RISKS.map((r) => [r.level, r.key, r.label])).toEqual([
      [0, 'low', 'Low'],
      [1, 'moderate', 'Moderate'],
      [2, 'high', 'High'],
      [3, 'severe', 'Severe'],
      [4, 'no_travel', 'No Travel'],
    ])
  })
})

describe('riskForLevel', () => {
  it('maps API levels to keys and a missing level to unknown', () => {
    expect(riskForLevel(3)).toBe('severe')
    expect(riskForLevel(0)).toBe('low')
    expect(riskForLevel(null)).toBe('unknown')
  })
})

describe('describeRisk', () => {
  const summary = (over: object) => ({ ...makeRoute().summary, ...over })
  const miles = (over: object) => ({ low: 0, moderate: 0, high: 0, severe: 0, no_travel: 0, ...over })

  it('says so when every mile is low', () => {
    expect(describeRisk(summary({ miles_by_risk: miles({ low: 100 }), unknown_miles: 0 }))).toBe('Low risk all the way')
  })

  it('lists miles above Low, worst first, rounded', () => {
    const s = summary({ miles_by_risk: miles({ low: 10, moderate: 62.4, high: 12.5, no_travel: 3.2 }), unknown_miles: 0 })
    expect(describeRisk(s)).toBe('3 mi No Travel, 13 mi High, 62 mi Moderate')
  })

  it('never rounds a short stretch down to nothing', () => {
    expect(describeRisk(summary({ miles_by_risk: miles({ low: 99, severe: 0.3 }), unknown_miles: 0 }))).toBe('0.3 mi Severe')
  })

  it('always mentions miles without a forecast', () => {
    expect(describeRisk(summary({ miles_by_risk: miles({ low: 75 }), unknown_miles: 25 }))).toBe(
      'Low risk where known, 25 mi without a forecast',
    )
    expect(describeRisk(summary({ miles_by_risk: miles({ high: 20 }), unknown_miles: 25 }))).toBe(
      '20 mi High, 25 mi without a forecast',
    )
  })

  it('does not claim low risk when nothing is known', () => {
    expect(describeRisk(summary({ miles_by_risk: miles({}), unknown_miles: 100 }))).toBe('No forecast for this route')
  })
})

describe('totalMilesAtRisk', () => {
  it('adds High, Severe and No Travel miles', () => {
    const s = { ...makeRoute().summary, high_miles: 10, severe_miles: 5, no_travel_miles: 1 }
    expect(totalMilesAtRisk(s)).toBe(16)
  })
})
