import { useQuery } from '@tanstack/react-query'
import { AttributionControl, Map as MapLibre, Marker, NavigationControl, Popup, setWorkerUrl, LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { Maximize } from 'lucide-react'
import { useMotionValueEvent } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchHeatmap } from '../../api/client'
import type { Plan, Route } from '../../api/types'
import { placeName } from '../../domain/place'
import { heatFeatures, hourIndexAt, type Metric } from '../../domain/heat'
import { formatDuration } from '../../domain/time'
import { buildTrack, pointAt, type Track } from '../../domain/track'
import { useTheme } from '../../state/theme'
import type { Drive } from '../../state/useDrive'
import { useDerived } from '../../state/useDerived'
import { CheckpointTip, HeatTip } from './tips'
import { baseStyle } from './mapStyle'
import { installOverlay, LAYERS, showHeat, showRoutes } from './overlay'
import { TruckTop } from './TruckTop'
import { WeatherPanel } from './WeatherPanel'
import styles from './RouteMap.module.css'

setWorkerUrl(workerUrl)

/** Leaves room for the layer switch, the place signs and the hours panel. */
const FIT = { padding: { top: 118, right: 70, bottom: 50, left: 60 } }
const FIT_ABOVE_HOURS = { padding: { ...FIT.padding, bottom: 146 } }

interface Props {
  plan: Plan
  route: Route
  track: Track
  drive: Drive
  onSelectRoute: (id: string) => void
}

type Hover = { kind: 'checkpoint' | 'cell'; index: number }

