import { CloudHail, CloudOff, LoaderCircle, Snowflake, Umbrella, Wind } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, type PointerEvent } from 'react'
import { ApiError } from '../../api/client'
import type { Heatmap, Place } from '../../api/types'
import { hourSummaries, type Metric } from '../../domain/heat'
import { RISKS, riskLabel } from '../../domain/risk'
import { formatTime, formatWeekday, zoneAbbr, zoneFor } from '../../domain/time'
import type { Drive } from '../../state/useDrive'
import styles from './WeatherPanel.module.css'

const HOUR = 3_600_000

const OPTIONS: { metric: Metric | null; label: string; Icon: typeof Wind }[] = [
  { metric: null, label: 'Off', Icon: CloudOff },
  { metric: 'risk', label: 'Risk', Icon: CloudHail },
  { metric: 'wind', label: 'Wind', Icon: Wind },
  { metric: 'rain', label: 'Rain', Icon: Umbrella },
  { metric: 'snow', label: 'Snow', Icon: Snowflake },
]

/** What a full-size dot stands for. */
const FULL_DOT: Record<Exclude<Metric, 'risk'>, string> = { wind: '55 mph', rain: '1 in/hr', snow: '3 in/hr' }

interface Props {
  metric: Metric | null
  onMetric: (metric: Metric | null) => void
  heat: Heatmap | undefined
  hour: number | null
  loading: boolean
  error: Error | null
  onRetry: () => void
  drive: Drive
  departure: number
  arrival: number
  origin: Place
}

export function WeatherPanel({ metric, onMetric, loading, error, onRetry, ...rest }: Props) {
  const expired = error instanceof ApiError && error.status === 404
  return (
    <>
      <div className={styles.layers} role="radiogroup" aria-label="Weather around the routes">
        {OPTIONS.map(({ metric: option, label, Icon }) => (
          <label key={label}>
            <input type="radio" name="layer" className="visually-hidden" checked={metric === option} onChange={() => onMetric(option)} />
            <span>
              {loading && option === metric && option ? <LoaderCircle size={17} className={styles.spin} aria-hidden /> : <Icon size={17} aria-hidden />}
              {label}
            </span>
          </label>
        ))}
      </div>
      <AnimatePresence>
        {metric && error && !loading && (
          <motion.div key="error" role="alert" className={styles.notice} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p>{expired ? 'This plan is over an hour old, so its weather map is gone. Change the trip to plan it again.' : error.message}</p>
            {!expired && <button type="button" onClick={onRetry}>Try again</button>}
          </motion.div>
        )}
        {metric && rest.heat && (
          <motion.div
            key="hours"
            className={styles.hours}
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Hours {...rest} heat={rest.heat} metric={metric} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

type HoursProps = Omit<Props, 'onMetric' | 'loading' | 'error' | 'onRetry' | 'heat' | 'metric'> & { heat: Heatmap; metric: Metric }

/** Two days of hours. Each column is the share of the mapped area above Low risk. */
function Hours({ heat, metric, hour, drive, departure, arrival, origin }: HoursProps) {
  const summaries = useMemo(() => hourSummaries(heat), [heat])
  const start = Date.parse(heat.start)
  const zone = zoneFor(origin.lat, origin.lng)
  const timeAt = (index: number) => start + index * HOUR
  const last = heat.hours - 1

  function pick(index: number) {
    drive.setClock(timeAt(Math.min(last, Math.max(0, index))))
  }

  function pickAt(event: PointerEvent<HTMLElement>) {
    const { left, width } = event.currentTarget.getBoundingClientRect()
    pick(Math.floor(((event.clientX - left) / width) * heat.hours))
  }

  const shown = hour === null ? null : `${formatWeekday(timeAt(hour), zone)} ${formatTime(timeAt(hour), zone)} ${zoneAbbr(timeAt(hour), zone)}`
  return (
    <>
      <p className={styles.caption}>
        <strong>{shown ?? 'Past the two days mapped'}</strong>
        <span>
          {metric === 'risk' ?
            <>Columns show how much of the area is above Low risk</>
          : <>A full dot is {FULL_DOT[metric]} or more</>}
        </span>
      </p>
      <div
        className={styles.columns}
        role="slider"
        tabIndex={0}
        aria-label="Hour of the weather map"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={hour ?? last}
        aria-valuetext={shown ? `${shown}, worst ${riskLabel(summaries[hour!].worst)}` : 'Past the two days mapped'}
        onKeyDown={(e) => {
          const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]
          if (!step) return
          e.preventDefault()
          pick((hour ?? last) + step)
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture?.(e.pointerId)
          pickAt(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons === 1) pickAt(e)
        }}
      >
        {summaries.map((summary, i) => {
          const onTrip = timeAt(i) >= departure - HOUR && timeAt(i) <= arrival + HOUR
          const midnight = new Date(timeAt(i)).toLocaleString('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: zone }) === '00'
          return (
            <span key={i} className={styles.column} data-current={i === hour} data-trip={onTrip} title={`Worst: ${riskLabel(summary.worst)}`}>
              <span className={styles.stack}>
                {RISKS.slice(1).map(
                  (risk) =>
                    summary.shares[risk.level] > 0 && (
                      <i key={risk.key} style={{ height: `${Math.max(6, summary.shares[risk.level] * 100)}%`, background: `var(--risk-${risk.key})` }} />
                    ),
                )}
              </span>
              {midnight && i < last - 2 && <em>{formatWeekday(timeAt(i), zone)}</em>}
            </span>
          )
        })}
      </div>
    </>
  )
}
