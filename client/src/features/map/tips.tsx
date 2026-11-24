import type { Checkpoint, Heatmap } from '../../api/types'
import { RiskSign } from '../../art/RiskSign'
import { riskForLevel, riskLabel } from '../../domain/risk'
import { formatTime, formatWeekday, zoneAbbr, zoneFor } from '../../domain/time'
import styles from './tips.module.css'

export function CheckpointTip({ checkpoint: c }: { checkpoint: Checkpoint }) {
  const zone = zoneFor(c.lat, c.lng)
  const eta = Date.parse(c.eta)
  return (
    <div className={styles.tip}>
      <p className={styles.head}>
        <RiskSign risk={c.risk} size={20} decorative /> {riskLabel(c.risk)} at mile {Math.round(c.mile).toLocaleString('en-US')}
      </p>
      <p>
        Arrives {formatWeekday(eta, zone)} {formatTime(eta, zone)} {zoneAbbr(eta, zone)}
      </p>
      {c.weather && <Amounts wind={c.weather.wind_mph} rain={c.weather.rain_in_hr} snow={c.weather.snow_in_hr} />}
      {c.factors.map((factor) => (
        <p key={factor} className={styles.factor}>{factor}</p>
      ))}
    </div>
  )
}

export function HeatTip({ heat, cell, hour }: { heat: Heatmap; cell: number; hour: number }) {
  const [lat, lng] = heat.cells[cell]
  const zone = zoneFor(lat, lng)
  const time = Date.parse(heat.start) + hour * 3_600_000
  const risk = riskForLevel(heat.risk[cell][hour])
  const [wind, rain, snow] = [heat.wind, heat.rain, heat.snow].map((grid) => grid[cell][hour])
  return (
    <div className={styles.tip}>
      <p className={styles.head}>
        <RiskSign risk={risk} size={20} decorative /> {riskLabel(risk)}
      </p>
      <p>
        {formatWeekday(time, zone)} {formatTime(time, zone)} {zoneAbbr(time, zone)}
      </p>
      {wind !== null && rain !== null && snow !== null && <Amounts wind={wind} rain={rain} snow={snow} />}
    </div>
  )
}

function Amounts({ wind, rain, snow }: { wind: number; rain: number; snow: number }) {
  return (
    <dl className={styles.amounts}>
      <div><dt>Wind</dt><dd>{wind} mph</dd></div>
      <div><dt>Rain</dt><dd>{rain.toFixed(2)} in/hr</dd></div>
      <div><dt>Snow</dt><dd>{snow.toFixed(2)} in/hr</dd></div>
    </dl>
  )
}
