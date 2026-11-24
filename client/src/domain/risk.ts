import type { CheckpointRisk, RiskKey, RouteSummary } from '../api/types'

export interface RiskLevel {
  level: number
  key: RiskKey
  label: string
}

export const RISKS: readonly RiskLevel[] = [
  { level: 0, key: 'low', label: 'Low' },
  { level: 1, key: 'moderate', label: 'Moderate' },
  { level: 2, key: 'high', label: 'High' },
  { level: 3, key: 'severe', label: 'Severe' },
  { level: 4, key: 'no_travel', label: 'No Travel' },
]

const LABELS: Record<CheckpointRisk, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
  unknown: 'No forecast',
}

/** Wind speeds (mph) at which the empty-truck risk goes up a level. */
export const WIND_STEPS = [25, 35, 45, 55] as const

export function riskLabel(risk: CheckpointRisk): string {
  return LABELS[risk]
}

export function riskForLevel(level: number | null): CheckpointRisk {
  return level === null ? 'unknown' : RISKS[level].key
}

export function describeRisk(summary: RouteSummary): string {
  const risky = RISKS.slice(1)
    .reverse()
    .filter((r) => summary.miles_by_risk[r.key] > 0)
    .map((r) => `${formatMiles(summary.miles_by_risk[r.key])} ${r.label}`)
  const unknown = summary.unknown_miles > 0 ? `${formatMiles(summary.unknown_miles)} without a forecast` : null

  if (risky.length === 0 && unknown) {
    return summary.miles_by_risk.low > 0 ? `Low risk where known, ${unknown}` : 'No forecast for this route'
  }
  if (risky.length === 0) return 'Low risk all the way'
  return [...risky, ...(unknown ? [unknown] : [])].join(', ')
}

export function totalMilesAtRisk(summary: RouteSummary): number {
  return summary.high_miles + summary.severe_miles + summary.no_travel_miles
}

/** Whole miles, except below 1 where rounding would hide the stretch. */
export function formatMiles(miles: number): string {
  return `${(miles < 1 ? miles : Math.round(miles)).toLocaleString('en-US')} mi`
}
