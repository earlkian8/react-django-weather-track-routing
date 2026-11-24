import { animate, useAnimationFrame, useMotionValue, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { drawRoadside, HORIZON, VANISH_X } from './perspective'
import styles from './Scene.module.css'
import { TrailerRear } from './TrailerRear'

const CRUISE = 13 // depth units per second

// Fixed, so the sky never reshuffles.
const STARS = Array.from({ length: 70 }, (_, i) => ({
  x: (i * 397.3) % 1440,
  y: (i * 211.7) % 430,
  r: 0.7 + ((i * 7) % 5) * 0.22,
}))

const RAIN = Array.from({ length: 46 }, (_, i) => ({ x: 985 + i * 11.3, shift: (i * 17) % 44 }))

/** Rings of evening light around the sun, as cut paper. */
const RINGS = [1480, 1270, 1080, 905, 745, 600, 470, 350, 240].map((r, i, all) => {
  const position = ((i + 1) / all.length) * 5
  const step = Math.min(4, Math.floor(position))
  const share = Math.round((position - step) * 100)
  return { r, color: `color-mix(in oklab, var(--sky-${step + 2}) ${share}%, var(--sky-${step + 1}))` }
})

type Puff = [x: number, y: number, r: number]

const CLOUDS: { fill: string; puffs: Puff[] }[] = [
  { fill: 'var(--cloud-1)', puffs: [[1012, 330, 74], [1082, 262, 96], [1180, 206, 112], [1300, 172, 128], [1430, 186, 124], [1570, 190, 150], [1760, 200, 180]] },
  { fill: 'var(--cloud-2)', puffs: [[984, 404, 58], [1056, 362, 80], [1152, 330, 88], [1262, 312, 92], [1376, 306, 104], [1506, 306, 118], [1680, 300, 150]] },
  { fill: 'var(--cloud-3)', puffs: [[1006, 432, 54], [1100, 414, 72], [1206, 404, 70], [1312, 408, 74], [1430, 400, 90], [1570, 396, 104], [1740, 390, 130]] },
]
const CLOUD_BASE = 484

const start = drawRoadside(0)

/** A driver's view down the highway toward a storm. The road moves while `driving`. */
export function Scene({ driving }: { driving: boolean }) {
  const still = useReducedMotion()
  const speed = useMotionValue(0)
  const travelled = useRef(0)
  const dashes = useRef<SVGPathElement>(null)
  const poles = useRef<SVGPathElement>(null)
  const wires = useRef<SVGPathElement>(null)
  const posts = useRef<SVGPathElement>(null)
  const reflectors = useRef<SVGPathElement>(null)
  const trailer = useRef<SVGGElement>(null)

  useEffect(() => {
    const controls = animate(speed, driving && !still ? CRUISE : 0, { duration: driving ? 1.2 : 0.8, ease: 'easeInOut' })
    return () => controls.stop()
  }, [driving, still, speed])

  useAnimationFrame((time, delta) => {
    if (speed.get() < 0.01) return
    travelled.current += (speed.get() * Math.min(delta, 50)) / 1000
    const d = drawRoadside(travelled.current)
    dashes.current?.setAttribute('d', d.dashes)
    poles.current?.setAttribute('d', d.poles)
    wires.current?.setAttribute('d', d.wires)
    posts.current?.setAttribute('d', d.posts)
    reflectors.current?.setAttribute('d', d.reflectors)
    trailer.current?.setAttribute('transform', `translate(0 ${Math.sin(time / 70) * 0.8 + Math.sin(time / 410) * 1.1})`)
  })

  return (
    <svg className={styles.scene} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <clipPath id="scene-sky"><path d={`M-600-900h2640v${900 + HORIZON}H-600Z`} /></clipPath>
        <linearGradient id="scene-rain" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--rain)" stopOpacity="0.9" />
          <stop offset="1" stopColor="var(--rain)" stopOpacity="0.25" />
        </linearGradient>
        <linearGradient id="scene-beam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#fff2c8" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff2c8" stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect x="-600" y="-900" width="2640" height="1800" fill="var(--sky-1)" />
      <g clipPath="url(#scene-sky)">
        {RINGS.map(({ r, color }) => (
          <circle key={r} cx="330" cy="600" r={r} fill={color} />
        ))}
        <g fill="#e9f1f4" opacity="var(--stars)">
          {STARS.map((s) => <circle key={s.x} cx={s.x} cy={s.y} r={s.r} />)}
        </g>
        <circle cx="330" cy="560" r="74" fill="var(--sun)" />
        <Storm />
      </g>

      <path fill="var(--ridge-1)" d={`M-600 ${HORIZON}V606l120-10 150 8 90-30h210l26 22 90 6 60-46h140l30 40 130 10 70-18 150 14 90-34h120l44 30 140 8 110-20 180 18 150-12 190 14V${HORIZON}Z`} />
      <path fill="var(--ridge-2)" d={`M-600 ${HORIZON}v-22l220-4 60-34h160l40 30 170 8 140 10 150-6 110 4 60 6 180-8 70-40h190l46 36 170 12 220-6 254 8v14Z`} />
      <path fill="var(--ridge-3)" d={`M-600 ${HORIZON}v-8l300-6 190 8 160-10 210 10 190-4 200 6 170-10 260 8 220-10 340 10v6Z`} />

      <rect x="-600" y={HORIZON} width="2640" height="300" fill="var(--plain)" />
      <Fields />
      <path d={`M${VANISH_X} ${HORIZON}-260 900h1960Z`} fill="var(--verge)" />
      <path d={`M${VANISH_X} ${HORIZON} 110 900h1220Z`} fill="var(--road)" />
      <path d={`M${VANISH_X} ${HORIZON} 110 900h62Z`} fill="var(--road-2)" />
      <path d={`M${VANISH_X} ${HORIZON} 1268 900h62Z`} fill="var(--road-2)" />
      <path d={`M${VANISH_X} ${HORIZON} 178 900h15Z`} fill="var(--yellow)" />
      <path d={`M${VANISH_X} ${HORIZON} 1247 900h15Z`} fill="var(--paint)" />
      <path ref={dashes} d={start.dashes} fill="var(--paint)" />

      <path ref={wires} d={start.wires} fill="none" stroke="var(--pole)" strokeWidth="1.300" />
      <path ref={poles} d={start.poles} fill="var(--pole)" />
      <path ref={posts} d={start.posts} fill="var(--paint)" />
      <path ref={reflectors} d={start.reflectors} fill="#ffc629" />

      <path d="M380 900 690 640h130L1250 900Z" fill="url(#scene-beam)" opacity="var(--beam)" />
      <g ref={trailer}><TrailerRear x={806} y={724} width={118} /></g>
    </svg>
  )
}

