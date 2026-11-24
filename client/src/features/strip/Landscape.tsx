import { memo, useId, useMemo, type CSSProperties } from 'react'
import type { Route } from '../../api/types'
import { RiskSign } from '../../art/RiskSign'
import { Windsock } from '../../art/Windsock'
import { hourTicks, mileStep, pickWindsocks, precipRuns, skyColor, type PrecipRun, type RoadSample } from '../../domain/strip'
import { solarElevation, sunCrossings } from '../../domain/sun'
import { zoneAbbr } from '../../domain/time'
import { riskRuns, type RiskRun, type Track } from '../../domain/track'
import styles from './DriveStrip.module.css'

export const ROAD_Y = 112
const ROAD_HEIGHT = 30
const RIBBON_HEIGHT = 9
const AXIS_Y = ROAD_Y + ROAD_HEIGHT + RIBBON_HEIGHT
export const HEIGHT = AXIS_Y + 53

const WINDSOCK_SPACING_PX = 52
const TICK_SPACING_PX = 62
const LABEL_PX = 46
const HOUR_STEPS = [1, 2, 3, 4, 6, 12, 24]
const NIGHT = -8

interface Props {
  route: Route
  track: Track
  points: RoadSample[]
  width: number
  pad: number
  moving: boolean
}

export const Landscape = memo(function Landscape({ route, track, points, width, pad, moving }: Props) {
  const id = useId()
  const road = Math.max(width - 2 * pad, 1)
  const at = (mile: number) => pad + (mile / track.total) * road

  const sky = useMemo(() => points.map((p) => ({ ...p, sun: solarElevation(p.time, p.lat, p.lng) })), [points])
  const runs = useMemo(() => riskRuns(route), [route])
  const wet = useMemo(() => precipRuns(route), [route])
  const suns = useMemo(() => sunCrossings(points), [points])
  const socks = pickWindsocks(route.checkpoints, (WINDSOCK_SPACING_PX / road) * track.total)
  /** Where a stretch's risk sign stands: at its start, or just past a windsock there. */
  const signX = (run: RiskRun) => {
    const x = at(run.from) + 10
    const sock = socks.find((c) => Math.abs(at(c.mile) - x) < 14)
    return sock ? Math.min(at(sock.mile) + 16, Math.max(x, at(run.to) - 8)) : x
  }
  const hours = (points.at(-1)!.time - points[0].time) / 3_600_000
  const every = HOUR_STEPS.find((step) => (step / hours) * road >= TICK_SPACING_PX) ?? 24
  const ticks = hourTicks(track, points, every, (LABEL_PX / road) * track.total)
  const step = mileStep(track.total, road)
  const plates = Array.from({ length: Math.floor(track.total / step) }, (_, i) => (i + 1) * step).filter(
    (mile) => at(track.total) - at(mile) > 46,
  )
  const zoneChanges = points.filter((p, i) => i > 0 && p.zone !== points[i - 1].zone && zoneAbbr(p.time, p.zone) !== zoneAbbr(p.time, points[i - 1].zone))

  return (
    <svg className={styles.landscape} width={width} height={HEIGHT} aria-hidden data-moving={moving}>
      <defs>
        <linearGradient id={`${id}sky`} gradientUnits="userSpaceOnUse" x1={pad} x2={pad + road} y1="0" y2="0">
          {sky.map((p) => (
            <stop key={p.mile} offset={p.mile / track.total} stopColor={skyColor(p.sun)} />
          ))}
        </linearGradient>
        <linearGradient id={`${id}glow`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0.35" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.16" />
        </linearGradient>
        <pattern id={`${id}hatch`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="7" height="7" fill="var(--line)" />
          <rect width="3" height="7" fill="var(--risk-unknown)" />
        </pattern>
      </defs>

      <rect width={width} height={ROAD_Y} fill={`url(#${id}sky)`} />
      <rect width={width} height={ROAD_Y} fill={`url(#${id}glow)`} />
      <Stars sky={sky} at={at} />
      {wet.map((run) => (
        <Weather key={run.from} run={run} at={at} />
      ))}

      {suns.map((event) => (
        <g key={event.mile} transform={`translate(${at(event.mile)} ${ROAD_Y - 3})`}>
          <path d="M-13 0a13 13 0 0 1 26 0Z" fill="#ffd27a" />
          <path d="M-20 0h40" stroke="#ffe9bd" strokeWidth="2" />
          <text className={styles.sunLabel} y={40 - ROAD_Y} textAnchor="middle">
            {event.kind === 'sunset' ? 'Sunset' : 'Sunrise'}
          </text>
        </g>
      ))}

      <rect y={ROAD_Y - 3} width={width} height="3" fill="#6f7f4f" />
      {socks.map((c) => (
        <g key={c.mile} transform={`translate(${at(c.mile)} ${ROAD_Y - 41})`}>
          <Windsock mph={c.weather!.wind_mph} />
        </g>
      ))}

      <rect y={ROAD_Y} width={width} height={ROAD_HEIGHT} fill="var(--asphalt)" />
      <path d={`M0 ${ROAD_Y + 3}H${width}`} stroke="#f4f5ef" strokeWidth="1.500" />
      <path d={`M0 ${ROAD_Y + ROAD_HEIGHT - 4}H${width}`} stroke="#ffc629" strokeWidth="2" />
      <path d={`M0 ${ROAD_Y + 15}H${width}`} stroke="#f4f5ef" strokeWidth="1.500" strokeDasharray="13 19" opacity="0.75" />

      {runs.map((run, i) => (
        <rect
          key={run.from}
          x={at(run.from) + (i > 0 ? 1 : 0)}
          y={ROAD_Y + ROAD_HEIGHT}
          width={Math.max(2, at(run.to) - at(run.from) - (i > 0 ? 1 : 0))}
          height={RIBBON_HEIGHT}
          fill={run.risk === 'unknown' ? `url(#${id}hatch)` : `var(--risk-${run.risk})`}
        />
      ))}
      {runs
        .filter((run) => run.risk !== 'low' && at(run.to) - at(run.from) >= 13)
        .map((run) => (
          <g key={run.from} transform={`translate(${signX(run)} 0)`}>
            <path d={`M0 ${ROAD_Y - 18}V${ROAD_Y}`} stroke="#59656a" strokeWidth="2" />
            <svg x="-10" y={ROAD_Y - 36} width="20" height="20" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="12" fill="#fff" opacity="0.9" />
              <svg x="1.500" y="1.500" width="21" height="21">
                <RiskSign risk={run.risk} size={21} decorative />
              </svg>
            </svg>
          </g>
        ))}

      <g transform={`translate(0 ${AXIS_Y})`}>
        {plates.map((mile) => (
          <g key={mile} transform={`translate(${at(mile)} 0)`}>
            <path d="M0 0v7" stroke="var(--line-strong)" strokeWidth="1.500" />
            <rect x="-19" y="7" width="38" height="18" rx="3" fill="var(--sign)" />
            <text className={styles.plate} y="20.500" textAnchor="middle">{mile.toLocaleString('en-US')}</text>
          </g>
        ))}
        <text className={styles.axisName} x={pad - 10} y="20" textAnchor="end">Mile</text>
        {ticks.map((tick) => (
          <text key={`${tick.mile}${tick.label}`} className={styles.tick} x={at(tick.mile)} y="44" textAnchor="middle" data-day={!/\d/.test(tick.label)}>
            {tick.label}
          </text>
        ))}
        {zoneChanges.map((p) => (
          <g key={p.mile} transform={`translate(${at(p.mile)} 0)`}>
            <path d={`M0 ${-AXIS_Y}V${-AXIS_Y + ROAD_Y}M0 28v24`} stroke="#fff" strokeDasharray="3 4" opacity="0.7" />
            <text className={styles.sunLabel} x="5" y={-AXIS_Y + 18}>{zoneAbbr(p.time, p.zone)}</text>
          </g>
        ))}
      </g>
    </svg>
  )
})

/** Repeatable scatter from 0 to 1. */
function noise(i: number, k: number): number {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return v - Math.floor(v)
}

type SkyPoint = RoadSample & { sun: number }

function Stars({ sky, at }: { sky: SkyPoint[]; at: (mile: number) => number }) {
  return (
    <g fill="#e6eef6">
      {sky.flatMap((p, i) =>
        p.sun > NIGHT ? [] : [0, 1, 2].map((k) => (
          <circle key={`${i}${k}`} cx={at(p.mile) + noise(i, k) * 16} cy={4 + noise(i, k + 7) * 84} r={0.5 + noise(i, k + 3) ** 3 * 1.2} opacity={Math.min(1, (NIGHT - p.sun) / 8) * (0.35 + noise(i, k + 5) * 0.5)} />
        )),
      )}
    </g>
  )
}

/** Cloud where rain or snow is forecast, with more and heavier fall as amounts rise. */
function Weather({ run, at }: { run: PrecipRun; at: (mile: number) => number }) {
  const left = at(run.from)
  const right = at(run.to)
  const worst = Math.min(1, Math.max(...run.parts.map((p) => Math.max(p.rain / 0.5, p.snow / 2))))
  const gray = (light: number) => `rgb(${light - 12}, ${light}, ${light + 8})`
  return (
    <g>
      {run.parts.map((part) => (
        <Fall key={part.from} from={at(part.from)} to={at(part.to)} rain={part.rain} snow={part.snow} />
      ))}
      <Puffs left={left - 14} right={right + 14} spacing={21} y={4} size={17} seed={1} fill={gray(205 - worst * 70)} />
      <Puffs left={left} right={right} spacing={17} y={12} size={12} seed={2} fill={gray(165 - worst * 75)} />
    </g>
  )
}

interface PuffsProps {
  left: number
  right: number
  spacing: number
  y: number
  size: number
  seed: number
  fill: string
}

function Puffs({ left, right, spacing, y, size, seed, fill }: PuffsProps) {
  const count = Math.max(2, Math.ceil((right - left) / spacing))
  return (
    <g fill={fill}>
      {Array.from({ length: count + 1 }, (_, i) => {
        // Puffs shrink and rise toward both ends, so the cloud has no square edge.
        const edge = Math.min(1, (Math.min(i, count - i) + 0.7) / 2.5)
        const r = size * edge * (0.8 + noise(i, seed) * 0.5)
        return <circle key={i} cx={left + ((right - left) * i) / count} cy={y * edge + noise(i, seed + 9) * 5} r={r} />
      })}
    </g>
  )
}

function Fall({ from, to, rain, snow }: { from: number; to: number; rain: number; snow: number }) {
  const top = 28
  const depth = ROAD_Y - top - 3
  const snowing = snow > 0
  const strength = Math.min(1, Math.max(0.12, snowing ? snow / 2 : rain / 0.6))
  const gap = 15 - strength * 10
  const count = Math.max(2, Math.floor((to - from) / gap))
  const rainDash = [6 + strength * 9, 22 - strength * 8]
  const snowDash = 15 - strength * 4
  // Whole dash periods, so the loop has no jump.
  const travel = (period: number) => ({ '--travel': `${-period * 3}px` }) as CSSProperties
  const columns = Array.from({ length: count }, (_, i) => from + ((i + 0.2 + noise(i, 4) * 0.6) * (to - from)) / count)
  return (
    <g>
      <rect x={from} y={top - 4} width={to - from} height={depth + 4} fill={snowing ? '#e8eef4' : '#3d5d78'} opacity={0.07 + strength * 0.16} />
      {rain > 0 && (
        <path
          className={styles.rain}
          d={columns.map((x) => `M${x + 5} ${top}l-9 ${depth}`).join('')}
          stroke="#d9e9f5"
          strokeWidth={1 + strength * 0.9}
          strokeDasharray={rainDash.join(' ')}
          style={travel(rainDash[0] + rainDash[1])}
          opacity={0.55 + strength * 0.35}
        />
      )}
      {snowing && (
        <path
          className={styles.snow}
          d={columns.map((x, i) => `M${x} ${top + noise(i, 6) * 18}q${4 - noise(i, 8) * 8} ${depth / 2} ${i % 2 ? 3 : -3} ${depth - 14}`).join('')}
          fill="none"
          stroke="#fff"
          strokeLinecap="round"
          strokeWidth={2.2 + strength * 1.6}
          strokeDasharray={`0 ${snowDash}`}
          style={travel(snowDash)}
        />
      )}
    </g>
  )
}