export default function RouteMap({ plan, route, track, drive, onSelectRoute }: Props) {
  const theme = useTheme()
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibre | null>(null)
  /** Counts finished overlay installs, so data is set again after a style change. */
  const [ready, setReady] = useState(0)
  const [drawable] = useState(hasWebGL)
  const [metric, setMetric] = useState<Metric | null>(null)
  const drawnTheme = useRef(theme)
  const [hover, setHover] = useState<Hover | null>(null)

  const heat = useQuery({
    queryKey: ['heatmap', plan.id],
    queryFn: ({ signal }) => fetchHeatmap(plan.id, signal),
    enabled: metric !== null,
    staleTime: Infinity,
    retry: false,
  })
  const hour = useDerived(
    drive.clock,
    useCallback((time: number) => (heat.data ? hourIndexAt(heat.data, time) : null), [heat.data]),
  )

  useEffect(() => {
    if (!drawable) return
    const created = new MapLibre({
      container: container.current!,
      style: baseStyle(),
      bounds: boundsOf(plan),
      fitBoundsOptions: FIT,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      minZoom: 2.5,
      maxZoom: 15,
    })
    created.touchZoomRotate.disableRotation()
    created.addControl(new AttributionControl({ compact: true }), 'bottom-right')
    created.addControl(new NavigationControl({ showCompass: false }), 'top-right')
    setMap(created)
    return () => {
      setMap(null)
      created.remove()
    }
    // One map per plan; everything else is pushed into it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.id])

  // Basemap and overlay, in the current colors.
  useEffect(() => {
    if (!map) return
    let current = true
    const install = async () => {
      await installOverlay(map, () => current)
      if (current) setReady((n) => n + 1)
    }
    if (drawnTheme.current !== theme) {
      drawnTheme.current = theme
      map.setStyle(baseStyle(), { diff: false })
    }
    if (map.getStyle()) install()
    else map.once('style.load', install)
    return () => {
      current = false
      map.off('style.load', install)
    }
  }, [map, theme])

  useEffect(() => {
    if (map && ready) showRoutes(map, plan, route, track)
  }, [map, ready, plan, route, track])

  useEffect(() => {
    if (!map || !ready) return
    const data = heat.data && metric && hour !== null ? heatFeatures(heat.data, hour, metric) : null
    showHeat(map, data, metric ?? 'risk', heat.data?.cell_size_deg ?? 0.3)
  }, [map, ready, heat.data, metric, hour])

  useEffect(() => {
    if (!map || !ready) return
    const canvas = map.getCanvas()
    const subscriptions = [
      map.on('click', LAYERS.alternatesHit, (e) => onSelectRoute(e.features![0].properties.id)),
      map.on('click', LAYERS.checkpoints, (e) => drive.seek(route.checkpoints[e.features![0].properties.index].mile, true)),
      map.on('mousemove', (e) => {
        const layers = [LAYERS.checkpoints, LAYERS.alternatesHit, LAYERS.heat].filter((id) => map.getLayer(id))
        const hits = map.queryRenderedFeatures(e.point, { layers })
        const top = (id: string) => hits.find((f) => f.layer.id === id)
        const checkpoint = top(LAYERS.checkpoints)
        const cell = top(LAYERS.heat)
        canvas.style.cursor = checkpoint || top(LAYERS.alternatesHit) ? 'pointer' : ''
        const next: Hover | null =
          checkpoint ? { kind: 'checkpoint', index: checkpoint.properties.index }
          : cell ? { kind: 'cell', index: cell.properties.cell }
          : null
        setHover((now) => (now?.kind === next?.kind && now?.index === next?.index ? now : next))
      }),
      map.on('mouseout', () => setHover(null)),
    ]
    return () => subscriptions.forEach((s) => s.unsubscribe())
  }, [map, ready, route, drive, onSelectRoute])

  const moved = useRef(false)
  useEffect(() => {
    if (!map) return
    const subscription = map.on('movestart', (e) => {
      if (e.originalEvent) moved.current = true
    })
    return () => subscription.unsubscribe()
  }, [map])

  function fit(aboveHours: boolean) {
    moved.current = false
    map?.fitBounds(boundsOf(plan), aboveHours ? FIT_ABOVE_HOURS : FIT)
  }

  function changeMetric(next: Metric | null) {
    // Makes room for the hours panel, unless the person has framed the map themselves.
    if (!moved.current && (next === null) !== (metric === null)) fit(next !== null)
    setMetric(next)
  }

  const tip = hoverTip(hover)
  function hoverTip(h: Hover | null) {
    if (h?.kind === 'checkpoint' && route.checkpoints[h.index]) {
      const c = route.checkpoints[h.index]
      return { at: [c.lng, c.lat] as [number, number], body: <CheckpointTip checkpoint={c} /> }
    }
    if (h?.kind === 'cell' && heat.data && hour !== null) {
      const [lat, lng] = heat.data.cells[h.index]
      return { at: [lng, lat] as [number, number], body: <HeatTip heat={heat.data} cell={h.index} hour={hour} /> }
    }
    return null
  }

  return (
    <div className={styles.wrap}>
      <div ref={container} className={styles.map} aria-label="Map of the routes" role="region" />
      {!drawable && <p className={styles.failed}>This browser can’t draw the map. The route strip and checkpoint log below still work.</p>}
      {map && (
        <>
          <Ends map={map} plan={plan} />
          <RouteTags map={map} plan={plan} route={route} onSelect={onSelectRoute} />
          <TruckMarker map={map} track={track} drive={drive} />
          {tip && <Tip map={map} at={tip.at}>{tip.body}</Tip>}
          <button
            type="button"
            className={styles.fit}
            aria-label="Show whole trip"
            title="Show whole trip"
            onClick={() => fit(metric !== null)}
          >
            <Maximize size={17} aria-hidden />
          </button>
        </>
      )}
      <WeatherPanel
        metric={metric}
        onMetric={changeMetric}
        heat={heat.data}
        hour={hour}
        loading={heat.isFetching}
        error={heat.error}
        onRetry={() => heat.refetch()}
        drive={drive}
        departure={Date.parse(plan.departure_time)}
        arrival={Date.parse(route.arrival_time)}
        origin={plan.origin}
      />
    </div>
  )
}

function hasWebGL(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null
}

function boundsOf(plan: Plan): LngLatBounds {
  const bounds = new LngLatBounds()
  for (const route of plan.routes) for (const point of route.geometry) bounds.extend(point)
  return bounds
}

/** A marker whose contents React draws. */
function useMarker(map: MapLibre, options: { anchor?: 'center' | 'bottom'; rotates?: boolean } = {}) {
  const [element] = useState(() => document.createElement('div'))
  const { anchor = 'center', rotates = false } = options
  const [marker] = useState(() => new Marker({ element, anchor, rotationAlignment: rotates ? 'map' : 'viewport' }))
  useEffect(() => {
    marker.setLngLat([0, 0]).addTo(map)
    return () => void marker.remove()
  }, [map, marker])
  return [marker, element] as const
}

function TruckMarker({ map, track, drive }: { map: MapLibre; track: Track; drive: Drive }) {
  const [marker, element] = useMarker(map, { rotates: true })
  const place = useCallback(
    (mile: number) => {
      const { lng, lat, heading } = pointAt(track, mile)
      marker.setLngLat([lng, lat]).setRotation(heading)
    },
    [marker, track],
  )
  useEffect(() => place(drive.mile.get()), [place, drive.mile])
  useMotionValueEvent(drive.mile, 'change', place)
  return createPortal(<TruckTop />, element)
}

function Ends({ map, plan }: { map: MapLibre; plan: Plan }) {
  return (
    <>
      <Sign map={map} at={[plan.origin.lng, plan.origin.lat]}>{placeName(plan.origin.label)}</Sign>
      <Sign map={map} at={[plan.destination.lng, plan.destination.lat]}>{placeName(plan.destination.label)}</Sign>
    </>
  )
}

function Sign({ map, at: [lng, lat], children }: { map: MapLibre; at: [number, number]; children: string }) {
  const [marker, element] = useMarker(map, { anchor: 'bottom' })
  useEffect(() => void marker.setLngLat([lng, lat]), [marker, lng, lat])
  return createPortal(
    <div className={styles.end}>
      <span>{children}</span>
      <i />
    </div>,
    element,
  )
}

/** Names the other routes on the map, where each is farthest from the selected one. */
function RouteTags({ map, plan, route, onSelect }: { map: MapLibre; plan: Plan; route: Route; onSelect: (id: string) => void }) {
  return plan.routes
    .filter((r) => r.id !== route.id)
    .map((r) => <RouteTag key={r.id} map={map} route={r} selected={route} onSelect={onSelect} />)
}

function RouteTag({ map, route, selected, onSelect }: { map: MapLibre; route: Route; selected: Route; onSelect: (id: string) => void }) {
  const [marker, element] = useMarker(map)
  useEffect(() => {
    const mine = buildTrack(route)
    const others = selected.geometry.filter((_, i) => i % 40 === 0)
    let best = { gap: -1, lng: 0, lat: 0 }
    for (let k = 1; k < 20; k++) {
      const p = pointAt(mine, (mine.total * k) / 20)
      const gap = Math.min(...others.map(([lng, lat]) => Math.hypot(lng - p.lng, lat - p.lat)))
      if (gap > best.gap) best = { gap, ...p }
    }
    marker.setLngLat([best.lng, best.lat])
  }, [marker, route, selected])
  return createPortal(
    <button type="button" className={styles.tag} onClick={() => onSelect(route.id)}>
      <strong>{route.name}</strong> {formatDuration(route.duration_min)}
    </button>,
    element,
  )
}

function Tip({ map, at: [lng, lat], children }: { map: MapLibre; at: [number, number]; children: React.ReactNode }) {
  const [element] = useState(() => document.createElement('div'))
  const [popup] = useState(() => new Popup({ closeButton: false, closeOnClick: false, offset: 16, maxWidth: '280px', className: styles.popup }))
  useEffect(() => {
    popup.setDOMContent(element).setLngLat([lng, lat]).addTo(map)
  }, [popup, element, map, lng, lat])
  useEffect(() => () => void popup.remove(), [popup])
  return createPortal(children, element)
}
