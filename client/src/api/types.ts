/** Shapes returned by the Django API. Times are UTC ISO 8601 strings. */

export type RiskKey = 'low' | 'moderate' | 'high' | 'severe' | 'no_travel'
export type CheckpointRisk = RiskKey | 'unknown'

/** [lng, lat], as GeoJSON orders it. */
export type LngLat = [lng: number, lat: number]

export interface Place {
  label: string
  lat: number
  lng: number
}

export interface PlanRequest {
  origin: string | Place
  destination: string | Place
  departure_time: string
  load_weight_lb: number
  checkpoint_interval_mi: number
}

export interface CheckpointWeather {
  wind_mph: number
  gust_mph: number | null
  rain_in_hr: number
  snow_in_hr: number
}

export interface Checkpoint {
  mile: number
  lat: number
  lng: number
  eta: string
  segment_miles: number
  weather: CheckpointWeather | null
  risk: CheckpointRisk
  risk_label: string
  risk_level: number | null
  factors: string[]
}

export interface RouteSummary {
  miles_by_risk: Record<RiskKey, number>
  no_travel_miles: number
  severe_miles: number
  high_miles: number
  unknown_miles: number
  avg_risk: number | null
  worst_risk: CheckpointRisk
}

export interface Route {
  id: string
  name: string
  rank: number
  via: string[]
  distance_mi: number
  ferry_mi: number
  duration_min: number
  arrival_time: string
  geometry: LngLat[]
  summary: RouteSummary
  checkpoints: Checkpoint[]
}

export interface Plan {
  id: string
  origin: Place
  destination: Place
  departure_time: string
  load_weight_lb: number
  checkpoint_interval_mi: number
  recommended_route_id: string
  recommendation: string
  advisory: string | null
  routes: Route[]
}

type Grid = (number | null)[][]

export interface Heatmap {
  plan_id: string
  start: string
  hours: number
  cell_size_deg: number
  cells: [lat: number, lng: number][]
  risk: Grid
  wind: Grid
  rain: Grid
  snow: Grid
}
