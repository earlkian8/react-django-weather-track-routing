import { Moon, PencilLine, Sun } from 'lucide-react'
import type { Plan } from '../api/types'
import { Brandmark } from '../art/Brandmark'
import { tripTitle } from '../domain/place'
import { formatDay, formatTime, zoneAbbr, zoneFor } from '../domain/time'
import { setTheme, useTheme } from '../state/theme'
import styles from './Header.module.css'

interface Props {
  plan: Plan | null
  onChangeTrip: () => void
}

export function Header({ plan, onChangeTrip }: Props) {
  const theme = useTheme()
  const other = theme === 'day' ? 'night' : 'day'
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <Brandmark />
        <span>Crosswind</span>
      </div>
      {plan ?
        <TripSummary plan={plan} />
      : <p className={styles.tagline}>Compare truck routes by the weather you’d drive through</p>}
      <div className={styles.actions}>
        {plan && (
          <button type="button" className={styles.change} onClick={onChangeTrip}>
            <PencilLine size={17} aria-hidden /> Change trip
          </button>
        )}
        <button
          type="button"
          className={styles.icon}
          aria-label={`Switch to ${other} colors`}
          title={`Switch to ${other} colors`}
          onClick={() => setTheme(other)}
        >
          {other === 'night' ? <Moon size={19} aria-hidden /> : <Sun size={19} aria-hidden />}
        </button>
      </div>
    </header>
  )
}

function TripSummary({ plan }: { plan: Plan }) {
  const leaves = Date.parse(plan.departure_time)
  const zone = zoneFor(plan.origin.lat, plan.origin.lng)
  return (
    <p className={styles.trip}>
      <strong>{tripTitle(plan.origin.label, plan.destination.label)}</strong>
      <span>
        Leaves {formatDay(leaves, zone)} at {formatTime(leaves, zone)} {zoneAbbr(leaves, zone)} with{' '}
        {plan.load_weight_lb === 0 ? 'no load' : `${plan.load_weight_lb.toLocaleString('en-US')} lb`}
      </span>
    </p>
  )
}