function Storm() {
  return (
    <g>
      <path d="M1010 478h900v150H900Z" fill="url(#scene-rain)" opacity="0.62" />
      <path d="M1210 478h900v150h-960Z" fill="url(#scene-rain)" opacity="0.6" />
      <g className={styles.rain} stroke="var(--cloud-1)" strokeWidth="1.600" strokeDasharray="16 28" opacity="0.5">
        {RAIN.map(({ x, shift }) => <path key={x} d={`M${x} ${478 - shift}l-62 ${150 + shift}`} />)}
      </g>
      <path className={styles.flash} d="m1166 486-30 56h22l-26 60 62-78h-25l29-38Z" fill="#fff6cf" />
      <path fill="var(--cloud-1)" d="M862 158c-24-14 20-34 60-42 80-18 160-28 250-30h900v170h-940c-110-12-200-40-270-98Z" opacity="0.75" />
      {CLOUDS.map(({ fill, puffs }) => (
        <g key={fill} fill={fill}>
          {puffs.map(([x, y, r]) => <circle key={x} cx={x} cy={y} r={r} />)}
          <path d={`M${puffs[0][0]} ${puffs[0][1]}H2100V${CLOUD_BASE}H${puffs[0][0] + 10}Z`} />
        </g>
      ))}
      <path fill="var(--cloud-4)" d="M930 478c-26-4-26-26 4-28 40-4 70 6 110 0 60-8 96 8 150 2 70-10 120 8 190 0 70-8 130 6 200 0h520v42H1010c-26 0-58-10-80-16Z" />
    </g>
  )
}

function Fields() {
  const rows = [-5200, -3900, -2900, -2150, -1600, 1600, 2150, 2900, 3900, 5200]
  return (
    <g>
      {rows.map((x, i) => (
        <path key={x} d={`M${VANISH_X} ${HORIZON} ${VANISH_X + x} 900h${Math.abs(x) * 0.16}Z`} fill={i % 2 ? 'var(--plain-2)' : 'var(--plain-3)'} />
      ))}
      <path d={`M-600 ${HORIZON}h2640v7H-600Z`} fill="var(--plain-2)" />
    </g>
  )
}
