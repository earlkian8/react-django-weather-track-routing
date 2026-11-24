import type { Plan, Route } from '../../api/types'
import { Shield } from '../../art/Shield'
import { describeRisk, riskLabel } from '../../domain/risk'
import { formatDuration, formatTime, zoneFor } from '../../domain/time'
import { riskRuns } from '../../domain/track'
import styles from './RouteList.module.css'

interface Props {
  plan: Plan
  selected: string
  onSelect: (id: string) => void
}

export function RouteList({ plan, selected, onSelect }: Props) {
  const zone = zoneFor(plan.destination.lat, plan.destination.lng)
  return (
    <div role="radiogroup" aria-label="Routes" className={styles.list}>
      {plan.routes.map((route) => (
        <label key={route.id} className={styles.route}>
          <input
            type="radio"
            name="route"
            className="visually-hidden"
            checked={route.id === selected}
            onChange={() => onSelect(route.id)}
          />
          <span className={styles.card}>
            <span className={styles.top}>
              <span className={styles.name}>{route.name}</span>
              <span className={styles.roads}>
                {route.via.map((road) => (
                  <Shield key={road} road={road} size={25} />
                ))}
              </span>
              <span className={styles.duration}>
                {formatDuration(route.duration_min)}
                <small>
                  {Math.round(route.distance_mi).toLocaleString('en-US')} mi, {formatTime(Date.parse(route.arrival_time), zone)}
                </small>
              </span>
            </span>
            <Ribbon route={route} />
            <span className={styles.bottom}>{describeRisk(route.summary)}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** The route from end to end, colored by the risk on each stretch. */
export function Ribbon({ route }: { route: Route }) {
  return (
    <span className={styles.ribbon} aria-hidden>
      {riskRuns(route).map((run) => (
        <span
          key={run.from}
          title={`${riskLabel(run.risk)}, mile ${Math.round(run.from)} to ${Math.round(run.to)}`}
          data-risk={run.risk}
          style={{ flexGrow: run.to - run.from, background: `var(--risk-${run.risk})` }}
        />
      ))}
    </span>
  )
}
