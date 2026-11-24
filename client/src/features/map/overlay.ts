import type { FeatureCollection, LineString, Point } from 'geojson'
import type { GeoJSONSource, LayerSpecification, Map } from 'maplibre-gl'
import type { CheckpointRisk, Plan, Route } from '../../api/types'
import { riskSignMarkup } from '../../art/riskSignMarkup'
import type { Metric } from '../../domain/heat'
import { riskRuns, slice, type Track } from '../../domain/track'
import { cssVar } from '../../styles/cssVar'
import { SHIELD_ICONS } from './mapStyle'

const ICON_PX = 22
const SHIELD_PX = 25
const RISKS: CheckpointRisk[] = ['low', 'moderate', 'high', 'severe', 'no_travel', 'unknown']
const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] }

export const LAYERS = { alternatesHit: 'alternates-hit', checkpoints: 'checkpoints', heat: 'heat' }

const riskColor = () => ['match', ['get', 'risk'], ...RISKS.flatMap((r) => [r, cssVar(`--risk-${r}`)]), '#888'] as unknown as string

/** Adds everything drawn over the basemap. Runs again whenever the basemap is replaced. */
export async function installOverlay(map: Map, isCurrent: () => boolean) {
  await Promise.all([
    ...RISKS.map((risk) =>
      addSvg(
        map,
        `risk-${risk}`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">${
          risk === 'unknown' ? `<circle cx="12" cy="12" r="10" fill="${cssVar('--panel')}"/>` : ''
        }${riskSignMarkup(risk, cssVar(`--risk-${risk}`))}</svg>`,
        ICON_PX,
        isCurrent,
      ),
    ),
    ...Object.entries(SHIELD_ICONS).map(([name, svg]) => addSvg(map, name, svg, SHIELD_PX, isCurrent)),
  ])
  if (!isCurrent()) return

  for (const id of ['alternates', 'runs', 'checkpoints', 'heat']) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY })
  }
  const line = { 'line-cap': 'round', 'line-join': 'round' } as const
  const wide = (a: number, b: number) => ['interpolate', ['linear'], ['zoom'], 5, a, 11, b] as unknown as number
  const layers: LayerSpecification[] = [
    { id: LAYERS.heat, type: 'circle', source: 'heat', paint: heatPaint('risk', 0.3) },
    { id: 'alternates-edge', type: 'line', source: 'alternates', layout: line, paint: { 'line-color': cssVar('--map-halo'), 'line-width': wide(5, 8) } },
    { id: 'alternates', type: 'line', source: 'alternates', layout: line, paint: { 'line-color': cssVar('--map-alt'), 'line-width': wide(2.4, 4.5) } },
    { id: LAYERS.alternatesHit, type: 'line', source: 'alternates', paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 20 } },
    { id: 'route-edge', type: 'line', source: 'runs', layout: line, paint: { 'line-color': cssVar('--asphalt-deep'), 'line-width': wide(8.5, 14) } },
    { id: 'route-gap', type: 'line', source: 'runs', layout: line, paint: { 'line-color': '#fff', 'line-width': wide(6, 10.5) } },
    { id: 'route', type: 'line', source: 'runs', filter: ['!=', ['get', 'risk'], 'unknown'], layout: { 'line-join': 'round' }, paint: { 'line-color': riskColor(), 'line-width': wide(4.6, 8.5) } },
    { id: 'route-unknown', type: 'line', source: 'runs', filter: ['==', ['get', 'risk'], 'unknown'], paint: { 'line-color': cssVar('--risk-unknown'), 'line-width': wide(4.6, 8.5), 'line-dasharray': [0.5, 0.5] } },
    {
      id: LAYERS.checkpoints,
      type: 'symbol',
      source: 'checkpoints',
      layout: {
        'icon-image': ['concat', 'risk-', ['get', 'risk']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 7, 0.95],
        'icon-padding': 1,
        // The worst checkpoint wins where they crowd each other.
        'symbol-sort-key': ['-', ['get', 'level']],
      },
    },
  ]
  for (const layer of layers) if (!map.getLayer(layer.id)) map.addLayer(layer, layer.id === LAYERS.heat ? 'state-line' : undefined)
}

export function showRoutes(map: Map, plan: Plan, route: Route, track: Track) {
  const alternates: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: plan.routes
      .filter((r) => r.id !== route.id)
      .map((r) => ({ type: 'Feature', properties: { id: r.id }, geometry: { type: 'LineString', coordinates: r.geometry } })),
  }
  const runs: FeatureCollection<LineString> = {
    type: 'FeatureCollection',
    features: riskRuns(route).map((run) => ({
      type: 'Feature',
      properties: { risk: run.risk },
      geometry: { type: 'LineString', coordinates: slice(track, run.from, run.to) },
    })),
  }
  const checkpoints: FeatureCollection<Point> = {
    type: 'FeatureCollection',
    features: route.checkpoints.map((c, index) => ({
      type: 'Feature',
      properties: { index, risk: c.risk, level: c.risk_level ?? 1 },
      geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
    })),
  }
  setData(map, 'alternates', alternates)
  setData(map, 'runs', runs)
  setData(map, 'checkpoints', checkpoints)
}

export function showHeat(map: Map, data: FeatureCollection | null, metric: Metric, stepDeg: number) {
  setData(map, 'heat', data ?? EMPTY)
  if (!map.getLayer(LAYERS.heat)) return
  for (const [name, value] of Object.entries(heatPaint(metric, stepDeg))) {
    map.setPaintProperty(LAYERS.heat, name as keyof ReturnType<typeof heatPaint>, value)
  }
}

/** A dot screen: each grid cell is a dot that fills out as conditions near the No Travel limit. */
function heatPaint(metric: Metric, stepDeg: number) {
  // A degree spans 512 * 2^zoom / 360 px; dots touch at a little under half a cell.
  const cellAt = (zoom: number) => ((512 * 2 ** zoom) / 360) * stepDeg
  const radius = (zoom: number) => ['*', cellAt(zoom) * 0.5, ['interpolate', ['linear'], ['get', 'strength'], 0, 0.14, 0.25, 0.5, 1, 1]]
  return {
    'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 2, radius(2), 14, radius(14)] as unknown as number,
    'circle-color': metric === 'risk' ? riskColor() : cssVar(`--metric-${metric}`),
    'circle-opacity': metric === 'risk' ? 0.62 : (['interpolate', ['linear'], ['get', 'strength'], 0, 0.3, 0.5, 0.72] as unknown as number),
  }
}

function setData(map: Map, id: string, data: FeatureCollection) {
  map.getSource<GeoJSONSource>(id)?.setData(data)
}

async function addSvg(map: Map, name: string, svg: string, size: number, isCurrent: () => boolean) {
  const image = new Image()
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await image.decode()
  const pixels = 2 * size
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = pixels
  const context = canvas.getContext('2d')!
  context.drawImage(image, 0, 0, pixels, pixels)
  if (!isCurrent()) return
  if (map.hasImage(name)) map.removeImage(name)
  map.addImage(name, context.getImageData(0, 0, pixels, pixels), { pixelRatio: 2 })
}
