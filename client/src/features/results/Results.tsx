import { motion } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import type { Plan } from '../../api/types'
import { buildTrack } from '../../domain/track'
import { useDrive } from '../../state/useDrive'
import { DriveStrip } from '../strip/DriveStrip'
import { CheckpointLog } from './CheckpointLog'
import { RiskGuide } from './RiskGuide'
import { RouteList } from './RouteList'
import { Verdict } from './Verdict'
import styles from './Results.module.css'

// The map library is most of the bundle, and the planner doesn't need it.
const RouteMap = lazy(() => import('../map/RouteMap'))

export function Results({ plan }: { plan: Plan }) {
  const [routeId, setRouteId] = useState(plan.recommended_route_id)
  const route = plan.routes.find((r) => r.id === routeId)!
  const track = useMemo(() => buildTrack(route), [route])
  const drive = useDrive(track)

  return (
    <motion.main className={styles.results} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
      <div className={styles.workspace}>
        <aside className={styles.side} aria-label="Recommendation and routes">
          <Verdict plan={plan} />
          <RouteList plan={plan} selected={routeId} onSelect={setRouteId} />
          <RiskGuide />
        </aside>
        <div className={styles.map}>
          <Suspense fallback={null}>
            <RouteMap plan={plan} route={route} track={track} drive={drive} onSelectRoute={setRouteId} />
          </Suspense>
        </div>
      </div>
      <DriveStrip route={route} track={track} drive={drive} />
      <CheckpointLog route={route} drive={drive} />
    </motion.main>
  )
}
