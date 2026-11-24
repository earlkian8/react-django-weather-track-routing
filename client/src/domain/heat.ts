import type { FeatureCollection, Point } from 'geojson'
import type { CheckpointRisk, Heatmap } from '../api/types'
import { RISKS, riskForLevel } from './risk'

export type Metric = 'risk' | 'wind' | 'rain' | 'snow'

export interface HeatCell {
  cell: number
  risk: CheckpointRisk
  /** 0 to 1: how close to the No Travel limit. */
  strength: number
}

export interface HourSummary {
  worst: CheckpointRisk
  /** Share of cells with data at each risk level. */
  shares: number[]
}

const HOUR = 3_600_000

/** The value at which each metric reaches No Travel. */
const LIMITS: Record<Metric, number> = { risk: 4, wind: 55, rain: 1, snow: 3 }

/** Like checkpoints, uses the first hour mark at or after the time. */
export function hourIndexAt(heat: Heatmap, time: number): number | null {
  const index = Math.ceil((time - Date.parse(heat.start)) / HOUR)
  return time >= Date.parse(heat.start) && index < heat.hours ? index : null
}

export function heatFeatures(heat: Heatmap, hour: number, metric: Metric): FeatureCollection<Point, HeatCell> {
  const features: FeatureCollection<Point, HeatCell>['features'] = []
  heat.cells.forEach(([lat, lng], cell) => {
    const value = heat[metric][cell][hour]
    if (value === null) return
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        cell,
        risk: riskForLevel(heat.risk[cell][hour]),
        strength: Math.min(1, value / LIMITS[metric]),
      },
    })
  })
  return { type: 'FeatureCollection', features }
}

export function hourSummaries(heat: Heatmap): HourSummary[] {
  return Array.from({ length: heat.hours }, (_, hour) => {
    const levels = heat.risk.map((cell) => cell[hour]).filter((level) => level !== null)
    const counts = RISKS.map((r) => levels.filter((level) => level === r.level).length)
    return {
      worst: riskForLevel(levels.length ? Math.max(...levels) : null),
      shares: counts.map((count) => (levels.length ? count / levels.length : 0)),
    }
  })
}
