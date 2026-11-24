import { Pause, Play, Snowflake, Umbrella, Wind } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Route } from '../../api/types'
import { RiskSign } from '../../art/RiskSign'
import { riskLabel } from '../../domain/risk'
import { formatTime, formatWeekday, zoneAbbr, zoneFor } from '../../domain/time'
import { etaAt, pointAt, type Track } from '../../domain/track'
import type { Drive } from '../../state/useDrive'
import { useDerived } from '../../state/useDerived'
import styles from './Readout.module.css'

interface Props {
  route: Route
  track: Track
  drive: Drive
  index: number
}

/** What the cab sees where the truck is. */
export function Readout({ route, track, drive, index }: Props) {
  const mile = useDerived(drive.mile, Math.round)
  const here = pointAt(track, mile)
  const eta = etaAt(track, mile)
  const zone = zoneFor(here.lat, here.lng)
  const { weather, risk, factors } = route.checkpoints[index]
  return (
    <div className={styles.readout}>
      <button type="button" className={styles.play} onClick={drive.toggle} aria-label={drive.playing ? 'Pause' : `Drive ${route.name}`}>
        {drive.playing ? <Pause size={20} fill="currentColor" aria-hidden /> : <Play size={20} fill="currentColor" aria-hidden />}
      </button>
      <p className={styles.where}>
        <strong>Mile {mile.toLocaleString('en-US')}</strong>
        <span>
          {formatWeekday(eta, zone)} {formatTime(eta, zone)} {zoneAbbr(eta, zone)}
        </span>
      </p>
      {weather ?
        <dl className={styles.weather}>
          <Reading icon={<Wind size={18} aria-hidden />} name="Wind">
            {weather.wind_mph} <small>mph{weather.gust_mph !== null && `, gusts ${weather.gust_mph}`}</small>
          </Reading>
          <Reading icon={<Umbrella size={18} aria-hidden />} name="Rain">
            {weather.rain_in_hr.toFixed(2)} <small>in/hr</small>
          </Reading>
          <Reading icon={<Snowflake size={18} aria-hidden />} name="Snow">
            {weather.snow_in_hr.toFixed(2)} <small>in/hr</small>
          </Reading>
        </dl>
      : <p className={styles.none}>No forecast for this stretch</p>}
      <p className={styles.risk}>
        <RiskSign risk={risk} size={24} decorative />
        <strong>{riskLabel(risk)}</strong>
        {factors.length > 0 && <span>{factors.join(', ')}</span>}
      </p>
    </div>
  )
}

function Reading({ icon, name, children }: { icon: ReactNode; name: string; children: ReactNode }) {
  return (
    <div>
      <dt>
        {icon} {name}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}
