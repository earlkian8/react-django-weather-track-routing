import { CircleHelp } from 'lucide-react'
import { motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import type { Plan } from '../../api/types'
import { Shield } from '../../art/Shield'
import { placeName } from '../../domain/place'
import { formatMiles } from '../../domain/risk'
import { formatDuration, formatTime, formatWeekday, zoneAbbr, zoneFor } from '../../domain/time'
import styles from './Verdict.module.css'

/** The recommendation, as the guide sign you'd follow. */
export function Verdict({ plan }: { plan: Plan }) {
  const best = plan.routes.find((r) => r.id === plan.recommended_route_id)!
  const arrival = Date.parse(best.arrival_time)
  const zone = zoneFor(plan.destination.lat, plan.destination.lng)
  const { unknown_miles } = best.summary
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus({ preventScroll: true }), [])
  return (
    <section>
      <motion.div
        className={styles.sign}
        initial={{ y: -26, rotateX: 28, opacity: 0 }}
        animate={{ y: 0, rotateX: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 170, damping: 15, delay: 0.25 }}
      >
        <div className={styles.top}>
          <h1 ref={heading} tabIndex={-1} className={styles.take}>
            {plan.advisory ? 'Best available:' : 'Take'} {best.name}
          </h1>
          <div className={styles.roads}>
            {best.via.map((road) => (
              <Shield key={road} road={road} size={42} />
            ))}
          </div>
        </div>
        <p className={styles.destination}>
          <span>{placeName(plan.destination.label)}</span>
          <span>{Math.round(best.distance_mi).toLocaleString('en-US')}</span>
        </p>
        <p className={styles.arrival}>
          {formatDuration(best.duration_min)}, arriving {formatWeekday(arrival, zone)} {formatTime(arrival, zone)} {zoneAbbr(arrival, zone)}
        </p>
      </motion.div>

      {plan.advisory && (
        <div role="alert" className={styles.advisory}>
          <p>{plan.advisory}</p>
        </div>
      )}
      <p className={styles.reason}>{plan.recommendation}</p>
      {unknown_miles > 0 && (
        <p className={styles.unknown}>
          <CircleHelp size={17} aria-hidden />
          {formatMiles(unknown_miles)} of {best.name} have no forecast, so this pick is less certain.
        </p>
      )}
    </section>
  )
}
