import { motion, useTransform } from 'motion/react'
import { useMemo, type KeyboardEvent, type PointerEvent } from 'react'
import type { Route } from '../../api/types'
import { Truck } from '../../art/Truck'
import { riskLabel } from '../../domain/risk'
import { waypoints } from '../../domain/strip'
import { solarElevation } from '../../domain/sun'
import { formatTime, zoneAbbr, zoneFor } from '../../domain/time'
import { checkpointIndexAt, etaAt, pointAt, type Track } from '../../domain/track'
import type { Drive } from '../../state/useDrive'
import { useDerived } from '../../state/useDerived'
import { Landscape, ROAD_Y } from './Landscape'
import { Readout } from './Readout'
import { useWidth } from './useWidth'
import styles from './DriveStrip.module.css'

const SAMPLES = 96
const TRUCK_WIDTH = 88
const WHEEL_DEGREES_PER_PX = 14
const DUSK = -3

interface Props {
  route: Route
  track: Track
  drive: Drive
}

/** The route unrolled: the sky, weather and road the truck meets at each mile, at the time it gets there. */
export function DriveStrip({ route, track, drive }: Props) {
  const [box, width] = useWidth<HTMLDivElement>(1000)
  const pad = width < 600 ? 46 : 62
  const road = Math.max(width - 2 * pad, 1)
  const points = useMemo(() => waypoints(track, SAMPLES), [track])

  const x = useTransform(drive.mile, (mile) => pad + (mile / track.total) * road)
  const truckX = useTransform(x, (value) => value - TRUCK_WIDTH / 2)
  const spin = useTransform(x, (value) => value * WHEEL_DEGREES_PER_PX)
  const index = useDerived(drive.mile, (mile) => checkpointIndexAt(route, mile))
  const wholeMile = useDerived(drive.mile, Math.round)
  const dark = useDerived(drive.mile, (mile) => {
    const { lat, lng } = pointAt(track, mile)
    return solarElevation(etaAt(track, mile), lat, lng) < DUSK
  })

  function seekTo(event: PointerEvent<HTMLElement>) {
    const { left } = event.currentTarget.getBoundingClientRect()
    const mile = ((event.clientX - left - pad) / road) * track.total
    drive.seek(Math.min(track.total, Math.max(0, mile)))
  }

  function onKeyDown(event: KeyboardEvent) {
    const here = drive.mile.get()
    const miles = route.checkpoints.map((c) => c.mile)
    const next = {
      ArrowRight: miles.find((m) => m > here + 0.05),
      ArrowUp: miles.find((m) => m > here + 0.05),
      ArrowLeft: miles.findLast((m) => m < here - 0.05),
      ArrowDown: miles.findLast((m) => m < here - 0.05),
      Home: 0,
      End: track.total,
    }[event.key]
    if (next === undefined) return
    event.preventDefault()
    drive.seek(next)
  }

  const mile = Math.min(wholeMile, Math.round(track.total))
  const eta = etaAt(track, wholeMile)
  const { lat, lng } = pointAt(track, wholeMile)
  const zone = zoneFor(lat, lng)
  const risk = route.checkpoints[index].risk

  return (
    <section className={styles.strip} aria-label="Drive along the route">
      <Readout route={route} track={track} drive={drive} index={index} />
      <div
        ref={box}
        className={styles.view}
        role="slider"
        tabIndex={0}
        aria-label="Position along the route"
        aria-valuemin={0}
        aria-valuemax={Math.round(track.total)}
        aria-valuenow={mile}
        aria-valuetext={`Mile ${mile}, ${formatTime(eta, zone)} ${zoneAbbr(eta, zone)}, ${riskLabel(risk)}`}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          seekTo(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) seekTo(e)
        }}
      >
        <Landscape route={route} track={track} points={points} width={width} pad={pad} moving={drive.playing} />
        <motion.div className={styles.cursor} style={{ x }} />
        <motion.div className={styles.truck} style={{ x: truckX, top: ROAD_Y - 11 }}>
          <Truck width={TRUCK_WIDTH} spin={spin} headlights={dark} />
        </motion.div>
      </div>
    </section>
  )
}
