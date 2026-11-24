import type { Checkpoint, CheckpointRisk, Heatmap, LngLat, Plan, Route, RouteSummary } from '../api/types'

const LEVELS = ['low', 'moderate', 'high', 'severe', 'no_travel'] as const
const LABELS = ['Low', 'Moderate', 'High', 'Severe', 'No Travel']

export function makeCheckpoint(over: Partial<Checkpoint> = {}): Checkpoint {
  const risk = over.risk ?? 'low'
  const level = LEVELS.indexOf(risk as (typeof LEVELS)[number])
  return {
    mile: 0,
    lat: 35,
    lng: -100,
    eta: '2026-11-24T12:00:00Z',
    segment_miles: 25,
    weather: risk === 'unknown' ? null : { wind_mph: 10, gust_mph: 15, rain_in_hr: 0, snow_in_hr: 0 },
    risk,
    risk_label: level < 0 ? 'Unknown' : LABELS[level],
    risk_level: level < 0 ? null : level,
    factors: [],
    ...over,
  }
}

/** A straight 100-mile route going west along 35°N at 50 mph, with a checkpoint every 25 miles. */
export function makeRoute(id = 'A', risks: CheckpointRisk[] = ['low', 'low', 'low', 'low', 'low']): Route {
  const milesPerDegree = 69.0937 * Math.cos((35 * Math.PI) / 180)
  const lngAt = (mile: number) => -100 - mile / milesPerDegree
  const departure = Date.parse('2026-11-24T12:00:00Z')
  const checkpoints = risks.map((risk, i) => {
    const mile = (100 / (risks.length - 1)) * i
    const edge = i === 0 || i === risks.length - 1
    return makeCheckpoint({
      mile,
      lng: lngAt(mile),
      eta: new Date(departure + (mile / 50) * 3_600_000).toISOString(),
      segment_miles: (100 / (risks.length - 1)) * (edge ? 0.5 : 1),
      risk,
    })
  })
  const milesAt = (risk: CheckpointRisk) =>
    checkpoints.filter((c) => c.risk === risk).reduce((sum, c) => sum + c.segment_miles, 0)
  const summary: RouteSummary = {
    miles_by_risk: Object.fromEntries(LEVELS.map((l) => [l, milesAt(l)])) as RouteSummary['miles_by_risk'],
    no_travel_miles: milesAt('no_travel'),
    severe_miles: milesAt('severe'),
    high_miles: milesAt('high'),
    unknown_miles: milesAt('unknown'),
    avg_risk: 0,
    worst_risk: [...LEVELS].reverse().find((l) => milesAt(l) > 0) ?? 'unknown',
  }
  return {
    id,
    name: `Route ${id}`,
    rank: id.charCodeAt(0) - 64,
    via: ['I-40', 'US-287'],
    distance_mi: 100,
    ferry_mi: 0,
    duration_min: 120,
    arrival_time: '2026-11-24T14:00:00Z',
    geometry: Array.from({ length: 101 }, (_, mile): LngLat => [lngAt(mile), 35]),
    summary,
    checkpoints,
  }
}

export function makePlan(over: Partial<Plan> = {}): Plan {
  return {
    id: '205748ff-07a5-4345-9931-4c627a26195c',
    origin: { label: 'Amarillo, TX, United States', lat: 35, lng: -100 },
    destination: { label: 'Tucumcari, NM, United States', lat: 35, lng: -101.77 },
    departure_time: '2026-11-24T12:00:00Z',
    load_weight_lb: 42_000,
    checkpoint_interval_mi: 25,
    recommended_route_id: 'A',
    recommendation: 'Shortest duration: 2 h vs 2 h 10 min on Route B.',
    advisory: null,
    routes: [makeRoute('A'), makeRoute('B', ['low', 'moderate', 'high', 'severe', 'unknown'])],
    ...over,
  }
}

export function makeHeatmap(over: Partial<Heatmap> = {}): Heatmap {
  return {
    plan_id: '205748ff-07a5-4345-9931-4c627a26195c',
    start: '2026-11-24T12:00:00Z',
    hours: 3,
    cell_size_deg: 0.2,
    cells: [[35, -100], [35.2, -100]],
    risk: [[0, 1, 4], [2, null, 0]],
    wind: [[10, 27.5, 60], [38, null, 5]],
    rain: [[0, 0, 0.5], [0, null, 0]],
    snow: [[0, 0, 0], [0.1, null, 0]],
    ...over,
  }
}
