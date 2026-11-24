import { useState } from 'react'
import type { Checkpoint, Route } from '../../api/types'
import { RiskSign } from '../../art/RiskSign'
import { riskLabel } from '../../domain/risk'
import { formatTime, formatWeekday, zoneAbbr, zoneFor } from '../../domain/time'
import { checkpointIndexAt } from '../../domain/track'
import type { Drive } from '../../state/useDrive'
import { useDerived } from '../../state/useDerived'
import styles from './CheckpointLog.module.css'

interface Props {
  route: Route
  drive: Drive
}

export function CheckpointLog({ route, drive }: Props) {
  const [riskyOnly, setRiskyOnly] = useState(false)
  const current = useDerived(drive.mile, (mile) => checkpointIndexAt(route, mile))
  const rows = route.checkpoints
    .map((checkpoint, index) => ({ checkpoint, index }))
    .filter(({ checkpoint }) => !riskyOnly || checkpoint.risk !== 'low')
  const riskyCount = route.checkpoints.filter((c) => c.risk !== 'low').length

  return (
    <section className={styles.log}>
      <div className={styles.head}>
        <h2>Checkpoints on {route.name}</h2>
        <label className={styles.filter}>
          <input type="checkbox" checked={riskyOnly} onChange={(e) => setRiskyOnly(e.target.checked)} />
          Only above Low risk ({riskyCount})
        </label>
      </div>
      {rows.length === 0 ?
        <p className={styles.none}>Every checkpoint on {route.name} is Low risk.</p>
      : <div className={styles.scroll}>
          <table>
            <caption className="visually-hidden">Checkpoints on {route.name}</caption>
            <thead>
              <tr>
                <th scope="col">Mile</th>
                <th scope="col">Arrive</th>
                <th scope="col">Risk</th>
                <th scope="col" className={styles.number}>Wind</th>
                <th scope="col" className={styles.number}>Gusts</th>
                <th scope="col" className={styles.number}>Rain</th>
                <th scope="col" className={styles.number}>Snow</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ checkpoint, index }) => (
                <Row
                  key={index}
                  checkpoint={checkpoint}
                  current={index === current}
                  onGo={() => drive.seek(checkpoint.mile, true)}
                />
              ))}
            </tbody>
          </table>
        </div>
      }
    </section>
  )
}

function Row({ checkpoint, current, onGo }: { checkpoint: Checkpoint; current: boolean; onGo: () => void }) {
  const { weather } = checkpoint
  const eta = Date.parse(checkpoint.eta)
  const zone = zoneFor(checkpoint.lat, checkpoint.lng)
  return (
    <tr className={styles.row} aria-current={current ? 'location' : undefined} onClick={onGo}>
      <th scope="row">
        <button type="button" className={styles.mile} aria-label={`Go to mile ${Math.round(checkpoint.mile)}`}>
          {Math.round(checkpoint.mile).toLocaleString('en-US')}
        </button>
      </th>
      <td className={styles.time}>
        {formatWeekday(eta, zone)} {formatTime(eta, zone)} <small>{zoneAbbr(eta, zone)}</small>
      </td>
      <td>
        <span className={styles.risk}>
          <RiskSign risk={checkpoint.risk} size={18} decorative /> {riskLabel(checkpoint.risk)}
        </span>
      </td>
      <td className={styles.number}>{weather ? `${weather.wind_mph} mph` : '–'}</td>
      <td className={styles.number}>{weather?.gust_mph != null ? `${weather.gust_mph} mph` : '–'}</td>
      <td className={styles.number}>{weather ? amount(weather.rain_in_hr) : '–'}</td>
      <td className={styles.number}>{weather ? amount(weather.snow_in_hr) : '–'}</td>
      <td className={styles.why}>{checkpoint.factors.join(', ')}</td>
    </tr>
  )
}

const amount = (inches: number) => (inches === 0 ? '0' : `${inches.toFixed(2)} in`)
