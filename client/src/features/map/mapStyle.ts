import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { cssVar } from '../../styles/cssVar'

const TILES = 'https://tiles.openfreemap.org'
const REGULAR = ['Noto Sans Regular']
const BOLD = ['Noto Sans Bold']
const ITALIC = ['Noto Sans Italic']

const NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name']]

const byZoom = (...stops: number[]): ExpressionSpecification => ['interpolate', ['exponential', 1.4], ['zoom'], ...stops]

/** A quiet road-atlas basemap in the page's own colors, over OpenFreeMap vector tiles. */
export function baseStyle(): StyleSpecification {
  const c = (token: string) => cssVar(`--map-${token}`)
  const source = 'omt'

  const roads = (id: string, classes: string[], minzoom: number, widths: number[]): LayerSpecification[] => {
    const filter: ExpressionSpecification = ['in', ['get', 'class'], ['literal', classes]]
    const line = { type: 'line', source, 'source-layer': 'transportation', minzoom, filter, layout: { 'line-cap': 'round', 'line-join': 'round' } } as const
    return [
      { ...line, id: `${id}-edge`, paint: { 'line-color': c('road-edge'), 'line-width': byZoom(...widths.map((w, i) => (i % 2 ? w + 1.6 : w))) } },
      { ...line, id, paint: { 'line-color': c('road'), 'line-width': byZoom(...widths) } },
    ]
  }

  const label = (id: string, filter: ExpressionSpecification, over: object, paint: object = {}): LayerSpecification =>
    ({
      id,
      type: 'symbol',
      source,
      'source-layer': 'place',
      filter,
      layout: { 'text-field': NAME, 'text-font': REGULAR, 'text-max-width': 8, ...over },
      paint: { 'text-color': c('ink'), 'text-halo-color': c('halo'), 'text-halo-width': 1.6, ...paint },
    }) as LayerSpecification

  return {
    version: 8,
    glyphs: `${TILES}/fonts/{fontstack}/{range}.pbf`,
    sources: { [source]: { type: 'vector', url: `${TILES}/planet` } },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': c('land') } },
      { id: 'wood', type: 'fill', source, 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': c('wood'), 'fill-opacity': 0.8 } },
      { id: 'park', type: 'fill', source, 'source-layer': 'park', paint: { 'fill-color': c('park'), 'fill-opacity': 0.7 } },
      { id: 'water', type: 'fill', source, 'source-layer': 'water', paint: { 'fill-color': c('water') } },
      { id: 'river', type: 'line', source, 'source-layer': 'waterway', minzoom: 6, filter: ['==', ['get', 'class'], 'river'], paint: { 'line-color': c('water'), 'line-width': byZoom(6, 0.6, 12, 2) } },
      ...roads('minor', ['minor', 'tertiary', 'secondary'], 10, [10, 0.4, 14, 3]),
      ...roads('primary', ['primary'], 7, [7, 0.5, 14, 5]),
      ...roads('trunk', ['trunk'], 5, [5, 0.5, 8, 1.4, 14, 6]),
      ...roads('motorway', ['motorway'], 4, [4, 0.7, 8, 2, 14, 8]),
      {
        id: 'state-line', type: 'line', source, 'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': c('border'), 'line-width': byZoom(3, 0.8, 8, 1.8), 'line-dasharray': [5, 2, 1, 2] },
      },
      {
        id: 'country-line', type: 'line', source, 'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': c('border'), 'line-width': byZoom(3, 1.4, 8, 3) },
      },
      {
        id: 'water-name', type: 'symbol', source, 'source-layer': 'water_name',
        layout: { 'text-field': NAME, 'text-font': ITALIC, 'text-size': 12, 'text-max-width': 6 },
        paint: { 'text-color': c('water-ink'), 'text-halo-color': c('water'), 'text-halo-width': 1 },
      },
      {
        id: 'road-number', type: 'symbol', source, 'source-layer': 'transportation_name', minzoom: 7,
        filter: ['all', ['has', 'ref'], ['in', ['get', 'class'], ['literal', ['motorway', 'trunk']]], ['!', ['in', ['get', 'network'], ['literal', ['us-interstate', 'us-highway']]]]],
        layout: { 'symbol-placement': 'line', 'symbol-spacing': 380, 'text-rotation-alignment': 'viewport', 'text-field': ['get', 'ref'], 'text-font': BOLD, 'text-size': 11, 'text-padding': 12 },
        paint: { 'text-color': c('ink-2'), 'text-halo-color': c('halo'), 'text-halo-width': 2 },
      },
      ...shields(source),
      label('town', ['in', ['get', 'class'], ['literal', ['town', 'village']]], {
        'text-size': byZoom(8, 11, 14, 15), 'symbol-sort-key': ['get', 'rank'],
      }, { 'text-color': c('ink-2') }),
      label('state', ['==', ['get', 'class'], 'state'], {
        'text-size': byZoom(4, 11, 7, 17), 'text-font': ITALIC, 'text-letter-spacing': 0.08,
      }, { 'text-color': c('ink-2'), 'text-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.85, 8.5, 0] }),
      label('city', ['==', ['get', 'class'], 'city'], {
        'text-font': BOLD, 'text-size': byZoom(4, 11, 10, 19), 'symbol-sort-key': ['get', 'rank'],
      }),
    ],
  }
}

function shields(source: string): LayerSpecification[] {
  const layer = (id: string, network: string, minzoom: number, color: string): LayerSpecification => ({
    id,
    type: 'symbol',
    source,
    'source-layer': 'transportation_name',
    minzoom,
    filter: ['all', ['==', ['get', 'network'], network], ['<=', ['get', 'ref_length'], 3]],
    layout: {
      'symbol-placement': ['step', ['zoom'], 'point', 7, 'line'],
      'symbol-spacing': 380,
      'icon-image': network,
      'icon-rotation-alignment': 'viewport',
      'text-rotation-alignment': 'viewport',
      'text-field': ['get', 'ref'],
      'text-font': BOLD,
      'text-size': 9.5,
      'text-offset': [0, network === 'us-interstate' ? 0.22 : 0],
      'icon-padding': 12,
    },
    paint: { 'text-color': color },
  })
  return [layer('us-shield', 'us-highway', 7, '#14191c'), layer('interstate-shield', 'us-interstate', 5, '#ffffff')]
}

const INTERSTATE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="-2 -1 52 50">
  <path d="M5 9C12 11 18 9 24 4c6 5 12 7 19 5 4.600 11.600 2.400 27.500-19 37C2.600 36.500.4 20.600 5 9Z" fill="#17407c" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
  <path d="M5 9C12 11 18 9 24 4c6 5 12 7 19 5 .7 1.700 1.200 3.500 1.600 5.500H3.400C3.800 12.500 4.300 10.700 5 9Z" fill="#b4232f"/></svg>`
const US_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
  <path d="M9 3.500c4 3.600 10 3.600 15 .8 5 2.800 11 2.800 15-.8l6 6.300c-3.700 6.500.3 11.600.3 17.700C45.300 38 33 39.800 24 45 15 39.800 2.700 38 2.700 27.500c0-6.100 4-11.200.3-17.700Z" fill="#fff" stroke="#14191c" stroke-width="2.500" stroke-linejoin="round"/></svg>`

export const SHIELD_ICONS = { 'us-interstate': INTERSTATE_ICON, 'us-highway': US_ICON }
